import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Card } from '../types/card';
import { balanceDue, fuzzRange, reviewLoadByDay } from './loadBalance';
import { addDaysToKey, studyDayKey, todayKey } from './studyPlan';

const now = new Date(2026, 9, 20, 12, 0, 0);
const DAY_MS = 86400000;

const review = (id: string, days: number): Card => ({
  id,
  hanzi: '字',
  pinyin: 'zi',
  ptbr: 'palavra',
  level: 'HSK 1',
  state: 2,
  due: new Date(now.getTime() + days * DAY_MS).toISOString(),
  stability: days,
  difficulty: 5,
  elapsed_days: 0,
  scheduled_days: days,
  reps: 3,
  lapses: 0,
  last_review: now.toISOString(),
});

test('fuzz ranges follow FSRS and leave short intervals alone', () => {
  assert.deepEqual(fuzzRange(2, 36500), [2, 2]);
  assert.deepEqual(fuzzRange(10, 36500), [8, 12]);
  const [min, max] = fuzzRange(100, 36500);
  assert.ok(min >= 93 && max <= 107);
});

test('a review moves to the least loaded day in its range', () => {
  const crowded = Array.from({ length: 30 }, (_, i) => review(`c${i}`, 10));
  const lighter = Array.from({ length: 5 }, (_, i) => review(`l${i}`, 9));
  const load = reviewLoadByDay([...crowded, ...lighter], 0);
  const balanced = balanceDue(review('x', 10), load, now, 0, 36500);
  const day = studyDayKey(new Date(balanced.due), 0);
  assert.notEqual(day, addDaysToKey(todayKey(now), 10));
  assert.equal(balanced.scheduled_days, 11);
  assert.equal(day, addDaysToKey(todayKey(now), 11));
});

test('with an even load the FSRS day is kept', () => {
  const card = review('x', 10);
  assert.equal(balanceDue(card, new Map(), now, 0, 36500), card);
});
