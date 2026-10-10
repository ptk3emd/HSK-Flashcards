import { Card } from '../types/card';

export const ALL_HSK_LEVELS = [
  'HSK 1',
  'HSK 2',
  'HSK 3',
  'HSK 4',
  'HSK 5',
  'HSK 6',
  'HSK 7-9',
] as const;

/** Chinese numeral used as the ledger index for each level. */
export const LEVEL_NUMERALS: Record<string, string> = {
  'HSK 1': '一',
  'HSK 2': '二',
  'HSK 3': '三',
  'HSK 4': '四',
  'HSK 5': '五',
  'HSK 6': '六',
  'HSK 7-9': '七–九',
};

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
  const match = /^S-(\d{5})$/.exec(id);
  if (!match) return null;
  const serial = Number(match[1]);
  return ALL_HSK_LEVELS.find((level) => serial <= HSK_LEVEL_INFO[level].total) ?? null;
}

/**
 * Returns initial default native cards (HSK 1 + HSK 2). Loaded on demand so the
 * app entry bundle does not carry the 500 default cards.
 */
export async function loadDefaultCards(): Promise<Card[]> {
  const [hsk1, hsk2] = await Promise.all([import('./hsk1.json'), import('./hsk2.json')]);
  return [...(hsk1.default as Card[]), ...(hsk2.default as Card[])];
}

/**
 * Dynamically loads any native HSK level without requiring user import!
 */
export async function loadNativeLevelCards(level: string): Promise<Card[]> {
  switch (level) {
    case 'HSK 1':
      return (await import('./hsk1.json')).default as Card[];
    case 'HSK 2':
      return (await import('./hsk2.json')).default as Card[];
    case 'HSK 3':
      return (await import('./hsk3.json')).default as Card[];
    case 'HSK 4':
      return (await import('./hsk4.json')).default as Card[];
    case 'HSK 5':
      return (await import('./hsk5.json')).default as Card[];
    case 'HSK 6':
      return (await import('./hsk6.json')).default as Card[];
    case 'HSK 7-9':
      return (await import('./hsk7_9.json')).default as Card[];
    default:
      return [];
  }
}
