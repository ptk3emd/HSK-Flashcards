import { Card } from '../types/card';
import { COURSE } from '../lib/course';
import type { CourseId } from '../lib/courseId';
import { loadRemoteLevelCards, type VocabularySource } from '../lib/vocabulary';

export const ALL_HSK_LEVELS = [
  'HSK 1',
  'HSK 2',
  'HSK 3',
  'HSK 4',
  'HSK 5',
  'HSK 6',
  'HSK 7-9',
] as const;

/** Ledger index for each level: Chinese numerals in Mandarin, roman numerals in French. */
export const LEVEL_NUMERALS: Record<string, string> = COURSE.levelIndex;

export type HskLevelName = typeof ALL_HSK_LEVELS[number];

/**
 * Words each level adds, from the official HSK vocabulary syllabus (新版HSK考试大纲,
 * 词汇大纲, chinesetest.cn). The exam for a level covers its words and every level below.
 */
export const HSK_LEVEL_INFO: Record<HskLevelName, { count: number; total: number }> = {
  'HSK 1': { count: 300, total: 300 },
  'HSK 2': { count: 200, total: 500 },
  'HSK 3': { count: 500, total: 1000 },
  'HSK 4': { count: 1000, total: 2000 },
  'HSK 5': { count: 1600, total: 3600 },
  'HSK 6': { count: 1800, total: 5400 },
  'HSK 7-9': { count: 5600, total: 11000 },
};

/**
 * Native card ids are the syllabus serial numbers (S-00001 to S-11000), which run level by
 * level, so a card's level follows from its id.
 */
export function levelOfNativeId(id: string): HskLevelName | null {
  // S- in Mandarin, F- in French, I- in Italian: all run on the same syllabus serial
  const match = /^[SFI]-(\d{5})$/.exec(id);
  if (!match) return null;
  const serial = Number(match[1]);
  return ALL_HSK_LEVELS.find((level) => serial <= HSK_LEVEL_INFO[level].total) ?? null;
}

type LevelModule = { default: unknown };

/** One JSON file per level and course, each loaded on demand so the entry bundle stays light. */
const LEVEL_FILES: Record<string, Record<CourseId, () => Promise<LevelModule>>> = {
  'HSK 1': { zh: () => import('./hsk1.json'), fr: () => import('./fr/fr1.json'), it: () => import('./it/it1.json') },
  'HSK 2': { zh: () => import('./hsk2.json'), fr: () => import('./fr/fr2.json'), it: () => import('./it/it2.json') },
  'HSK 3': { zh: () => import('./hsk3.json'), fr: () => import('./fr/fr3.json'), it: () => import('./it/it3.json') },
  'HSK 4': { zh: () => import('./hsk4.json'), fr: () => import('./fr/fr4.json'), it: () => import('./it/it4.json') },
  'HSK 5': { zh: () => import('./hsk5.json'), fr: () => import('./fr/fr5.json'), it: () => import('./it/it5.json') },
  'HSK 6': { zh: () => import('./hsk6.json'), fr: () => import('./fr/fr6.json'), it: () => import('./it/it6.json') },
  'HSK 7-9': { zh: () => import('./hsk7_9.json'), fr: () => import('./fr/fr7_9.json'), it: () => import('./it/it7_9.json') },
};

/** The bundled cards of one level, in the active course. */
async function loadBundledLevelCards(level: string): Promise<Card[]> {
  const files = LEVEL_FILES[level];
  if (!files) return [];
  return (await files[COURSE.id]()).default as Card[];
}

/**
 * The native cards of one level: the Supabase list when it is available (the source of
 * truth), otherwise the bundled file. `source` tells the caller which one answered.
 */
export async function loadNativeLevelCardsFrom(
  level: string
): Promise<{ cards: Card[]; source: VocabularySource }> {
  const remote = await loadRemoteLevelCards(level);
  if (remote !== null) return { cards: remote, source: 'remote' };
  return { cards: await loadBundledLevelCards(level), source: 'bundled' };
}

/** The native cards of one level, in the active course. */
export async function loadNativeLevelCards(level: string): Promise<Card[]> {
  return (await loadNativeLevelCardsFrom(level)).cards;
}

/** The first deck a new student gets: levels 1 and 2. */
export async function loadDefaultCards(): Promise<Card[]> {
  const [first, second] = await Promise.all([loadNativeLevelCards('HSK 1'), loadNativeLevelCards('HSK 2')]);
  return [...first, ...second];
}
