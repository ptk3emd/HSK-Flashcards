import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import { Card, DeckConfig, FSRSOptions, ReviewLog } from '../types/card';
import {
  LocalChange,
  OutboxEntry,
  STORAGE_KEYS,
  dropSentOutboxEntries,
  loadDeckConfig,
  loadFSRSOptions,
  loadGrammarStudied,
  loadQuizAttempts,
  loadReviewLogs,
  loadStoredCards,
  loadSyncOutbox,
  localChanges,
  sanitizeFSRSOptions,
  saveSyncOutbox,
} from './storage';
import { ACTIVE_COURSE } from './courseId';
import {
  isTouched,
  mergeAttempts,
  mergeCards,
  mergeDeckConfig,
  mergeIds,
  parseRemoteProgress,
  preferNewerFSRS,
} from './syncMerge';

/**
 * Cloud copy of the study data in Supabase. The app keeps working from localStorage;
 * when a student is signed in, every local save is mirrored to their own rows
 * (user_progress, review_logs), and signing in on another device merges both copies.
 * Without a publishable key at build time the whole feature stays off.
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://iyxolajfrjgqpazvonwm.supabase.co';
const SUPABASE_KEY: string | undefined = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isCloudEnabled = Boolean(SUPABASE_KEY);

let client: SupabaseClient | null = null;
export function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_KEY) return null;
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}

/** PostgREST and Postgres errors for a column that does not exist yet. */
function isMissingCourseColumn(error: { code?: string; message?: string }): boolean {
  return error.code === '42703' || error.code === 'PGRST204' || /column .*course/i.test(error.message ?? '');
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

/** What the app must apply after the first sync of a session: the merged study data. */
export interface MergedState {
  cards: Card[];
  deckConfig: DeckConfig;
  fsrsOptions: FSRSOptions;
}

const PUSH_DELAY_MS = 2500;
const BATCH = 200;

function writeLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Failed to save synced data', e);
  }
}

function toOutbox(op: OutboxEntry['op'], log: ReviewLog): OutboxEntry {
  return {
    op,
    cardId: log.cardId,
    rating: log.rating,
    state: log.state,
    reviewedAt: log.reviewTime,
    scheduledDays: log.scheduled_days,
    stability: log.stability,
    difficulty: log.difficulty,
  };
}

/**
 * One signed-in sync session. start() pulls and merges once, then local changes are
 * pushed: progress as a debounced upsert, each answer as a row (queued while offline).
 */
