import {
  ExamCloze,
  ExamItem,
  ExamPart,
  ExamPartSpec,
  ExamPassage,
  ExamSentence,
  LevelContent,
  StorySentence,
} from '../types/card';

/** Levels that have stories and mock exams so far. */
export const LEARN_LEVELS = ['HSK 1', 'HSK 2'] as const;
export type LearnLevel = (typeof LEARN_LEVELS)[number];

/**
 * Exam blueprints follow the HSK 3.0 structure for each level: 40 questions for HSK 1
 * (20 listening, 20 reading) and 60 for HSK 2 (35 listening, 25 reading). Minutes are the
 * listening and reading times from the same published structure.
 */
export const EXAM_SPECS: Record<LearnLevel, ExamPartSpec[]> = {
  'HSK 1': [
    { part: 'listening', label: 'Audição', count: 20, minutes: 15 },
    { part: 'reading', label: 'Leitura', count: 20, minutes: 17 },
  ],
  'HSK 2': [
    { part: 'listening', label: 'Audição', count: 35, minutes: 25 },
    { part: 'reading', label: 'Leitura', count: 25, minutes: 22 },
  ],
};

const levelContentLoaders: Record<LearnLevel, () => Promise<LevelContent>> = {
  'HSK 1': () => import('../data/learn/hsk1.json').then((m) => m.default as LevelContent),
  'HSK 2': () => import('../data/learn/hsk2.json').then((m) => m.default as LevelContent),
};

export function loadLevelContent(level: LearnLevel): Promise<LevelContent> {
  return levelContentLoaders[level]();
}

/** Small seeded generator, so one exam can be replayed from its seed. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Shuffles the options and keeps track of where the right one ends up. */
function withShuffledOptions(
  options: string[],
  answer: number,
  rng: () => number
): { options: string[]; answer: number } {
  const order = shuffle(options.map((_, i) => i), rng);
  return { options: order.map((i) => options[i]), answer: order.indexOf(answer) };
}

const STOP_WORDS = new Set([
  'eu', 'você', 'voce', 'ele', 'ela', 'nós', 'nos', 'eles', 'elas', 'um', 'uma', 'uns', 'umas', 'o', 'a', 'os', 'as',
  'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas', 'para', 'com', 'por', 'que', 'é', 'e', 'está',
  'são', 'estão', 'tem', 'tenho', 'meu', 'minha', 'seu', 'sua', 'ao', 'à', 'se', 'mas', 'ou', 'não', 'nao', 'muito',
]);

function contentWords(text: string): Set<string> {
  const plain = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ');
  return new Set(plain.split(/\s+/).filter((w) => w.length >= 3 && !STOP_WORDS.has(w)));
}

/**
 * True when two Portuguese options could both pass as the same answer: equal, one inside the
 * other, or sharing most of their meaningful words. Distractors must not be confusable with
 * the right option, or with each other.
 */
export function isConfusable(a: string, b: string): boolean {
  const norm = (t: string) =>
    t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const wa = contentWords(a);
  const wb = contentWords(b);
  const smaller = Math.min(wa.size, wb.size);
  if (smaller === 0) return false;
  let shared = 0;
  wa.forEach((w) => {
    if (wb.has(w)) shared += 1;
  });
  return shared / smaller >= 0.75;
}

/** Up to `count` options from `pool` that are not confusable with `correct` or with each other. */
function pickDistractors(correct: string, pool: string[], count: number, rng: () => number): string[] {
  const picked: string[] = [];
  for (const candidate of shuffle(pool, rng)) {
    if (isConfusable(correct, candidate)) continue;
    if (picked.some((p) => isConfusable(p, candidate))) continue;
    picked.push(candidate);
    if (picked.length === count) break;
  }
  return picked;
}

const spokenText = (s: ExamSentence | StorySentence) => s.tokens.map((t) => t.hanzi).join('');

function translationItem(
  id: string,
  part: ExamPart,
  kind: 'listen' | 'sentence',
  sentence: ExamSentence,
  all: ExamSentence[],
  rng: () => number
): ExamItem {
  const distractors = pickDistractors(
    sentence.ptbr,
    all.filter((s) => s.id !== sentence.id).map((s) => s.ptbr),
    3,
    rng
  );
  const shuffled = withShuffledOptions([sentence.ptbr, ...distractors], 0, rng);
  return {
    id,
    part,
    kind,
    audio: kind === 'listen' ? spokenText(sentence) : undefined,
    text: [{ tokens: sentence.tokens, ptbr: sentence.ptbr }],
    prompt: kind === 'listen' ? 'Ouça a frase e escolha a tradução.' : 'Leia a frase e escolha a tradução.',
    options: shuffled.options,
    answer: shuffled.answer,
    grammar: sentence.grammar,
  };
}

