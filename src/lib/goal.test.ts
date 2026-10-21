import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Card, DeckConfig, ReviewLog, StudyPlan } from '../types/card';
import { DEFAULT_FSRS_OPTIONS } from './fsrs';
import { DEFAULT_GESTURES } from './gestures';
import { addDaysToKey, todayKey } from './studyPlan';
import { measurePace, PlannerInput, runStudyPlan } from './planner';

const now = new Date(2026, 9, 20, 12, 0, 0);

const goal = (days: number, overrides: Partial<StudyPlan> = {}): StudyPlan => ({
  targetDate: addDaysToKey(todayKey(now), days),
  targetRetention: 0.9,
  enabled: true,
  updatedAt: now.toISOString(),
  levels: ['HSK 1'],
  pace: 'dynamic',
  minutesPerDay: 45,
  goal: 'mature',
  ...overrides,
});

const config: DeckConfig = {
  dailyNewLimit: 20,
  dailyReviewLimit: 100,
  studyDayStartHour: 0,
  autoPlayAudio: true,
  speechSpeed: 0.85,
  speechVoiceGender: 'auto',
  activeLevels: ['HSK 1', 'HSK 2'],
  hideSystemBar: false,
  hideAnswerButtons: false,
  twoButtonGrading: true,
  gestures: DEFAULT_GESTURES,
};

const cards = (count: number, level = 'HSK 1'): Card[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `${level}-${index}`,
    hanzi: '字',
    pinyin: 'zi',
    ptbr: 'palavra',
    level,
    state: 0,
    due: now.toISOString(),
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
  }));

const input = (deck: Card[], plan: StudyPlan, logs: ReviewLog[] = []): PlannerInput => ({
  cards: deck,
  deckConfig: config,
  fsrsOptions: DEFAULT_FSRS_OPTIONS,
  logs,
  plan,
  now: now.toISOString(),
  seed: 11,
});

test('a 60-day goal for 300 words solves new cards per day inside the time budget', () => {
  const started = Date.now();
  const result = runStudyPlan(input(cards(300), goal(60)));
  const elapsed = Date.now() - started;
  assert.ok(result.goal, 'goal solution present');
  assert.equal(result.totalCards, 300);
  assert.ok(result.feasible, `feasible, mature ${result.matureShare}`);
  assert.ok(result.matureShare >= 0.8, `mature ${result.matureShare}`);
  assert.ok(result.goal.newPerDay >= 300 / 60, `new per day ${result.goal.newPerDay}`);
  assert.ok(result.goal.peakMinutes <= 45, `peak ${result.goal.peakMinutes} min`);
  assert.ok(elapsed < 20000, `took ${elapsed} ms`);
});

test('only the goal levels are planned', () => {
  const result = runStudyPlan(input([...cards(100), ...cards(400, 'HSK 2')], goal(60)));
  assert.equal(result.totalCards, 100);
});

test('a deadline too short to mature every word is infeasible and says what it would need', () => {
  const result = runStudyPlan(input(cards(300), goal(15, { minutesPerDay: 10 })));
  assert.equal(result.feasible, false);
  assert.ok(result.goal);
  assert.ok(result.goal.neededMinutesPerDay === null || result.goal.neededMinutesPerDay > 10);
});

test('intensive mode front-loads new cards and raises retention within the same budget', () => {
  const dynamic = runStudyPlan(input(cards(300), goal(60, { minutesPerDay: 90 })));
  const intensive = runStudyPlan(input(cards(300), goal(60, { minutesPerDay: 90, pace: 'intensive' })));
  assert.ok(intensive.goal && dynamic.goal);
  assert.ok(intensive.goal.retention >= dynamic.goal.retention);
  assert.ok(intensive.goal.newPerDay >= dynamic.goal.newPerDay);
  assert.ok(intensive.goal.peakMinutes <= 90);
});

test('missed days raise the new cards needed per day', () => {
  const fresh = runStudyPlan(input(cards(300), goal(60)));
  const later = runStudyPlan({
    ...input(cards(300), goal(60)),
    plan: { ...goal(60), targetDate: addDaysToKey(todayKey(now), 45) },
  });
  assert.ok(fresh.goal && later.goal);
  assert.ok(later.goal.newPerDay > fresh.goal.newPerDay);
});

test('pace is measured from the gaps between answers in a sitting', () => {
  const base = cards(1)[0];
  const logs: ReviewLog[] = Array.from({ length: 40 }, (_, index) => ({
    cardId: `c${index}`,
    rating: 3,
    state: 2,
    due: now.toISOString(),
    stability: 5,
    difficulty: 5,
    elapsed_days: 1,
    last_elapsed_days: 1,
    scheduled_days: 3,
    reviewTime: new Date(now.getTime() + index * 6000).toISOString(),
    previousCardSnapshot: { ...base, state: 2 },
  }));
  const pace = measurePace(logs);
  assert.equal(pace.measured, true);
  assert.equal(pace.secondsPerReview, 6);
  assert.equal(measurePace([]).measured, false);
});

test('a large goal is simulated on a sample and scaled back to the whole deck', () => {
  const started = Date.now();
  const result = runStudyPlan(input(cards(2000), goal(240, { minutesPerDay: 90 })));
  assert.equal(result.totalCards, 2000);
  assert.ok(result.goal);
  assert.ok(result.goal.newPerDay >= 2000 / 240, `new per day ${result.goal.newPerDay}`);
  assert.ok(result.goal.peakMinutes <= 95, `peak ${result.goal.peakMinutes}`);
  assert.ok(Date.now() - started < 20000, `took ${Date.now() - started} ms`);
});
