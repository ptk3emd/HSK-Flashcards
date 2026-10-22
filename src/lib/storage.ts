import { Card, DeckConfig, FSRSOptions, QuizAttempt, ReviewLog } from '../types/card';
import {
  DEFAULT_FSRS5_WEIGHTS,
  DEFAULT_FSRS_OPTIONS,
  DEFAULT_FSRS_WEIGHTS,
  MAX_INTERVAL_LIMIT,
  RETENTION_MAX,
  RETENTION_MIN,
  isValidLegacyWeights,
  isValidWeights,
} from './fsrs';
import {
  loadDefaultCards,
  loadNativeLevelCards,
  loadNativeLevelCardsFrom,
  levelOfNativeId,
} from '../data/defaultDecks';
import { DEFAULT_GESTURES, sanitizeGestures } from './gestures';
import { ACTIVE_COURSE } from './courseId';
import { sanitizeStudyDayStartHour, sanitizeStudyPlan } from './studyPlan';
import { isCloudEnabled } from './supabaseClient';
import { isNativeCardId } from './vocabulary';
import { reconcileCardVocabulary } from './vocabularyMerge';

/**
 * Every app-owned localStorage key in one place: persistence and the Anki backup
 * read from this same list, so a new key can never be silently left out of a backup.
 */
const BASE_KEYS = {
  cards: 'hanzi_anki_cards_v2',
  settings: 'hanzi_anki_settings_v2',
  fsrs: 'hanzi_anki_fsrs_v2',
  reviewLogs: 'hanzi_anki_review_logs_v2',
  theme: 'hanzi_anki_theme_v2',
  contentVersion: 'hanzi_anki_content_version',
  grammarStudied: 'hanzi_anki_grammar_studied_v1',
  quizAttempts: 'hanzi_anki_quiz_attempts_v1',
} as const;

/**
 * Each course keeps its own study data under its own keys. Mandarin keeps the original names,
 * so nothing saved before the French course existed moves; French adds a prefix. The theme is
 * one device preference shared by both.
 */
function courseKeys(): { [K in keyof typeof BASE_KEYS]: string } {
  if (ACTIVE_COURSE === 'zh') return { ...BASE_KEYS };
  const prefixed = Object.fromEntries(
    Object.entries(BASE_KEYS).map(([name, key]) => [name, name === 'theme' ? key : `${ACTIVE_COURSE}_${key}`])
  );
  return prefixed as { [K in keyof typeof BASE_KEYS]: string };
}

export const STORAGE_KEYS = courseKeys();

/** Explicit app-owned keys only; fail rather than silently export unreadable user data. */
export function readUserBackup(storage: Pick<Storage, 'getItem'>): Record<string, unknown> {
  return Object.fromEntries(
    Object.values(STORAGE_KEYS).flatMap((key) => {
      const value = storage.getItem(key);
      if (value === null) return [];
      return [[key, value]];
    })
  );
}

const MAX_QUIZ_ATTEMPTS = 20; // per level

/**
 * Account keys stay out of STORAGE_KEYS on purpose: they describe this device's sign-in,
 * not study data, so they never travel in a backup or to another device.
 */
export const ACCOUNT_KEYS = {
  authSkipped: 'hanzi_anki_auth_skipped_v1',
  syncOutbox: 'hanzi_anki_sync_outbox_v1',
} as const;

/** What changed in local study data; the cloud sync listens to these. */
export type LocalChange =
  | { kind: 'progress' }
  | { kind: 'review'; log: ReviewLog }
  | { kind: 'undo'; log: ReviewLog };

/** Fires after each save of study data, so a listener (the cloud sync) never polls storage. */
export const localChanges = new EventTarget();
function emitLocalChange(change: LocalChange): void {
  localChanges.dispatchEvent(new CustomEvent<LocalChange>('change', { detail: change }));
}

