import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeckConfig, StudyPlan } from '../types/card';
import {
  addDaysToKey,
  createStudyPlan,
  dateKeyOf,
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
