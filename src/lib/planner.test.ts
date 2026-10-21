import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Card, DeckConfig, ReviewLog, StudyPlan } from '../types/card';
import { DEFAULT_FSRS_OPTIONS } from './fsrs';
import { DEFAULT_GESTURES } from './gestures';
import { addDaysToKey, todayKey } from './studyPlan';
import { PlannerInput, runStudyPlan } from './planner';

const now = new Date(2026, 9, 20, 12, 0, 0);
const DAY_MS = 1000 * 60 * 60 * 24;

const plan = (days: number, retention = 0.9): StudyPlan => ({
  targetDate: addDaysToKey(todayKey(now), days),
  targetRetention: retention,
  enabled: true,
  updatedAt: now.toISOString(),
});

const config = (overrides: Partial<DeckConfig> = {}): DeckConfig => ({
  dailyNewLimit: 20,
  dailyReviewLimit: 100,
  studyDayStartHour: 0,
  autoPlayAudio: true,
  speechSpeed: 0.85,
  speechVoiceGender: 'auto',
  activeLevels: ['HSK 1'],
  hideSystemBar: false,
  hideAnswerButtons: false,
  twoButtonGrading: true,
  gestures: DEFAULT_GESTURES,
  ...overrides,
});

const newCards = (count: number): Card[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `N-${String(index + 1).padStart(5, '0')}`,
    hanzi: '字',
    pinyin: 'zi',
    ptbr: 'palavra',
    level: 'HSK 1',
    state: 0,
    due: now.toISOString(),
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
  }));

const reviewCards = (count: number): Card[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `R-${String(index + 1).padStart(5, '0')}`,
    hanzi: '字',
    pinyin: 'zi',
    ptbr: 'palavra',
    level: 'HSK 1',
    state: 2,
    due: new Date(now.getTime() - DAY_MS).toISOString(),
    stability: 10,
    difficulty: 5,
    elapsed_days: 20,
    scheduled_days: 10,
    reps: 2,
    lapses: 0,
    last_review: new Date(now.getTime() - 20 * DAY_MS).toISOString(),
  }));

const input = (cards: Card[], deckConfig: DeckConfig, days: number, seed = 7): PlannerInput => ({
  cards,
  deckConfig,
  fsrsOptions: DEFAULT_FSRS_OPTIONS,
  logs: [],
  plan: plan(days),
  now: now.toISOString(),
  seed,
});

test('a reachable date covers all new cards within the daily new limit', () => {
  const result = runStudyPlan(input(newCards(300), config(), 30));
  assert.equal(result.totalCards, 300);
  assert.equal(result.remainingNew, 300);
  assert.equal(result.requiredNewPerDay, 10);
  assert.equal(result.coverage, 1);
  assert.equal(result.introducedCards, 300);
  assert.ok(result.retention >= 0.8);
  assert.equal(result.forecast.length, 31);
});

test('an impossible new-card budget lowers coverage and names the new limit', () => {
  const result = runStudyPlan(input(newCards(100), config({ dailyNewLimit: 2 }), 10));
  assert.ok(result.coverage < 0.3);
  assert.equal(result.requiredNewPerDay, 10);
  assert.equal(result.bottleneck, 'new');
  assert.equal(result.feasible, false);
});

test('a review backlog marks the review limit as the bottleneck', () => {
  const result = runStudyPlan(
    input(reviewCards(50), config({ dailyNewLimit: 0, dailyReviewLimit: 5 }), 10)
  );
  assert.equal(result.coverage, 1);
  assert.ok(result.overloadedDays > 0);
  assert.equal(result.bottleneck, 'review');
  assert.ok(result.peakReviewsPerDay <= 5);
});

test('the new limit already used today still caps coverage on a same-day target', () => {
  const cards = reviewCards(5);
  const logs: ReviewLog[] = cards.map((card) => ({
    cardId: card.id,
    rating: 3,
    state: 0,
    due: card.due,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    last_elapsed_days: 0,
    scheduled_days: 0,
    reviewTime: new Date(now.getTime() - 1000).toISOString(),
    previousCardSnapshot: { ...card, state: 0 },
  }));
  const result = runStudyPlan({
    ...input([...newCards(10), ...cards], config({ dailyNewLimit: 10 }), 0),
    logs,
  });
  assert.ok(result.coverage < 1);
  assert.equal(result.requiredNewPerDay, result.dailyNewLimit);
  assert.equal(result.bottleneck, 'new');
});

