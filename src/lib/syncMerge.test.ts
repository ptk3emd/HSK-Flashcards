import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Card } from '../types/card';
import { isTouched, mergeAttempts, mergeCards, parseRemoteProgress } from './syncMerge';

const card = (id: string, extra: Partial<Card> = {}): Card => ({
  id, hanzi: id, pinyin: '', ptbr: '', level: 'HSK 1',
  state: 0, due: '2026-01-01T00:00:00.000Z', stability: 0, difficulty: 0,
  elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0, ...extra,
});

test('the more recent review wins, card by card', () => {
  const local = [card('a', { state: 2, reps: 3, last_review: '2026-10-10T00:00:00Z' }), card('b', { state: 2, reps: 1, last_review: '2026-10-01T00:00:00Z' })];
  const remote = [card('a', { state: 2, reps: 2, last_review: '2026-10-05T00:00:00Z' }), card('b', { state: 2, reps: 2, last_review: '2026-10-12T00:00:00Z' })];
  const merged = mergeCards(local, remote);
  assert.equal(merged.find((c) => c.id === 'a')?.reps, 3);
  assert.equal(merged.find((c) => c.id === 'b')?.reps, 2);
});

test('cards only the cloud has are added and nothing local is dropped', () => {
  const merged = mergeCards([card('a'), card('b')], [card('z', { state: 1, reps: 1 })]);
  assert.deepEqual(merged.map((c) => c.id), ['a', 'b', 'z']);
});

test('with the same review state, a note or suspension from the other device is kept', () => {
  const merged = mergeCards([card('a')], [card('a', { mnemonic: 'dica', suspended: true })]);
  assert.equal(merged[0].mnemonic, 'dica');
  assert.equal(merged[0].suspended, true);
});

test('only touched cards are worth syncing', () => {
  assert.equal(isTouched(card('a')), false);
  assert.equal(isTouched(card('a', { reps: 1, state: 1 })), true);
  assert.equal(isTouched(card('a', { suspended: true })), true);
  assert.equal(isTouched(card('a', { mnemonic: 'x' })), true);
});

test('exam attempts are merged once each, newest first', () => {
  const a = { id: '1', level: 'HSK 1', finishedAt: '2026-10-01T00:00:00Z', correct: { listening: 1, reading: 1 }, total: { listening: 2, reading: 2 } };
  const b = { ...a, id: '2', finishedAt: '2026-10-05T00:00:00Z' };
  assert.deepEqual(mergeAttempts([a], [a, b]).map((x) => x.id), ['2', '1']);
});

test('a malformed server row cannot inject bad cards', () => {
  const parsed = parseRemoteProgress({ cards: [card('a'), { id: 3 }, null, 'x'], stories_read: ['s', 4], deck_config: [] });
  assert.equal(parsed?.cards.length, 1);
  assert.deepEqual(parsed?.stories_read, ['s']);
  assert.equal(parsed?.deck_config, null);
  assert.equal(parseRemoteProgress(null), null);
});
