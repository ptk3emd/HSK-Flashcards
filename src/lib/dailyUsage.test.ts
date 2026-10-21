import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Card, ReviewLog } from '../types/card';
import { dailyUsage, remainingDailyLimits, reviewedCardIdsOnDay } from './dailyUsage';

const now = new Date(2026, 9, 20, 18, 0, 0);

const card = (id: string, state: Card['state']): Card => ({
  id,
  hanzi: id,
  pinyin: '',
  ptbr: '',
  level: 'HSK 1',
  state,
  due: now.toISOString(),
  stability: 0,
  difficulty: 0,
  elapsed_days: 0,
  scheduled_days: 0,
  reps: 0,
  lapses: 0,
});

const log = (id: string, state: Card['state'], at: Date): ReviewLog => ({
  cardId: id,
  rating: 3,
  state,
  due: at.toISOString(),
  stability: 1,
  difficulty: 5,
  elapsed_days: 0,
  last_elapsed_days: 0,
  scheduled_days: 1,
  reviewTime: at.toISOString(),
  previousCardSnapshot: card(id, state),
});

test('daily usage counts unique new and review cards from the local day', () => {
  const today = new Date(2026, 9, 20, 9);
  const yesterday = new Date(2026, 9, 19, 23, 30);
  const logs = [
    log('new-1', 0, today),
    log('new-1', 1, today),
    log('new-2', 0, today),
    log('review-1', 2, today),
    log('review-1', 3, today),
    log('review-2', 2, today),
    log('old-new', 0, yesterday),
    log('old-review', 2, yesterday),
  ];
  assert.deepEqual(dailyUsage(logs, now), { newCards: 2, reviews: 2 });
});

test('daily usage follows the study-day rollover hour', () => {
  const justAfterMidnight = new Date(2026, 9, 20, 1);
  const afterRollover = new Date(2026, 9, 20, 5);
  const logs = [log('night-owl', 0, justAfterMidnight), log('early-bird', 0, afterRollover)];

  assert.deepEqual(dailyUsage(logs, new Date(2026, 9, 20, 2), 4), {
    newCards: 1,
    reviews: 0,
  });
  assert.deepEqual(dailyUsage(logs, new Date(2026, 9, 20, 6), 4), {
    newCards: 1,
    reviews: 0,
  });
  assert.deepEqual(dailyUsage(logs, new Date(2026, 9, 20, 6)), {
    newCards: 2,
    reviews: 0,
  });
});

test('reviewed card ids follow the same study day and include every state', () => {
  const early = new Date(2026, 9, 20, 1);
  const late = new Date(2026, 9, 20, 5);
  const logs = [
    log('new', 0, early),
    log('learning', 1, early),
    log('review', 2, early),
    log('today', 2, late),
    { ...log('invalid', 2, early), reviewTime: 'not-a-date' },
  ];

  assert.deepEqual(
    [...reviewedCardIdsOnDay(logs, new Date(2026, 9, 20, 2), 4)].sort(),
    ['learning', 'new', 'review']
  );
  assert.deepEqual(
    [...reviewedCardIdsOnDay(logs, new Date(2026, 9, 20, 6), 4)].sort(),
    ['today']
  );
});

test('learning steps do not consume the review limit again', () => {
  const today = new Date(2026, 9, 20, 10);
  assert.deepEqual(
    dailyUsage([log('a', 2, today), log('a', 3, today), log('a', 3, today)], now),
    { newCards: 0, reviews: 1 }
  );
});

test('remaining limits never go below zero', () => {
  assert.deepEqual(
    remainingDailyLimits({ dailyNewLimit: 20, dailyReviewLimit: 100 }, { newCards: 12, reviews: 8 }),
    { newCards: 8, reviews: 92 }
  );
  assert.deepEqual(
    remainingDailyLimits({ dailyNewLimit: 20, dailyReviewLimit: 100 }, { newCards: 25, reviews: 120 }),
    { newCards: 0, reviews: 0 }
  );
});