/** Whether the student chose to use the app without an account on this device. */
export function loadAuthSkipped(): boolean {
  try {
    return localStorage.getItem(ACCOUNT_KEYS.authSkipped) === '1';
  } catch {
    return false;
  }
}

export function saveAuthSkipped(skipped: boolean): void {
  try {
    if (skipped) localStorage.setItem(ACCOUNT_KEYS.authSkipped, '1');
    else localStorage.removeItem(ACCOUNT_KEYS.authSkipped);
  } catch (e) {
    console.error('Failed to save the sign-in choice', e);
  }
}

/** A review waiting to reach the server: sent ('add') or reverted by undo ('remove'). */
export interface OutboxEntry {
  op: 'add' | 'remove';
  cardId: string;
  rating: number;
  state: number;
  reviewedAt: string;
  scheduledDays: number;
  stability: number;
  difficulty: number;
}

const MAX_OUTBOX = 2000;

function isOutboxEntry(v: unknown): v is OutboxEntry {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    (e.op === 'add' || e.op === 'remove') &&
    typeof e.cardId === 'string' &&
    typeof e.reviewedAt === 'string' &&
    isCount(e.rating) &&
    isCount(e.state)
  );
}

export function loadSyncOutbox(): OutboxEntry[] {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEYS.syncOutbox);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isOutboxEntry) : [];
  } catch (e) {
    console.error('Failed to load the sync queue', e);
    return [];
  }
}

/**
 * Only the last operation per review matters. Collapsing an answer and its undo (or a redo)
 * keeps the queue bounded without leaving the server in the opposite state.
 */
export function compactSyncOutbox(entries: OutboxEntry[]): OutboxEntry[] {
  const lastIndex = new Map<string, number>();
  entries.forEach((entry, index) => {
    lastIndex.set(`${entry.cardId}|${entry.reviewedAt}`, index);
  });
  return entries.filter(
    (entry, index) => lastIndex.get(`${entry.cardId}|${entry.reviewedAt}`) === index
  );
}

function outboxIdentity(entry: OutboxEntry): string {
  return `${entry.op}|${entry.cardId}|${entry.reviewedAt}`;
}

/**
 * Drops exactly the entries a successful request carried. Looking at the operation too means
 * an undo queued while its answer was in flight is not mistaken for the answer.
 */
export function dropSentOutboxEntries(
  queue: OutboxEntry[],
  sent: OutboxEntry[]
): OutboxEntry[] {
  const remaining = new Map<string, number>();
  for (const entry of sent) {
    const key = outboxIdentity(entry);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  return queue.filter((entry) => {
    const key = outboxIdentity(entry);
    const count = remaining.get(key) ?? 0;
    if (count === 0) return true;
    remaining.set(key, count - 1);
    return false;
  });
}

export function saveSyncOutbox(entries: OutboxEntry[]): void {
  try {
    const pending = compactSyncOutbox(entries);
    if (pending.length === 0) localStorage.removeItem(ACCOUNT_KEYS.syncOutbox);
    else localStorage.setItem(ACCOUNT_KEYS.syncOutbox, JSON.stringify(pending.slice(-MAX_OUTBOX)));
  } catch (e) {
    console.error('Failed to save the sync queue', e);
  }
}

/**
 * Bump when the bundled vocabulary text changes. Saved native cards then pick up the new
 * hanzi, pinyin and translation once, keeping their study history and mnemonics.
 * 2: Portuguese translations reviewed for every level; pinyin spaced per syllable.
 * 3: vocabulary replaced by the official HSK syllabus list (11,000 words, new levels and ids).
 * 4: French deck: repeated fronts within a level differentiated per Chinese word.
 */
const CONTENT_VERSION = 4;

export { loadNativeLevelCards };

export const DEFAULT_DECK_CONFIG: DeckConfig = {
  dailyNewLimit: 20,
  dailyReviewLimit: 100,
  studyDayStartHour: 0,
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
    const val = localStorage.getItem(STORAGE_KEYS.theme);
    if (val === 'light' || val === 'dark') return val;
  } catch (e) {
    // fallback
  }
  return 'dark'; // Match Anki screenshot aesthetic by default
}

