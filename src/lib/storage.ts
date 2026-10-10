import { Card, DeckConfig, FSRSOptions, ReviewLog } from '../types/card';
import {
  DEFAULT_FSRS_OPTIONS,
  MAX_INTERVAL_LIMIT,
  RETENTION_MAX,
  RETENTION_MIN,
  isValidWeights,
} from './fsrs';
import { loadDefaultCards, loadNativeLevelCards, levelOfNativeId } from '../data/defaultDecks';
import { DEFAULT_GESTURES, sanitizeGestures } from './gestures';

const CARDS_STORAGE_KEY = 'hanzi_anki_cards_v2';
const SETTINGS_STORAGE_KEY = 'hanzi_anki_settings_v2';
const FSRS_STORAGE_KEY = 'hanzi_anki_fsrs_v2';
const LOGS_STORAGE_KEY = 'hanzi_anki_review_logs_v2';
const THEME_STORAGE_KEY = 'hanzi_anki_theme_v2';
const CONTENT_VERSION_KEY = 'hanzi_anki_content_version';

/**
 * Bump when the bundled vocabulary text changes. Saved native cards then pick up the new
 * hanzi, pinyin and translation once, keeping their study history and mnemonics.
 * 2: Portuguese translations reviewed for every level; pinyin spaced per syllable.
 * 3: vocabulary replaced by the official HSK syllabus list (11,000 words, new levels and ids).
 */
const CONTENT_VERSION = 3;

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
  gestures: DEFAULT_GESTURES,
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
  if (stored) return refreshNativeContent(stored);

  const defaults = await loadDefaultCards();
  saveCards(defaults);
  saveContentVersion();
  return defaults;
}

function saveContentVersion(): void {
  try {
    localStorage.setItem(CONTENT_VERSION_KEY, String(CONTENT_VERSION));
  } catch (e) {
    console.error(e);
  }
}

/** Brings saved native cards up to the bundled vocabulary, once per content version. */
async function refreshNativeContent(stored: Card[]): Promise<Card[]> {
  let version = 0;
  try {
    version = Number(localStorage.getItem(CONTENT_VERSION_KEY)) || 0;
  } catch {
    return stored;
  }
  if (version >= CONTENT_VERSION) return stored;

  try {
    const migrated = stored.some((c) => LEGACY_ID.test(c.id)) ? await migrateToSyllabus(stored) : stored;
    const refreshed = await refreshText(migrated);
    saveCards(refreshed);
    saveContentVersion();
    return refreshed;
  } catch (e) {
    console.error('Failed to refresh card content', e);
    return stored;
  }
}

/** Card ids of the 2021 word list (L1-0001 ... L7-5636). */
const LEGACY_ID = /^L\d-\d{4}$/;

const hasHistory = (card: Card) =>
  card.reps > 0 || card.state !== 0 || !!card.suspended || !!card.mnemonic;

const SCHEDULING_KEYS = [
  'state', 'due', 'stability', 'difficulty', 'elapsed_days', 'scheduled_days',
  'reps', 'lapses', 'last_review', 'suspended', 'mnemonic',
] as const;

/**
 * Moves a deck built on the 2021 list to the official syllabus list. Each studied word keeps
 * its schedule and mnemonic under its new id and level; levels the student had downloaded, and
 * levels that now hold a studied word, are downloaded in full, and any level holding a studied
 * word becomes active so its reviews keep coming. Unstudied words that left the list or moved
 * to a level the student never downloaded are dropped; studied words that left the list stay.
 */
async function migrateToSyllabus(stored: Card[]): Promise<Card[]> {
  const legacyIds = (await import('../data/legacyIds.json')).default as Record<string, string>;
  const downloaded = new Set(stored.map((c) => c.level));

  const carried = new Map<string, Card>();
  const kept: Card[] = [];
  const idMap = new Map<string, string>();
  const levelsToLoad = new Set<string>(downloaded);
  const studiedLevels = new Set<string>();

  for (const card of stored) {
    if (!LEGACY_ID.test(card.id)) {
      kept.push(card);
      continue;
    }
    const newId = legacyIds[card.id];
    const newLevel = newId ? levelOfNativeId(newId) : null;
    if (!newId || !newLevel) {
      if (hasHistory(card)) kept.push(card);
      continue;
    }
    if (!downloaded.has(newLevel) && !hasHistory(card)) continue;
    idMap.set(card.id, newId);
    carried.set(newId, card);
    levelsToLoad.add(newLevel);
    if (card.state !== 0) studiedLevels.add(newLevel);
  }

  const fresh: Card[] = [];
  for (const level of levelsToLoad) {
    const native = await loadNativeLevelCards(level).catch(() => [] as Card[]);
    for (const source of native) {
      const old = carried.get(source.id);
      if (!old) {
        fresh.push(source);
        continue;
      }
      const merged: Card = { ...source };
      for (const key of SCHEDULING_KEYS) {
        if (old[key] !== undefined) (merged as unknown as Record<string, unknown>)[key] = old[key];
      }
      fresh.push(merged);
    }
  }
  // Native cards in syllabus order (lower levels first), then anything else the deck held
  const nativeIds = new Set(fresh.map((c) => c.id));
  const result = [...fresh, ...kept.filter((c) => !nativeIds.has(c.id))];

  const config = loadDeckConfig();
  const activeLevels = Array.from(new Set([...config.activeLevels, ...studiedLevels]));
  if (activeLevels.length !== config.activeLevels.length) saveDeckConfig({ ...config, activeLevels });

  const logs = loadReviewLogs();
  if (logs.length > 0) {
    saveReviewLogs(
      logs.map((log) => {
        const newId = idMap.get(log.cardId);
        if (!newId) return log;
        const level = levelOfNativeId(newId) ?? log.previousCardSnapshot.level;
        return { ...log, cardId: newId, previousCardSnapshot: { ...log.previousCardSnapshot, id: newId, level } };
      })
    );
  }
  return result;
}

/** Updates the text of saved native cards to the bundled vocabulary. */
async function refreshText(cards: Card[]): Promise<Card[]> {
  const levels = Array.from(new Set(cards.map((c) => c.level)));
  const bundled = new Map<string, Card>();
  for (const level of levels) {
    const native = await loadNativeLevelCards(level).catch(() => [] as Card[]);
    native.forEach((c) => bundled.set(c.id, c));
  }
  return cards.map((card) => {
    const source = bundled.get(card.id);
    if (!source || source.level !== card.level) return card;
    return {
      ...card,
      hanzi: source.hanzi,
      traditional: source.traditional,
      pinyin: source.pinyin,
      ptbr: source.ptbr,
      pos: source.pos,
      tags: source.tags,
    };
  });
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
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_DECK_CONFIG, ...parsed, gestures: sanitizeGestures(parsed?.gestures) };
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
