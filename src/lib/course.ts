import { ACTIVE_COURSE, CourseId } from './courseId';
import { Rating } from '../types/card';

/**
 * Everything that differs between the Mandarin and the French course. Levels keep the same
 * internal names ('HSK 1' ... 'HSK 7-9') in both, so decks, settings and statistics share one
 * shape; only what the student sees changes.
 */
export interface CourseConfig {
  id: CourseId;
  /** Brand name and the word under it */
  brand: string;
  brandSub: string;
  /** Language tag of the studied words (speech, lang attributes) */
  lang: string;
  /** Speech voices whose lang starts with one of these */
  voicePrefixes: string[];
  /** What the word on the card is called: Hanzi, Français, Italiano */
  wordLabel: string;
  /** Example search shown in the dictionary's empty field, for the word side */
  searchExample: string;
  /** Hanzi, pinyin, writing pad, stroke order and draw search */
  hasCharacters: boolean;
  /** The Learn tab (grammar lessons and practice) */
  hasLearn: boolean;
  /** Index mark per level in the ledgers */
  levelIndex: Record<string, string>;
  /** Seal pressed on a graded card, per grade */
  sealMarks: Record<Rating, string>;
  /** Seal on the session-complete card */
  doneMark: string;
  /** Sentence used to test the voice */
  voiceSample: string;
  /** What the Anki export covers: "HSK 1–9, incluindo o bloco conjunto HSK 7–9" */
  exportLevels: string;
  /** Base of the exported file names: the CSV for Anki and the JSON backup */
  exportFileBase: string;
  /** Browser meta description and Open Graph text */
  description: string;
  /** Browser tab title */
  title: string;
  /** Browser UI colour (address bar on phones) */
  themeColor: string;
  favicon: string;
}

const ZH: CourseConfig = {
  id: 'zh',
  brand: 'Lóutī',
  brandSub: 'Mandarim',
  lang: 'zh-CN',
  voicePrefixes: ['zh', 'cmn', 'yue'],
  wordLabel: 'Hanzi',
  searchExample: '你好, 水',
  hasCharacters: true,
  hasLearn: true,
  levelIndex: {
    'HSK 1': '一',
    'HSK 2': '二',
    'HSK 3': '三',
    'HSK 4': '四',
    'HSK 5': '五',
    'HSK 6': '六',
    'HSK 7-9': '七–九',
  },
  sealMarks: { 1: '再', 2: '难', 3: '好', 4: '易' },
  doneMark: '完',
  voiceSample: '你好！很高兴认识你。',
  exportLevels: 'HSK 1–9, incluindo o bloco conjunto HSK 7–9',
  exportFileBase: 'HSK-1-9',
  description: 'App de repetição espaçada FSRS para aprender o vocabulário chinês HSK (1 a 9) com cartões acrílicos estilizados.',
  title: 'Lóutī Mandarim - Repetição Espaçada',
  themeColor: '#B3261E',
  favicon: './favicon.svg',
};

/**
 * Palier: a stair landing, and "par paliers", step by step. The French sibling of Lóutī (楼梯,
 * staircase): the same nine levels, roman numerals for the index, a wax seal for the grades.
 */
const FR: CourseConfig = {
  id: 'fr',
  brand: 'Palier',
  brandSub: 'Français',
  lang: 'fr-FR',
  voicePrefixes: ['fr'],
  wordLabel: 'Français',
  searchExample: 'bonjour, école',
  hasCharacters: false,
  hasLearn: false,
  levelIndex: {
    'HSK 1': 'I',
    'HSK 2': 'II',
    'HSK 3': 'III',
    'HSK 4': 'IV',
    'HSK 5': 'V',
    'HSK 6': 'VI',
    'HSK 7-9': 'VII–IX',
  },
  // Encore, Difficile, Bien, Facile
  sealMarks: { 1: 'E', 2: 'D', 3: 'B', 4: 'F' },
  doneMark: 'Fin',
  voiceSample: 'Bonjour ! Enchanté de faire votre connaissance.',
  exportLevels: 'de francês, do Niveau 1 ao 7–9',
  exportFileBase: 'Palier-Francais',
  description: 'App de repetição espaçada FSRS para aprender o vocabulário francês, do Niveau 1 ao 7–9, com cartões estilizados.',
  title: 'Palier Français - Repetição Espaçada',
  themeColor: '#24479E',
  favicon: './favicon-fr.svg',
};

/**
 * Scalino, the Italian sibling: a step (gradino) of the same staircase. Bodoni, the Italian
 * typeface of the 1790s, sets the words; the seal is green wax, the colour of the cypress.
 */
const IT: CourseConfig = {
  id: 'it',
  brand: 'Scalino',
  brandSub: 'Italiano',
  lang: 'it-IT',
  voicePrefixes: ['it'],
  wordLabel: 'Italiano',
  searchExample: 'ciao, scuola',
  hasCharacters: false,
  hasLearn: false,
  levelIndex: {
    'HSK 1': 'I',
    'HSK 2': 'II',
    'HSK 3': 'III',
    'HSK 4': 'IV',
    'HSK 5': 'V',
    'HSK 6': 'VI',
    'HSK 7-9': 'VII–IX',
  },
  // Ancora, Difficile, Bene, Facile
  sealMarks: { 1: 'A', 2: 'D', 3: 'B', 4: 'F' },
  doneMark: 'Fine',
  voiceSample: 'Buongiorno! Piacere di conoscerla.',
  exportLevels: 'de italiano, do Livello 1 ao 7–9',
  exportFileBase: 'Scalino-Italiano',
  description: 'App de repetição espaçada FSRS para aprender o vocabulário italiano, do Livello 1 ao 7–9, com cartões estilizados.',
  title: 'Scalino Italiano - Repetição Espaçada',
  themeColor: '#2E5E3E',
  favicon: './favicon-it.svg',
};

export const COURSES: Record<CourseId, CourseConfig> = { zh: ZH, fr: FR, it: IT };
export const COURSE: CourseConfig = COURSES[ACTIVE_COURSE];

/** The name a level shows: 'HSK 1' in Mandarin, 'Niveau 1' in French. */
export function levelLabel(level: string): string {
  if (COURSE.id === 'zh') return level;
  const word = COURSE.id === 'it' ? 'Livello' : 'Niveau';
  return level.replace(/^HSK /, `${word} `).replace('7-9', '7–9');
}

/** Applies the course to the page: colours, title, meta text, favicon and theme colour. Runs once at startup. */
export function applyCourseToDocument(): void {
  const root = document.documentElement;
  root.classList.add(`course-${COURSE.id}`);
  root.lang = 'pt-BR';
  document.title = COURSE.title;
  const setMeta = (selector: string, content: string) =>
    document.querySelector(selector)?.setAttribute('content', content);
  setMeta('meta[name="description"]', COURSE.description);
  setMeta('meta[property="og:title"]', COURSE.title);
  setMeta('meta[property="og:description"]', COURSE.description);
  setMeta('meta[name="apple-mobile-web-app-title"]', COURSE.brand);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COURSE.themeColor);
  document.querySelector('link[rel="icon"][type="image/svg+xml"]')?.setAttribute('href', COURSE.favicon);
}