export function saveStoredTheme(theme: 'dark' | 'light'): void {
  try {
    localStorage.setItem(STORAGE_KEYS.theme, theme);
  } catch (e) {
    console.error(e);
  }
}

/**
 * The saved deck, or null when nothing usable is stored yet.
 */
export function loadStoredCards(): Card[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.cards);
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
 * When the Supabase vocabulary can be read, the saved deck follows it before anything else.
 */
export async function loadCards(): Promise<Card[]> {
  const stored = loadStoredCards();
  if (stored) {
    const reconciled = await reconcileVocabulary(stored);
    if (reconciled) {
      if (reconciled.changed) saveCards(reconciled.cards);
      // The remote list is the source of truth: never let the bundled text overwrite it
      saveContentVersion();
      return reconciled.cards;
    }
    return refreshNativeContent(stored);
  }

  const defaults = await loadDefaultCards();
  saveCards(defaults);
  saveContentVersion();
  return defaults;
}

/**
 * Updates, adds and drops words so the saved deck matches the Supabase list of every
 * level it already holds. Returns null when no level could be read from the remote list,
 * leaving the caller with the bundled-content migration.
 */
async function reconcileVocabulary(
  cards: Card[]
): Promise<{ cards: Card[]; changed: boolean } | null> {
  if (!isCloudEnabled) return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;

  const levels = Array.from(
    new Set(cards.filter((card) => isNativeCardId(card.id, ACTIVE_COURSE)).map((card) => card.level))
  );
  if (levels.length === 0) return null;

  const loaded = await Promise.all(
    levels.map(async (level) => ({ level, ...(await loadNativeLevelCardsFrom(level)) }))
  );
  const remoteByLevel = new Map<string, Card[]>();
  for (const entry of loaded) {
    if (entry.source === 'remote') remoteByLevel.set(entry.level, entry.cards);
  }
  if (remoteByLevel.size === 0) return null;

  return reconcileCardVocabulary(cards, remoteByLevel, ACTIVE_COURSE);
}

function saveContentVersion(): void {
  try {
    localStorage.setItem(STORAGE_KEYS.contentVersion, String(CONTENT_VERSION));
  } catch (e) {
    console.error(e);
  }
}

/** Brings saved native cards up to the bundled vocabulary, once per content version. */
async function refreshNativeContent(stored: Card[]): Promise<Card[]> {
  let version = 0;
  try {
    version = Number(localStorage.getItem(STORAGE_KEYS.contentVersion)) || 0;
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
    localStorage.setItem(STORAGE_KEYS.cards, JSON.stringify(cards));
  } catch (e) {
    console.error('Failed to save cards to storage', e);
  }
  emitLocalChange({ kind: 'progress' });
}

export function loadDeckConfig(): DeckConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_DECK_CONFIG,
        ...parsed,
        studyDayStartHour: sanitizeStudyDayStartHour(parsed?.studyDayStartHour),
        gestures: sanitizeGestures(parsed?.gestures),
        studyPlan: sanitizeStudyPlan(parsed?.studyPlan),
      };
    }
  } catch (e) {
    console.error(e);
  }
  return DEFAULT_DECK_CONFIG;
}

