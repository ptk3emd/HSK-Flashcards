import { Card, DeckConfig, ExamAttempt, FSRSOptions } from '../types/card';

/** The study data one student keeps in the cloud: the shape of a user_progress row. */
export interface RemoteProgress {
  cards: Card[];
  deck_config: DeckConfig | null;
  fsrs_options: FSRSOptions | null;
  stories_read: string[];
  exam_attempts: ExamAttempt[];
  updated_at?: string;
}

/** A card worth keeping in the cloud: studied, suspended or annotated. Untouched ones come from the bundled deck. */
export function isTouched(card: Card): boolean {
  return card.state !== 0 || card.reps > 0 || !!card.suspended || !!card.mnemonic;
}

const time = (iso?: string) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
};

/** The copy with the more recent review wins; with no review on either side, the one with more history. */
function newerCard(local: Card, remote: Card): Card {
  const lt = time(local.last_review);
  const rt = time(remote.last_review);
  if (rt !== lt) return rt > lt ? remote : local;
  if (remote.reps !== local.reps) return remote.reps > local.reps ? remote : local;
  // Same review state: keep local scheduling and take a note or suspension set elsewhere
  return {
    ...local,
    mnemonic: local.mnemonic ?? remote.mnemonic,
    suspended: local.suspended || remote.suspended || undefined,
  };
}

/**
 * Combines this device's cards with the cloud copy, card by card. Cards only the cloud has
 * (another device added a level) are appended; nothing local is ever dropped.
 */
export function mergeCards(local: Card[], remote: Card[]): Card[] {
  const remoteById = new Map(remote.map((c) => [c.id, c]));
  const merged = local.map((c) => {
    const r = remoteById.get(c.id);
    if (!r) return c;
    remoteById.delete(c.id);
    return newerCard(c, r);
  });
  return remoteById.size > 0 ? [...merged, ...remoteById.values()] : merged;
}

/** Exam attempts from both sides, once each, newest first. */
export function mergeAttempts(local: ExamAttempt[], remote: ExamAttempt[]): ExamAttempt[] {
  const byId = new Map<string, ExamAttempt>();
  for (const a of [...local, ...remote]) if (!byId.has(a.id)) byId.set(a.id, a);
  return [...byId.values()].sort((a, b) => time(b.finishedAt) - time(a.finishedAt));
}

export function mergeStories(local: string[], remote: string[]): string[] {
  return Array.from(new Set([...local, ...remote]));
}

/** Checks a row from the server before it can touch local data. */
export function parseRemoteProgress(row: unknown): RemoteProgress | null {
  if (typeof row !== 'object' || row === null) return null;
  const r = row as Record<string, unknown>;
  const isObj = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v);
  const cards = Array.isArray(r.cards)
    ? (r.cards.filter(
        (c) => isObj(c) && typeof (c as Card).id === 'string' && typeof (c as Card).hanzi === 'string' && typeof (c as Card).due === 'string'
      ) as Card[])
    : [];
  return {
    cards,
    deck_config: isObj(r.deck_config) ? (r.deck_config as DeckConfig) : null,
    fsrs_options: isObj(r.fsrs_options) ? (r.fsrs_options as FSRSOptions) : null,
    stories_read: Array.isArray(r.stories_read) ? r.stories_read.filter((s): s is string => typeof s === 'string') : [],
    exam_attempts: Array.isArray(r.exam_attempts)
      ? (r.exam_attempts.filter((a) => isObj(a) && typeof (a as ExamAttempt).id === 'string') as ExamAttempt[])
      : [],
    updated_at: typeof r.updated_at === 'string' ? r.updated_at : undefined,
  };
}