function passageItems(passage: ExamPassage, rng: () => number): ExamItem[] {
  return passage.questions.map((q, i) => {
    const shuffled = withShuffledOptions(q.options, q.answer, rng);
    return {
      id: `${passage.id}-q${i}`,
      part: 'reading' as ExamPart,
      kind: 'passage' as const,
      text: passage.sentences,
      prompt: q.prompt,
      options: shuffled.options,
      answer: shuffled.answer,
      explain: q.explain,
    };
  });
}

function clozeItem(c: ExamCloze, rng: () => number): ExamItem {
  const shuffled = withShuffledOptions(c.options, c.answer, rng);
  return {
    id: c.id,
    part: 'reading',
    kind: 'cloze',
    text: [{ tokens: c.tokens, ptbr: c.ptbr }],
    prompt: 'Complete a frase.',
    options: shuffled.options,
    answer: shuffled.answer,
    explain: c.explain,
    grammar: c.grammar,
  };
}

/**
 * Builds one exam for a level from its own bank of texts, never from the stories and never
 * copied from an official paper. Listening plays a sentence and asks for its translation.
 * Reading mixes passage questions, sentences with a blank (grammar) and, if the bank is
 * short, sentence translations.
 */
export function buildExam(level: LearnLevel, content: LevelContent, seed: number): ExamItem[] {
  const rng = createRng(seed);
  const spec = Object.fromEntries(EXAM_SPECS[level].map((s) => [s.part, s.count])) as Record<ExamPart, number>;
  const { sentences, passages, cloze } = content.exam;

  const shuffledSentences = shuffle(sentences, rng);
  const listening = shuffledSentences
    .slice(0, spec.listening)
    .map((s, i) => translationItem(`${level}-l${i}`, 'listening', 'listen', s, sentences, rng));

  const clozeTarget = Math.min(cloze.length, Math.round(spec.reading * 0.35));
  const clozeItems = shuffle(cloze, rng).slice(0, clozeTarget).map((c) => clozeItem(c, rng));

  // Questions of one passage stay together, so the text is read once per group
  const groups: ExamItem[][] = [];
  let count = clozeItems.length;
  for (const passage of shuffle(passages, rng)) {
    if (count >= spec.reading) break;
    const items = passageItems(passage, rng).slice(0, spec.reading - count);
    groups.push(items);
    count += items.length;
  }
  const reading: ExamItem[] = shuffle<ExamItem[]>([...groups, ...clozeItems.map((c) => [c])], rng).flat();

  // Fill any remaining gap with sentence translations that listening did not use
  const spare = shuffledSentences.slice(spec.listening);
  for (let i = 0; reading.length < spec.reading && i < spare.length; i++) {
    reading.push(translationItem(`${level}-r${i}`, 'reading', 'sentence', spare[i], sentences, rng));
  }

  return [...listening, ...reading];
}

/** Counts the right answers per part; `picks` maps item id to the chosen option index. */
export function scoreExam(items: ExamItem[], picks: Record<string, number | null>): Record<ExamPart, { correct: number; total: number }> {
  const score: Record<ExamPart, { correct: number; total: number }> = {
    listening: { correct: 0, total: 0 },
    reading: { correct: 0, total: 0 },
  };
  for (const item of items) {
    score[item.part].total += 1;
    if (picks[item.id] === item.answer) score[item.part].correct += 1;
  }
  return score;
}

export interface ReadinessBand {
  label: string;
  note: string;
}

/**
 * A rough read on how ready the student is for the level. It is an internal estimate from this
 * mock only, not an official HSK score or a pass mark.
 */
export function readinessBand(correct: number, total: number): ReadinessBand {
  const percent = total === 0 ? 0 : (correct / total) * 100;
  const note = 'Estimativa interna deste simulado, não é nota oficial do HSK.';
  if (percent >= 80) return { label: 'Preparado para este nível', note };
  if (percent >= 60) return { label: 'Quase lá', note };
  return { label: 'Reforce este nível', note };
}