export function saveDeckConfig(config: DeckConfig): void {
  try {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(config));
    emitLocalChange({ kind: 'progress' });
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

  // The weight count is the source of truth: 21 weights mean FSRS-6, 19 mean
  // legacy FSRS-5. We never migrate here; the UI asks for a backup first.
  let fsrsVersion: 5 | 6;
  let weights: number[];
  if (isValidWeights(source.w)) {
    fsrsVersion = 6;
    weights = [...source.w];
  } else if (isValidLegacyWeights(source.w)) {
    fsrsVersion = 5;
    weights = [...source.w];
  } else {
    fsrsVersion = source.fsrsVersion === 5 ? 5 : 6;
    weights = fsrsVersion === 5 ? [...DEFAULT_FSRS5_WEIGHTS] : [...DEFAULT_FSRS_WEIGHTS];
  }

  return {
    request_retention: isRetention(source.request_retention)
      ? source.request_retention
      : base.request_retention,
    maximum_interval: validMaxInterval ? Math.round(maxInterval as number) : base.maximum_interval,
    w: weights,
    enable_fuzz: base.enable_fuzz,
    retention_by_level: retentionByLevel,
    fsrsVersion,
  };
}

export function loadFSRSOptions(): FSRSOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.fsrs);
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
    localStorage.setItem(STORAGE_KEYS.fsrs, JSON.stringify(options));
    emitLocalChange({ kind: 'progress' });
  } catch (e) {
    console.error(e);
  }
}

export function loadReviewLogs(): ReviewLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.reviewLogs);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error(e);
  }
  return [];
}

export function saveReviewLogs(logs: ReviewLog[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.reviewLogs, JSON.stringify(logs.slice(-500))); // keep last 500
  } catch (e) {
    console.error(e);
  }
}

export function pushReviewLog(log: ReviewLog): void {
  const current = loadReviewLogs();
  current.push(log);
  saveReviewLogs(current);
  emitLocalChange({ kind: 'review', log });
}

/**
 * Removes the newest log. When `expected` is given, only that exact review can be removed:
 * another tab (or a later session) may have written a newer log on the shared device.
 */
export function popReviewLog(
  expected?: Pick<ReviewLog, 'cardId' | 'reviewTime'>
): ReviewLog | null {
  const current = loadReviewLogs();
  const last = current[current.length - 1];
  if (!last) return null;
  if (expected && (last.cardId !== expected.cardId || last.reviewTime !== expected.reviewTime)) {
    return null;
  }
  current.pop();
  saveReviewLogs(current);
  emitLocalChange({ kind: 'undo', log: last });
  return last;
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Checks the shape of a stored attempt, so a corrupt entry cannot break the Learn tab. */
function isQuizAttempt(v: unknown): v is QuizAttempt {
  if (typeof v !== 'object' || v === null) return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a.id === 'string' &&
    typeof a.level === 'string' &&
    typeof a.finishedAt === 'string' &&
    isCount(a.correct) &&
    isCount(a.total)
  );
}

/** Quiz results, newest first. Invalid stored entries are dropped, not thrown. */
export function loadQuizAttempts(): QuizAttempt[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.quizAttempts);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isQuizAttempt) : [];
  } catch (e) {
    console.error('Failed to load quiz attempts', e);
    return [];
  }
}

/** Keeps the newest attempts of each level, so one level's history cannot evict another's. */
export function saveQuizAttempt(attempt: QuizAttempt): void {
  try {
    const all = loadQuizAttempts();
    const sameLevel = [attempt, ...all.filter((a) => a.level === attempt.level)].slice(0, MAX_QUIZ_ATTEMPTS);
    const others = all.filter((a) => a.level !== attempt.level);
    localStorage.setItem(STORAGE_KEYS.quizAttempts, JSON.stringify([...sameLevel, ...others]));
    emitLocalChange({ kind: 'progress' });
  } catch (e) {
    console.error('Failed to save quiz attempt', e);
  }
}

/** Ids of the grammar points the student has marked as studied. */
export function loadGrammarStudied(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.grammarStudied);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch (e) {
    console.error('Failed to load grammar progress', e);
    return [];
  }
}

export function markGrammarStudied(id: string): void {
  try {
    const ids = Array.from(new Set([...loadGrammarStudied(), id]));
    localStorage.setItem(STORAGE_KEYS.grammarStudied, JSON.stringify(ids));
    emitLocalChange({ kind: 'progress' });
  } catch (e) {
    console.error('Failed to save grammar progress', e);
  }
}
