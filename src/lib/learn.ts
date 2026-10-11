import { Card, ExamItem, ExamPart, ExamPartSpec, LevelContent, Story } from '../types/card';
import { loadNativeLevelCards } from '../data/defaultDecks';

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

/** A short Portuguese gloss of a card: the first meaning, without grammar notes. */
export function shortMeaning(card: Card): string {
  const plain = card.ptbr.replace(/<[^>]+>/g, '').replace(/\([^)]*\)/g, '').trim();
  return plain.split(';')[0].trim();
}

/**
 * Builds one exam for a level. Listening items play a word from the level and ask for its
 * meaning. Reading items are the stories' questions first, then word-meaning questions.
 * Every item is generated from the level's own words and stories, never copied from an
 * official paper.
 */
export function buildExam(
  level: LearnLevel,
  cards: Card[],
  content: LevelContent,
  seed: number
): ExamItem[] {
  const rng = createRng(seed);
  const words = cards.filter((c) => shortMeaning(c).length > 0);
  const meanings = Array.from(new Set(words.map(shortMeaning)));

  const wordItem = (card: Card, id: string, part: ExamPart, asAudio: boolean): ExamItem => {
    const gloss = shortMeaning(card);
    const distractors = shuffle(meanings.filter((m) => m !== gloss), rng).slice(0, 3);
    const shuffled = withShuffledOptions([gloss, ...distractors], 0, rng);
    return asAudio
      ? { id, part, audio: card.hanzi, prompt: 'Ouça e escolha o significado.', options: shuffled.options, answer: shuffled.answer }
      : { id, part, prompt: `Qual é o significado de "${card.hanzi}"?`, options: shuffled.options, answer: shuffled.answer };
  };

  const storyItems: ExamItem[] = content.stories.flatMap((story: Story) =>
    story.questions.map((q, i) => {
      const shuffled = withShuffledOptions(q.options, q.answer, rng);
      return { id: `${story.id}-q${i}`, part: 'reading' as ExamPart, prompt: q.prompt, options: shuffled.options, answer: shuffled.answer };
    })
  );

  const spec = Object.fromEntries(EXAM_SPECS[level].map((s) => [s.part, s.count])) as Record<ExamPart, number>;

  const listening = shuffle(words, rng)
    .slice(0, spec.listening)
    .map((card, i) => wordItem(card, `${level}-l${i}`, 'listening', true));

  const readingFromStories = shuffle(storyItems, rng).slice(0, spec.reading);
  const readingFromWords = shuffle(words, rng)
    .slice(0, Math.max(0, spec.reading - readingFromStories.length))
    .map((card, i) => wordItem(card, `${level}-r${i}`, 'reading', false));

  return [...listening, ...readingFromStories, ...readingFromWords];
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
