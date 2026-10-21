import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Card, DeckConfig, StudyPlan } from '../types/card';
import { DEFAULT_FSRS_OPTIONS } from './fsrs';
import {
  addDaysToKey,
  capDueForPlan,
  createStudyPlan,
  dateKeyOf,
  effectiveDailyLimits,
  MAX_INTENSIVE_MINUTES,
  daysBetweenKeys,
  mergeStudyPlan,
  parseDateKey,
  sanitizeStudyDayStartHour,
  sanitizeStudyPlan,
  studyDayKey,
  studyDayStartForDateKey,
  todayKey,
} from './studyPlan';
import { mergeDeckConfig } from './syncMerge';
import { DEFAULT_GESTURES } from './gestures';

const plan = (extra: Partial<StudyPlan> = {}): StudyPlan => ({
  targetDate: '2026-12-12',
  targetRetention: 0.9,
  enabled: true,
  updatedAt: '2026-10-20T12:00:00.000Z',
  ...extra,
});

const config = (studyPlan?: StudyPlan): DeckConfig => ({
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
  studyPlan,
});

test('valid study plans survive sanitizing and invalid ones are dropped', () => {
  assert.deepEqual(sanitizeStudyPlan(plan()), plan());
  assert.equal(sanitizeStudyPlan({ ...plan(), targetDate: '2026-02-30' }), undefined);
  assert.equal(sanitizeStudyPlan({ ...plan(), targetDate: '12/12/2026' }), undefined);
  assert.equal(sanitizeStudyPlan(null), undefined);
  assert.deepEqual(sanitizeStudyPlan({ ...plan(), targetRetention: 0.2 }), {
    ...plan(),
    targetRetention: 0.9,
  });
  assert.equal(sanitizeStudyPlan({ ...plan(), enabled: false })?.enabled, false);
});

test('plan dates are calendar keys, independent of time zones', () => {
  assert.equal(dateKeyOf(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(todayKey(new Date(2026, 9, 20, 12)), '2026-10-20');
  assert.equal(parseDateKey('2024-02-29')?.toISOString(), '2024-02-29T00:00:00.000Z');
  assert.equal(parseDateKey('2026-02-29'), null);
  assert.equal(addDaysToKey('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetweenKeys('2026-10-20', '2026-12-12'), 53);
});

test('the study day rolls over at the configured hour', () => {
  assert.equal(studyDayKey(new Date(2026, 0, 5, 3, 59), 4), '2026-01-04');
  assert.equal(studyDayKey(new Date(2026, 0, 5, 4, 0), 4), '2026-01-05');
  assert.equal(todayKey(new Date(2026, 0, 5, 2, 0), 4), '2026-01-04');
  assert.equal(todayKey(new Date(2026, 0, 5, 2, 0)), '2026-01-05');
  assert.equal(studyDayStartForDateKey('2026-01-05', 4).getHours(), 4);
  assert.equal(sanitizeStudyDayStartHour(24), 0);
  assert.equal(sanitizeStudyDayStartHour(4.5), 0);
  assert.equal(sanitizeStudyDayStartHour('4'), 0);
});

test('createStudyPlan timestamps the save', () => {
  assert.deepEqual(createStudyPlan('2026-12-12', 0.85, new Date('2026-10-20T10:00:00Z')), {
    targetDate: '2026-12-12',
    targetRetention: 0.85,
    enabled: true,
    updatedAt: '2026-10-20T10:00:00.000Z',
  });
});

test('the newest plan wins, including a newer disabled plan', () => {
  const older = plan();
  const newer = plan({ targetDate: '2027-01-10', updatedAt: '2026-11-01T00:00:00.000Z' });
  assert.deepEqual(mergeStudyPlan(older, newer), newer);
  assert.deepEqual(mergeStudyPlan(newer, older), newer);
  const ended = plan({ enabled: false, updatedAt: '2026-12-01T00:00:00.000Z' });
  assert.deepEqual(mergeStudyPlan(newer, ended), ended);
  assert.deepEqual(mergeStudyPlan(undefined, newer), newer);
  assert.deepEqual(mergeStudyPlan(older, undefined), older);
});

test('deck settings merge without losing the newer local plan', () => {
  const local = config(plan({ targetDate: '2027-01-01', updatedAt: '2026-11-02T00:00:00.000Z' }));
  const remote = config(plan({ targetDate: '2026-12-01', updatedAt: '2026-11-01T00:00:00.000Z' }));
  remote.dailyNewLimit = 50;
  const merged = mergeDeckConfig(local, remote);
  assert.equal(merged.dailyNewLimit, 50);
  assert.deepEqual(merged.studyPlan, local.studyPlan);
});

test('a goal plan keeps its fields and the applied limits replace the settings', () => {
  const raw = {
    targetDate: '2026-12-20',
    targetRetention: 0.9,
    enabled: true,
    updatedAt: '2026-10-20T12:00:00.000Z',
    levels: ['HSK 1', 'HSK 1', 7],
    pace: 'intensive',
    minutesPerDay: 9999,
    applied: { date: '2026-10-20', newPerDay: 30, reviewsPerDay: 400, retention: 0.95 },
  };
  const plan = sanitizeStudyPlan(raw);
  assert.ok(plan);
  assert.deepEqual(plan.levels, ['HSK 1']);
  assert.equal(plan.pace, 'intensive');
  assert.equal(plan.minutesPerDay, MAX_INTENSIVE_MINUTES);
  assert.equal(plan.goal, 'mature');
  const limits = effectiveDailyLimits({ dailyNewLimit: 20, dailyReviewLimit: 100, studyPlan: plan });
  assert.deepEqual(limits, { dailyNewLimit: 30, dailyReviewLimit: 400 });
  assert.deepEqual(effectiveDailyLimits({ dailyNewLimit: 20, dailyReviewLimit: 100 }), {
    dailyNewLimit: 20,
    dailyReviewLimit: 100,
  });
});

test('a review falling after the exam with low recall then is pulled to the day before it', () => {
  const now = new Date(2026, 9, 20, 12, 0, 0);
  const plan = createStudyPlan('2026-11-10', 0.9, now, { levels: ['HSK 1'], pace: 'dynamic', minutesPerDay: 45 });
  const card: Card = {
    id: 'a',
    hanzi: '字',
    pinyin: 'zi',
    ptbr: 'palavra',
    level: 'HSK 1',
    state: 2,
    due: new Date(2026, 11, 20, 12).toISOString(),
    stability: 10,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 61,
    reps: 3,
    lapses: 0,
    last_review: now.toISOString(),
  };
  const capped = capDueForPlan(card, plan, ['HSK 1'], now, DEFAULT_FSRS_OPTIONS.w, 0);
  assert.equal(studyDayKey(new Date(capped.due)), '2026-11-09');
  const strong = { ...card, stability: 2000 };
  assert.equal(capDueForPlan(strong, plan, ['HSK 1'], now, DEFAULT_FSRS_OPTIONS.w, 0), strong);
  const other = { ...card, level: 'HSK 2' };
  assert.equal(capDueForPlan(other, plan, ['HSK 1'], now, DEFAULT_FSRS_OPTIONS.w, 0), other);
});