export class CloudSync {
  private pushTimer: number | undefined;
  private flushing = false;
  /** True while the database still has one progress row per user (before the per-course migration) */
  private legacyRow = false;
  private stopped = false;
  private readonly onChange = (e: Event) => this.handleChange((e as CustomEvent<LocalChange>).detail);
  private readonly onOnline = () => {
    this.schedulePush(0);
    void this.flushOutbox();
  };

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly userId: string,
    private readonly onStatus: (status: SyncStatus) => void
  ) {}

  /** Merges the cloud copy into this device and returns what the app should now show. */
  async start(local: MergedState): Promise<MergedState> {
    this.onStatus('syncing');
    const columns = 'cards, deck_config, fsrs_options, grammar_studied, quiz_attempts, updated_at';
    let { data, error } = await this.supabase
      .from('user_progress')
      .select(columns)
      .eq('user_id', this.userId)
      .eq('course', ACTIVE_COURSE)
      .maybeSingle();
    if (error && isMissingCourseColumn(error)) {
      // The per-course migration is not applied yet: the single row there is Mandarin.
      // French stays local until it is, so it can never overwrite that row.
      if (ACTIVE_COURSE !== 'zh') throw error;
      this.legacyRow = true;
      ({ data, error } = await this.supabase.from('user_progress').select(columns).eq('user_id', this.userId).maybeSingle());
    }
    if (error) throw error;

    let merged = local;
    const remote = parseRemoteProgress(data);
    if (remote) {
      const cards = mergeCards(local.cards, remote.cards);
      // Settings follow the account once it has any: the last device to save them wins
      const deckConfig = remote.deck_config
        ? mergeDeckConfig(local.deckConfig, remote.deck_config)
        : local.deckConfig;
      const fsrsOptions = remote.fsrs_options
        ? preferNewerFSRS(local.fsrsOptions, sanitizeFSRSOptions(remote.fsrs_options))
        : local.fsrsOptions;
      writeLocal(STORAGE_KEYS.cards, cards);
      writeLocal(STORAGE_KEYS.settings, deckConfig);
      writeLocal(STORAGE_KEYS.fsrs, fsrsOptions);
      writeLocal(STORAGE_KEYS.grammarStudied, mergeIds(loadGrammarStudied(), remote.grammar_studied));
      writeLocal(STORAGE_KEYS.quizAttempts, mergeAttempts(loadQuizAttempts(), remote.quiz_attempts));
      merged = { cards, deckConfig, fsrsOptions };
    }

    if (this.stopped) return merged;
    localChanges.addEventListener('change', this.onChange);
    window.addEventListener('online', this.onOnline);
    // Answers given before signing in (the last 500 kept on this device) join the history;
    // the unique key makes this a no-op for the ones already there.
    const pending = loadSyncOutbox();
    const known = new Set(pending.map((e) => `${e.cardId}|${e.reviewedAt}`));
    const backlog = loadReviewLogs()
      .map((log) => toOutbox('add', log))
      .filter((e) => !known.has(`${e.cardId}|${e.reviewedAt}`));
    saveSyncOutbox([...backlog, ...pending]);
    await this.pushProgress();
    await this.flushOutbox();
    return merged;
  }

  stop(): void {
    this.stopped = true;
    window.clearTimeout(this.pushTimer);
    localChanges.removeEventListener('change', this.onChange);
    window.removeEventListener('online', this.onOnline);
  }

  private handleChange(change: LocalChange): void {
    if (change.kind === 'review' || change.kind === 'undo') {
      saveSyncOutbox([...loadSyncOutbox(), toOutbox(change.kind === 'review' ? 'add' : 'remove', change.log)]);
      void this.flushOutbox();
    }
    this.schedulePush(PUSH_DELAY_MS);
  }

  private schedulePush(delay: number): void {
    window.clearTimeout(this.pushTimer);
    this.pushTimer = window.setTimeout(() => void this.pushProgress(), delay);
  }

  /** Upserts this student's row from what is saved locally right now. */
  private async pushProgress(): Promise<void> {
    if (this.stopped) return;
    if (!navigator.onLine) return this.onStatus('offline');
    this.onStatus('syncing');
    const row = {
      user_id: this.userId,
      cards: (loadStoredCards() ?? []).filter(isTouched),
      deck_config: loadDeckConfig(),
      fsrs_options: loadFSRSOptions(),
      grammar_studied: loadGrammarStudied(),
      quiz_attempts: loadQuizAttempts(),
      updated_at: new Date().toISOString(),
    };
    const { error } = this.legacyRow
      ? await this.supabase.from('user_progress').upsert(row)
      : await this.supabase.from('user_progress').upsert({ ...row, course: ACTIVE_COURSE }, { onConflict: 'user_id,course' });
    if (this.stopped) return;
    if (error) {
      console.error('Cloud sync failed', error);
      this.onStatus(navigator.onLine ? 'error' : 'offline');
    } else {
      this.onStatus('synced');
    }
  }

  /** Sends queued answers in order; stops at the first failure and keeps the rest for later. */
  private async flushOutbox(): Promise<void> {
    if (this.flushing || this.stopped || !navigator.onLine) return;
    this.flushing = true;
    try {
      let queue = loadSyncOutbox();
      while (queue.length > 0 && !this.stopped) {
        // Consecutive answers go in one request; an undo goes on its own, in order
        const firstRemove = queue.findIndex((e) => e.op === 'remove');
        const run = queue[0].op === 'remove' ? [queue[0]] : queue.slice(0, Math.min(BATCH, firstRemove === -1 ? queue.length : firstRemove));
        const { error } =
          run[0].op === 'add'
            ? await this.supabase.from('review_logs').upsert(
                run.map((entry) => ({
                  user_id: this.userId,
                  card_id: entry.cardId,
                  rating: entry.rating,
                  state: entry.state,
                  reviewed_at: entry.reviewedAt,
                  scheduled_days: entry.scheduledDays,
                  stability: entry.stability,
                  difficulty: entry.difficulty,
                })),
                { onConflict: 'user_id,card_id,reviewed_at', ignoreDuplicates: true }
              )
            : await this.supabase
                .from('review_logs')
                .delete()
                .eq('user_id', this.userId)
                .eq('card_id', run[0].cardId)
                .eq('reviewed_at', run[0].reviewedAt);
        if (error) {
          console.error('Failed to send reviews', error);
          break;
        }
        // Re-read: answers may have been queued while this request was in flight. Remove
        // exactly what was sent, so an undo queued meanwhile is never dropped by accident.
        queue = dropSentOutboxEntries(loadSyncOutbox(), run);
        saveSyncOutbox(queue);
      }
    } finally {
      this.flushing = false;
    }
  }
}

export type { Session };
