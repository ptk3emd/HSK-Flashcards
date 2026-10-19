import { GrammarExercise, LevelContent, QuizAttempt } from '../types/card';

/** Levels that have grammar lessons and practice so far. */
export const LEARN_LEVELS = ['HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5', 'HSK 6'] as const;
export type LearnLevel = (typeof LEARN_LEVELS)[number];

const levelContentLoaders: Record<LearnLevel, () => Promise<LevelContent>> = {
  'HSK 1': () => import('../data/learn/hsk1.json').then((m) => m.default as LevelContent),
  'HSK 2': () => import('../data/learn/hsk2.json').then((m) => m.default as LevelContent),
  'HSK 3': () => import('../data/learn/hsk3.json').then((m) => m.default as LevelContent),
  'HSK 4': () => import('../data/learn/hsk4.json').then((m) => m.default as LevelContent),
  'HSK 5': () => import('../data/learn/hsk5.json').then((m) => m.default as LevelContent),
  'HSK 6': () => import('../data/learn/hsk6.json').then((m) => m.default as LevelContent),
};

export function loadLevelContent(level: LearnLevel): Promise<LevelContent> {
  return levelContentLoaders[level]();
}

/** Small seeded generator, so one practice round can be replayed from its seed. */
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

/** Questions per practice round; a bank shorter than this is used in full. */
export const QUIZ_LENGTH = 20;

/**
 * One practice round of a level: a seeded sample of its question bank with the options
 * shuffled, so the same seed replays the same round.
 */
export function prepareQuiz(content: LevelContent, seed: number): GrammarExercise[] {
  const rng = createRng(seed);
  return shuffle(content.exercises, rng)
    .slice(0, QUIZ_LENGTH)
    .map((e) => {
      const shuffled = withShuffledOptions(e.options, e.answer, rng);
      return { ...e, options: shuffled.options, answer: shuffled.answer };
    });
}

export interface QuizResult {
  correct: number;
  total: number;
}

/** Counts the right answers; `picks` maps question id to the chosen option index. */
export function scoreQuiz(items: GrammarExercise[], picks: Record<string, number | null>): QuizResult {
  let correct = 0;
  for (const item of items) {
    if (picks[item.id] === item.answer) correct += 1;
  }
  return { correct, total: items.length };
}

/**
 * A short read on a finished round. It is practice feedback from this quiz only, not a
 * mark or an official HSK score.
 */
export function quizBand(correct: number, total: number): string {
  const percent = total === 0 ? 0 : (correct / total) * 100;
  if (percent >= 90) return 'Domínio sólido destes pontos';
  if (percent >= 70) return 'Bom caminho';
  if (percent >= 50) return 'Vale revisar a gramática do nível';
  return 'Releia os pontos antes de tentar de novo';
}

/** The best score kept per level, for the "last round" line. */
export function latestAttempt(attempts: QuizAttempt[], level: string): QuizAttempt | undefined {
  return attempts.find((a) => a.level === level);
}
