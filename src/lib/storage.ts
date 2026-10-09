import { Card, DeckConfig, FSRSOptions, ReviewLog } from '../types/card';
import {
  DEFAULT_FSRS_OPTIONS,
  MAX_INTERVAL_LIMIT,
  RETENTION_MAX,
  RETENTION_MIN,
  isValidWeights,
} from './fsrs';
import { loadDefaultCards, loadNativeLevelCards } from '../data/defaultDecks';

const CARDS_STORAGE_KEY = 'hanzi_anki_cards_v2';
const SETTINGS_STORAGE_KEY = 'hanzi_anki_settings_v2';
const FSRS_STORAGE_KEY = 'hanzi_anki_fsrs_v2';
const LOGS_STORAGE_KEY = 'hanzi_anki_review_logs_v2';
const THEME_STORAGE_KEY = 'hanzi_anki_theme_v2';

export { loadNativeLevelCards };

export const DEFAULT_DECK_CONFIG: DeckConfig = {
  dailyNewLimit: 20,
  dailyReviewLimit: 100,
  autoPlayAudio: true,
  speechSpeed: 0.85,
  speechVoiceGender: 'auto',
  speechVoiceURI: '',
  activeLevels: ['HSK 1', 'HSK 2'],
  hideSystemBar: false,
  hideAnswerButtons: false,
  twoButtonGrading: true,
};

export function getStoredTheme(): 'dark' | 'light' {
  try {
    const val = localStorage.getItem(THEME_STORAGE_KEY);
    if (val === 'light' || val === 'dark') return val;
  } catch (e) {
    // fallback
  }
  return 'dark'; // Match Anki screenshot aesthetic by default
}

export function saveStoredTheme(theme: 'dark' | 'light'): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (e) {
    console.error(e);
  }
}

/**
 * The saved deck, or null when nothing usable is stored yet.
 */
export function loadStoredCards(): Card[] | null {
  try {
    const raw = localStorage.getItem(CARDS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Card[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load cards from storage', e);
  }
  return null;
}

/**
 * The saved deck. On first run, loads the HSK 1 and HSK 2 defaults and saves them.
 */
export async function loadCards(): Promise<Card[]> {
  const stored = loadStoredCards();
  if (stored) return stored;

  const defaults = await loadDefaultCards();
  saveCards(defaults);
  return defaults;
}

export function saveCards(cards: Card[]): void {
  try {
    localStorage.setItem(CARDS_STORAGE_KEY, JSON.stringify(cards));
  } catch (e) {
    console.error('Failed to save cards to storage', e);
  }
}

export function loadDeckConfig(): DeckConfig {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_DECK_CONFIG, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error(e);
  }
  return DEFAULT_DECK_CONFIG;
}

export function saveDeckConfig(config: DeckConfig): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error(e);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRetention(value: unknown): value is number {
  return typeof value === 'number' && value >= RETENTION_MIN && value <= RETENTION_MAX;
}

/**
 * Coerces untrusted stored options into a valid FSRSOptions, falling back to the
 * default for each field that is missing or out of range.
 */
export function sanitizeFSRSOptions(raw: unknown): FSRSOptions {
  const base = DEFAULT_FSRS_OPTIONS;
  const source = isRecord(raw) ? raw : {};

  const maxInterval = source.maximum_interval;
  const validMaxInterval =
    typeof maxInterval === 'number' &&
    Number.isFinite(maxInterval) &&
    maxInterval >= 1 &&
    maxInterval <= MAX_INTERVAL_LIMIT;

  const retentionByLevel: Record<string, number> = {};
  if (isRecord(source.retention_by_level)) {
    for (const [level, value] of Object.entries(source.retention_by_level)) {
      if (isRetention(value)) retentionByLevel[level] = value;
    }
  }

  return {
    request_retention: isRetention(source.request_retention)
      ? source.request_retention
      : base.request_retention,
    maximum_interval: validMaxInterval ? Math.round(maxInterval as number) : base.maximum_interval,
    w: isValidWeights(source.w) ? [...source.w] : [...base.w],
    enable_fuzz: base.enable_fuzz,
    retention_by_level: retentionByLevel,
  };
}

export function loadFSRSOptions(): FSRSOptions {
  try {
    const raw = localStorage.getItem(FSRS_STORAGE_KEY);
    if (raw) {
      return sanitizeFSRSOptions(JSON.parse(raw));
    }
  } catch (e) {
    console.error(e);
  }
  return sanitizeFSRSOptions(null);
}

export function saveFSRSOptions(options: FSRSOptions): void {
  try {
    localStorage.setItem(FSRS_STORAGE_KEY, JSON.stringify(options));
  } catch (e) {
    console.error(e);
  }
}

export function loadReviewLogs(): ReviewLog[] {
  try {
    const raw = localStorage.getItem(LOGS_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error(e);
  }
  return [];
}

export function saveReviewLogs(logs: ReviewLog[]): void {
  try {
    localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(logs.slice(-500))); // keep last 500
  } catch (e) {
    console.error(e);
  }
}

export function pushReviewLog(log: ReviewLog): void {
  const current = loadReviewLogs();
  current.push(log);
  saveReviewLogs(current);
}

export function popReviewLog(): ReviewLog | null {
  const current = loadReviewLogs();
  const last = current.pop();
  if (last) {
    saveReviewLogs(current);
    return last;
  }
  return null;
}
