import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEYS,
  compactSyncOutbox,
  dropSentOutboxEntries,
  loadReviewLogs,
  popReviewLog,
  saveReviewLogs,
} from './storage';
import type { OutboxEntry } from './storage';
import type { ReviewLog } from '../types/card';

const memory = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, String(value)),
    removeItem: (key: string) => memory.delete(key),
    clear: () => memory.clear(),
    key: (index: number) => [...memory.keys()][index] ?? null,
    get length() {
      return memory.size;
    },
  } satisfies Storage,
});

const reviewLog = (cardId: string, reviewTime: string): ReviewLog => ({
  cardId,
  rating: 3,
  state: 2,
  due: reviewTime,
  stability: 10,
  difficulty: 5,
  elapsed_days: 5,
  last_elapsed_days: 5,
  scheduled_days: 5,
  reviewTime,
  previousCardSnapshot: {
    id: cardId,
    hanzi: '字',
    pinyin: 'zi',
    ptbr: 'palavra',
    level: 'HSK 1',
    state: 2,
    due: reviewTime,
    stability: 10,
    difficulty: 5,
    elapsed_days: 5,
    scheduled_days: 5,
    reps: 1,
    lapses: 0,
  },
});

const entry = (
  op: OutboxEntry['op'],
  cardId: string,
  reviewedAt: string
): OutboxEntry => ({
  op,
  cardId,
  rating: 3,
  state: 2,
  reviewedAt,
  scheduledDays: 1,
  stability: 1,
  difficulty: 5,
});

test('undo only removes the exact log this session recorded', () => {
  const first = reviewLog('a', '2026-10-20T10:00:00.000Z');
  const second = reviewLog('b', '2026-10-20T10:01:00.000Z');
  saveReviewLogs([first, second]);

  assert.equal(
    popReviewLog({ cardId: first.cardId, reviewTime: first.reviewTime }),
    null
  );
  assert.equal(loadReviewLogs().length, 2);

  const removed = popReviewLog({ cardId: second.cardId, reviewTime: second.reviewTime });
  assert.equal(removed?.cardId, 'b');
  assert.equal(loadReviewLogs().length, 1);
});

test('a valid but non-array review history is treated as empty', () => {
  memory.set(STORAGE_KEYS.reviewLogs, JSON.stringify({ cardId: 'a' }));
  assert.deepEqual(loadReviewLogs(), []);
});

test('the sync outbox collapses an answer followed by its undo', () => {
  const pending = compactSyncOutbox([
    entry('add', 'a', '2026-10-20T10:00:00.000Z'),
    entry('remove', 'a', '2026-10-20T10:00:00.000Z'),
  ]);
  assert.deepEqual(pending.map(e => e.op), ['remove']);
});

test('the sync outbox keeps a redo after an undo', () => {
  const pending = compactSyncOutbox([
    entry('remove', 'a', '2026-10-20T10:00:00.000Z'),
    entry('add', 'a', '2026-10-20T10:00:00.000Z'),
  ]);
  assert.deepEqual(pending.map(e => e.op), ['add']);
});

test('a sent answer does not remove an undo queued while it was in flight', () => {
  const answer = entry('add', 'a', '2026-10-20T10:00:00.000Z');
  const undo = entry('remove', 'a', '2026-10-20T10:00:00.000Z');
  const compacted = compactSyncOutbox([answer, undo]);
  const remaining = dropSentOutboxEntries(compacted, [answer]);
  assert.deepEqual(remaining.map(e => e.op), ['remove']);
});

test('a sent batch keeps later answers and undos queued in flight', () => {
  const sent = [
    entry('add', 'a', '2026-10-20T10:00:00.000Z'),
    entry('add', 'b', '2026-10-20T10:01:00.000Z'),
  ];
  const queued = [
    entry('add', 'b', '2026-10-20T10:01:00.000Z'),
    entry('remove', 'a', '2026-10-20T10:00:00.000Z'),
  ];
  const remaining = dropSentOutboxEntries(queued, sent);
  assert.deepEqual(
    remaining.map(e => `${e.op}:${e.cardId}`),
    ['remove:a']
  );
});

test('the sync outbox preserves distinct reviews in order', () => {
  const pending = compactSyncOutbox([
    entry('add', 'a', '2026-10-20T10:00:00.000Z'),
    entry('add', 'b', '2026-10-20T10:01:00.000Z'),
    entry('add', 'a', '2026-10-20T10:02:00.000Z'),
  ]);
  assert.deepEqual(
    pending.map(e => `${e.cardId}@${e.reviewedAt}`),
    ['a@2026-10-20T10:00:00.000Z', 'b@2026-10-20T10:01:00.000Z', 'a@2026-10-20T10:02:00.000Z']
  );
});