test('cards scheduled beyond the target are not pulled back into the next day', () => {
  const cards = reviewCards(20).map((card) => ({ ...card, stability: 1000 }));
  const result = runStudyPlan(input(cards, config({ dailyNewLimit: 0 }), 5));
  const totalReviews = result.forecast.reduce((sum, day) => sum + day.reviews, 0);
  assert.ok(totalReviews < 40);
});

test('the planner starts the study day at the configured hour', () => {
  const early = new Date(2026, 9, 20, 2, 0, 0);
  const result = runStudyPlan({
    ...input([], config({ studyDayStartHour: 4 }), 5),
    now: early.toISOString(),
    plan: { ...plan(5), targetDate: addDaysToKey(todayKey(early, 4), 5) },
  });
  assert.equal(result.today, '2026-10-19');
  assert.equal(result.days, 5);
});

test('random valid plans keep their invariants', () => {
  let state = 123456789;
  const random = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };

  for (let round = 0; round < 8; round += 1) {
    const startHour = Math.floor(random() * 24);
    const base = new Date(2026, 9, 20, Math.floor(random() * 24), 30, 0);
    const total = 1 + Math.floor(random() * 18);
    const cards: Card[] = Array.from({ length: total }, (_, index) => {
      const stateValue = [0, 1, 2, 3][Math.floor(random() * 4)] as Card['state'];
      const reviewed = stateValue !== 0;
      return {
        id: `F-${round}-${index}`,
        hanzi: '字',
        pinyin: 'zi',
        ptbr: 'palavra',
        level: 'HSK 1',
        state: stateValue,
        due: new Date(
          base.getTime() + (Math.floor(random() * 30) - 10) * DAY_MS
        ).toISOString(),
        stability: reviewed ? 0.2 + random() * 80 : 0,
        difficulty: reviewed ? 1 + random() * 9 : 0,
        elapsed_days: reviewed ? random() * 20 : 0,
        scheduled_days: reviewed ? random() * 20 : 0,
        reps: reviewed ? 1 + Math.floor(random() * 10) : 0,
        lapses: reviewed ? Math.floor(random() * 4) : 0,
        last_review: reviewed
          ? new Date(base.getTime() - (2 + random() * 30) * DAY_MS).toISOString()
          : undefined,
        suspended: random() < 0.1,
      };
    });
    const days = Math.floor(random() * 21);
    const targetDate = addDaysToKey(todayKey(base, startHour), days);
    const result = runStudyPlan({
      cards,
      deckConfig: config({
        dailyNewLimit: Math.floor(random() * 21),
        dailyReviewLimit: Math.floor(random() * 41),
        studyDayStartHour: startHour,
      }),
      fsrsOptions: DEFAULT_FSRS_OPTIONS,
      logs: [],
      plan: {
        targetDate,
        targetRetention: 0.7 + random() * 0.29,
        enabled: true,
        updatedAt: base.toISOString(),
      },
      now: base.toISOString(),
      seed: round + 1,
    });

    assert.ok(result.forecast.length >= 1);
    assert.equal(result.forecast.length, result.studyDays);
    assert.equal(result.days + 1, result.studyDays);
    assert.equal(result.totalCards, cards.filter((card) => !card.suspended).length);
    assert.ok(result.coverage >= 0 && result.coverage <= 1);
    assert.ok(result.retention >= 0 && result.retention <= 1);
    assert.ok(result.onTargetShare >= 0 && result.onTargetShare <= 1);
    assert.ok(Number.isFinite(result.requiredNewPerDay));
    for (const day of result.forecast) {
      assert.ok(day.newCards >= 0);
      assert.ok(day.reviews >= 0);
      assert.ok(day.backlog >= 0);
    }
  }
});

test('suspended cards stay out of the plan', () => {
  const cards = newCards(10);
  cards[0].suspended = true;
  const result = runStudyPlan(input(cards, config(), 5));
  assert.equal(result.totalCards, 9);
  assert.equal(result.coverage, 1);
});

test('the same input and seed produce the same forecast', () => {
  const one = runStudyPlan(input(reviewCards(20), config({ dailyReviewLimit: 8 }), 7, 42));
  const two = runStudyPlan(input(reviewCards(20), config({ dailyReviewLimit: 8 }), 7, 42));
  assert.deepEqual(one, two);
});
