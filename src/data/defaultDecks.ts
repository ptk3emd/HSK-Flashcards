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

export type HskLevelName = typeof ALL_HSK_LEVELS[number];

export const HSK_LEVEL_INFO: Record<HskLevelName, { count: number; desc: string }> = {
  'HSK 1': { count: 500, desc: 'Iniciante / Vocabulário Fundamental' },
  'HSK 2': { count: 772, desc: 'Básico / Situações Cotidianas' },
  'HSK 3': { count: 973, desc: 'Intermediário I / Conversação Fluida' },
  'HSK 4': { count: 1000, desc: 'Intermediário II / Temas Diversificados' },
  'HSK 5': { count: 1071, desc: 'Avançado I / Artigos, Notícias e Cultura' },
  'HSK 6': { count: 1140, desc: 'Avançado II / Expressão Escrita e Oral Plena' },
  'HSK 7-9': { count: 5636, desc: 'Superior / Fluência Acadêmica e Especializada' },
};

/**
 * Returns initial default native cards (HSK 1 + HSK 2). Loaded on demand so the
 * app entry bundle does not carry the 1,272 default cards.
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
