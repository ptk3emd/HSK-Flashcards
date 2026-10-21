import { Card, DeckConfig, FSRSOptions, Rating, ReviewLog, StudyPlan } from '../types/card';
import { elapsedDaysSince, getForgettingCurveParams, scheduleCard } from './fsrs';
import { binIndexFor, CALIBRATION_BINS, predictedRecall } from './calibration';
import { dailyUsage } from './dailyUsage';
import {
  addDaysToKey,
  daysBetweenKeys,
  MAX_STUDY_PLAN_DAYS,
  sanitizeStudyDayStartHour,
  studyDayKey,
  studyDayStartForDateKey,
  todayKey,
} from './studyPlan';

export type PlannerBottleneck = 'none' | 'new' | 'review' | 'both' | 'retention';

export interface PlannerInput {
  cards: Card[];
  deckConfig: DeckConfig;
  fsrsOptions: FSRSOptions;
  logs: ReviewLog[];
  plan: StudyPlan;
  now: string;
  seed?: number;
}

export interface PlannerDay {
  date: string;
  newCards: number;
  reviews: number;
  backlog: number;
}

export interface PlannerResult {
  targetDate: string;
  today: string;
  days: number;
  studyDays: number;
  runs: number;
  totalCards: number;
  remainingNew: number;
  requiredNewPerDay: number;
  dailyNewLimit: number;
  dailyReviewLimit: number;
  targetRetention: number;
  coverage: number;
  coverageLow: number;
  coverageHigh: number;
  retention: number;
  retentionLow: number;
  retentionHigh: number;
  onTargetShare: number;
  onTargetShareLow: number;
  onTargetShareHigh: number;
  introducedCards: number;
  averageNewPerDay: number;
  averageReviewsPerDay: number;
  peakReviewsPerDay: number;
  overloadedDays: number;
  feasible: boolean;
  bottleneck: PlannerBottleneck;
  forecast: PlannerDay[];
}

interface Bucket {
  learning: number[];
  reviews: number[];
}

interface Calendar {
  now: Date;
  today: string;
  targetDate: string;
  targetTime: Date;
  studyDays: number;
  dayStartHour: number;
}

interface OutcomeModel {
  successAt: (retrievability: number) => number;
  newGrades: number[];
  learningGrades: number[];
  reviewGrades: number[];
}

interface RunSummary {
  coverage: number;
  retention: number;
  onTargetShare: number;
  introduced: number;
  peakReviews: number;
  overloadedDays: number;
}

const DAY_MS = 1000 * 60 * 60 * 24;
const MAX_INTRADAY_STEPS = 4;
const MIN_RUNS = 30;
const MAX_RUNS = 100;
const CALIBRATION_PRIOR = 12;
const GRADE_PRIOR = 12;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const index = clamp(Math.floor((sorted.length - 1) * q), 0, sorted.length - 1);
  return sorted[index];
}

function normalizeGrades(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return [0.2, 0.2, 0.45, 0.15];
  return values.map((value) => Math.max(0, value) / total);
}

function blendGrades(observed: number[], prior: number[]): number[] {
  return normalizeGrades(observed.map((count, index) => count + prior[index] * GRADE_PRIOR));
}

function buildOutcomeModel(
  logs: ReviewLog[],
  weights: number[],
  twoButtonGrading: boolean
): OutcomeModel {
  const bins = CALIBRATION_BINS.map(() => ({ count: 0, recalled: 0 }));
  const newCounts = [0, 0, 0, 0];
  const learningCounts = [0, 0, 0, 0];
  const reviewCounts = [0, 0, 0, 0];

  for (const log of logs) {
    const snapshot = log.previousCardSnapshot;
    if (!snapshot) continue;
    const ratingIndex = log.rating - 1;
    if (snapshot.state === 0) {
      newCounts[ratingIndex] += 1;
    } else if (snapshot.state === 1 || snapshot.state === 3) {
      learningCounts[ratingIndex] += 1;
    } else if (snapshot.state === 2) {
      if (log.rating > 1) reviewCounts[ratingIndex] += 1;
      const predicted = predictedRecall(log, weights);
      if (predicted !== null) {
        const bin = bins[binIndexFor(predicted)];
        bin.count += 1;
        bin.recalled += log.rating > 1 ? 1 : 0;
      }
    }
  }

  const newGrades = blendGrades(newCounts, [0.1, 0.15, 0.6, 0.15]);
  const learningGrades = blendGrades(learningCounts, [0.08, 0.12, 0.65, 0.15]);
  const reviewGrades = blendGrades(reviewCounts, [0, 0.1, 0.8, 0.1]);
  if (twoButtonGrading) {
    newGrades[1] = 0;
    newGrades[3] = 0;
    learningGrades[1] = 0;
    learningGrades[3] = 0;
    reviewGrades[1] = 0;
    reviewGrades[3] = 0;
  }

  return {
    successAt(retrievability: number): number {
      const safe = clamp(retrievability, 0, 1);
      const bin = bins[binIndexFor(safe)];
      if (bin.count === 0) return safe;
      const observed = bin.recalled / bin.count;
      const confidence = bin.count / (bin.count + CALIBRATION_PRIOR);
      return clamp(safe * (1 - confidence) + observed * confidence, 0.02, 0.995);
    },
    newGrades: normalizeGrades(newGrades),
    learningGrades: normalizeGrades(learningGrades),
    reviewGrades: normalizeGrades(reviewGrades),
  };
}

function sampleGrade(profile: number[], rng: () => number): Rating {
  const roll = rng();
  let cumulative = 0;
  for (let index = 0; index < profile.length; index += 1) {
    cumulative += profile[index];
    if (roll <= cumulative) return (index + 1) as Rating;
  }
  return 3;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hashText(hash: number, text: string): number {
  let value = hash;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function hashNumber(hash: number, number: number): number {
  return hashText(hash, Number.isFinite(number) ? String(number) : '');
}

export function plannerKey(input: PlannerInput): string {
  let hash = 2166136261;
  hash = hashText(hash, input.now.slice(0, 13));
  hash = hashText(hash, input.plan.targetDate);
  hash = hashNumber(hash, input.plan.targetRetention);
  hash = hashNumber(hash, input.plan.enabled ? 1 : 0);
  hash = hashNumber(hash, input.deckConfig.dailyNewLimit);
  hash = hashNumber(hash, input.deckConfig.dailyReviewLimit);
  hash = hashNumber(hash, sanitizeStudyDayStartHour(input.deckConfig.studyDayStartHour));
  hash = hashNumber(hash, input.fsrsOptions.request_retention);
  hash = hashNumber(hash, input.fsrsOptions.maximum_interval);
  hash = hashText(hash, input.fsrsOptions.w.join(','));
  hash = hashNumber(hash, input.fsrsOptions.fsrsVersion ?? 6);
  hash = hashText(hash, JSON.stringify(input.fsrsOptions.retention_by_level ?? {}));
  hash = hashText(hash, input.deckConfig.twoButtonGrading ? 'two' : 'four');
  hash = hashNumber(hash, input.seed ?? 0);
  hash = hashNumber(hash, input.cards.length);
  for (const card of input.cards) {
    hash = hashText(hash, card.id);
    hash = hashNumber(hash, card.state);
    hash = hashNumber(hash, card.due ? Date.parse(card.due) : 0);
    hash = hashNumber(hash, card.stability);
    hash = hashNumber(hash, card.difficulty);
    hash = hashNumber(hash, card.reps);
    hash = hashNumber(hash, card.lapses);
    hash = hashText(hash, card.level);
    hash = hashText(hash, card.last_review ?? '');
  }
  hash = hashNumber(hash, input.logs.length);
  for (const log of input.logs) {
    const snapshot = log.previousCardSnapshot;
    hash = hashText(
      hash,
      `${log.cardId}|${log.reviewTime}|${log.rating}|${log.state}|${snapshot?.stability ?? ''}|${
        snapshot?.last_review ?? ''
      }|${snapshot?.difficulty ?? ''}`
    );
  }
  return hash.toString(16);
}

function studyDayStart(now: Date, offsetDays: number, startHour: number): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour, 0, 0, 0);
  if (now.getTime() < start.getTime()) start.setDate(start.getDate() - 1);
  start.setDate(start.getDate() + offsetDays);
  return start;
}

function targetDayEnd(targetDate: string, startHour: number): Date {
  const start = studyDayStartForDateKey(targetDate, startHour);
  start.setDate(start.getDate() + 1);
  return new Date(start.getTime() - 1);
}

function dayIndexFor(
  due: Date,
  today: string,
  studyDays: number,
  startHour: number
): number {
  if (!Number.isFinite(due.getTime())) return 0;
  const difference = daysBetweenKeys(today, studyDayKey(due, startHour));
  if (difference <= 0) return 0;
  return difference < studyDays ? difference : -1;
}

interface Curve {
  decay: number;
  factor: number;
}

function curveFor(weights: number[]): Curve {
  return getForgettingCurveParams(weights);
}

function retrievabilityAt(card: Card, at: Date, curve: Curve): number {
  if (!card.last_review || card.stability <= 0) return 0.5;
  const elapsed = elapsedDaysSince(card.last_review, at);
  return Math.pow(1 + (curve.factor * elapsed) / card.stability, curve.decay);
}

function runCount(totalCards: number, studyDays: number): number {
  const work = Math.max(1, totalCards) * (1 + studyDays / 30);
  return clamp(Math.round(1_000_000 / work), MIN_RUNS, MAX_RUNS);
}

function createBuckets(studyDays: number): Bucket[] {
  return Array.from({ length: studyDays }, () => ({ learning: [], reviews: [] }));
}

function simulateRun(
  input: PlannerInput,
  calendar: Calendar,
  outcome: OutcomeModel,
  seed: number
): { summary: RunSummary; dailyNew: number[]; dailyReviews: number[]; dailyBacklog: number[] } {
  const { cards, deckConfig, fsrsOptions, logs, plan } = input;
  const curve = curveFor(fsrsOptions.w);
  const rng = mulberry32(seed);
  const working = cards.map((card) => ({ ...card }));
  const buckets = createBuckets(calendar.studyDays);
  const newPool: number[] = [];
  const dailyNew = new Array<number>(calendar.studyDays).fill(0);
  const dailyReviews = new Array<number>(calendar.studyDays).fill(0);
  const dailyBacklog = new Array<number>(calendar.studyDays).fill(0);
  const usage = dailyUsage(logs, calendar.now, calendar.dayStartHour);
  let newPointer = 0;
  let peakReviews = 0;
  let overloadedDays = 0;

  for (let index = 0; index < working.length; index += 1) {
    const card = working[index];
    if (card.state === 0) {
      newPool.push(index);
      continue;
    }
    const day = dayIndexFor(
      new Date(card.due),
      calendar.today,
      calendar.studyDays,
      calendar.dayStartHour
    );
    if (day < 0) continue;
    if (card.state === 2) buckets[day].reviews.push(index);
    else buckets[day].learning.push(index);
  }

  for (let day = 0; day < calendar.studyDays; day += 1) {
    const dayStart = studyDayStart(calendar.now, day, calendar.dayStartHour);
    const nextDayStart = studyDayStart(calendar.now, day + 1, calendar.dayStartHour);
    const dayEnd = new Date(nextDayStart.getTime() - 1);
    const baseSession = new Date(dayStart);
    baseSession.setHours(9, 0, 0, 0);
    const sessionAt = new Date(
      Math.max(calendar.now.getTime(), baseSession.getTime(), dayStart.getTime())
    );
    const newLimit = Math.max(
      0,
      deckConfig.dailyNewLimit - (day === 0 ? usage.newCards : 0)
    );
    const reviewLimit = Math.max(
      0,
      deckConfig.dailyReviewLimit - (day === 0 ? usage.reviews : 0)
    );

    const bucket = buckets[day];
    const reviewScores = new Map<number, number>();
    for (const index of bucket.reviews) {
      reviewScores.set(index, retrievabilityAt(working[index], sessionAt, curve));
    }
    bucket.reviews.sort(
      (left, right) => (reviewScores.get(left) ?? 0) - (reviewScores.get(right) ?? 0)
    );
    const reviewTasks = bucket.reviews.slice(0, reviewLimit);
    const backlog = bucket.reviews.length - reviewTasks.length;
    dailyReviews[day] += reviewTasks.length;
    dailyBacklog[day] += backlog;
    if (backlog > 0) overloadedDays += 1;
    if (day + 1 < calendar.studyDays) {
      buckets[day + 1].reviews.push(...bucket.reviews.slice(reviewLimit));
    }

    const newTasks: number[] = [];
    while (newTasks.length < newLimit && newPointer < newPool.length) {
      newTasks.push(newPool[newPointer]);
      newPointer += 1;
    }
    dailyNew[day] += newTasks.length;

    const queue: { index: number; at: Date; isNew: boolean }[] = [];
    for (const index of bucket.learning) queue.push({ index, at: sessionAt, isNew: false });
    for (const index of reviewTasks) queue.push({ index, at: sessionAt, isNew: false });
    for (const index of newTasks) queue.push({ index, at: sessionAt, isNew: true });
    const steps = new Map<number, number>();
    let processedReviews = 0;

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const task = queue[cursor];
      const card = working[task.index];
      if (!card) continue;
      const previousState = card.state;
      let at = task.at;
      const due = new Date(card.due);
      if (Number.isFinite(due.getTime()) && due > at) at = due;
      const retrievability = retrievabilityAt(card, at, curve);

      let rating: Rating;
      if (previousState === 2) {
        if (rng() > outcome.successAt(retrievability)) {
          rating = 1;
        } else {
          rating = sampleGrade(outcome.reviewGrades, rng);
        }
      } else if (previousState === 0) {
        rating = sampleGrade(outcome.newGrades, rng);
      } else {
        rating = sampleGrade(outcome.learningGrades, rng);
      }

      const updated = scheduleCard(card, rating, at, fsrsOptions);
      working[task.index] = updated;
      if (previousState === 2) processedReviews += 1;

      const nextDue = new Date(updated.due);
      if (updated.state === 1 || updated.state === 3) {
        const step = (steps.get(task.index) ?? 0) + 1;
        steps.set(task.index, step);
        if (nextDue <= dayEnd && step <= MAX_INTRADAY_STEPS) {
          queue.push({ index: task.index, at: nextDue, isNew: false });
        } else if (day + 1 < calendar.studyDays) {
          buckets[day + 1].learning.push(task.index);
        }
      } else if (updated.state === 2) {
        const nextDay = dayIndexFor(
          nextDue,
          calendar.today,
          calendar.studyDays,
          calendar.dayStartHour
        );
        if (nextDay > day) buckets[nextDay].reviews.push(task.index);
        else if (nextDay >= 0 && day + 1 < calendar.studyDays) {
          buckets[day + 1].reviews.push(task.index);
        }
      }
    }

    peakReviews = Math.max(peakReviews, processedReviews);
  }

  let introduced = 0;
  let retentionSum = 0;
  let onTarget = 0;
  for (const card of working) {
    if (card.state === 0) continue;
    introduced += 1;
    const retrievability = card.last_review
      ? retrievabilityAt(card, calendar.targetTime, curve)
      : 0;
    retentionSum += retrievability;
    if (retrievability >= plan.targetRetention) onTarget += 1;
  }

  const total = working.length;
  return {
    summary: {
      coverage: total > 0 ? introduced / total : 1,
      retention: introduced > 0 ? retentionSum / introduced : 1,
      onTargetShare: introduced > 0 ? onTarget / introduced : 1,
      introduced,
      peakReviews,
      overloadedDays,
    },
    dailyNew,
    dailyReviews,
    dailyBacklog,
  };
}

function emptyResult(input: PlannerInput, calendar: Calendar, runs: number): PlannerResult {
  const remainingNew = input.cards.filter((card) => card.state === 0).length;
  return {
    targetDate: calendar.targetDate,
    today: calendar.today,
    days: Math.max(0, daysBetweenKeys(calendar.today, calendar.targetDate)),
    studyDays: calendar.studyDays,
    runs,
    totalCards: input.cards.length,
    remainingNew,
    requiredNewPerDay: Math.ceil(remainingNew / calendar.studyDays),
    dailyNewLimit: input.deckConfig.dailyNewLimit,
    dailyReviewLimit: input.deckConfig.dailyReviewLimit,
    targetRetention: input.plan.targetRetention,
    coverage: input.cards.length === 0 ? 1 : 0,
    coverageLow: input.cards.length === 0 ? 1 : 0,
    coverageHigh: input.cards.length === 0 ? 1 : 0,
    retention: input.cards.length === 0 ? 1 : 0,
    retentionLow: input.cards.length === 0 ? 1 : 0,
    retentionHigh: input.cards.length === 0 ? 1 : 0,
    onTargetShare: input.cards.length === 0 ? 1 : 0,
    onTargetShareLow: input.cards.length === 0 ? 1 : 0,
    onTargetShareHigh: input.cards.length === 0 ? 1 : 0,
    introducedCards: 0,
    averageNewPerDay: 0,
    averageReviewsPerDay: 0,
    peakReviewsPerDay: 0,
    overloadedDays: 0,
    feasible: input.cards.length === 0,
    bottleneck: input.cards.length === 0 ? 'none' : 'new',
    forecast: [],
  };
}

export function runStudyPlan(input: PlannerInput): PlannerResult {
  const now = new Date(input.now);
  const safeNow = Number.isFinite(now.getTime()) ? now : new Date();
  const dayStartHour = sanitizeStudyDayStartHour(input.deckConfig.studyDayStartHour);
  const today = todayKey(safeNow, dayStartHour);
  const requestedDate = input.plan.targetDate >= today ? input.plan.targetDate : today;
  const maxDate = addDaysToKey(today, MAX_STUDY_PLAN_DAYS);
  const targetDate = requestedDate <= maxDate ? requestedDate : maxDate;
  const studyDays = Math.max(1, daysBetweenKeys(today, targetDate) + 1);
  const calendar: Calendar = {
    now: safeNow,
    today,
    targetDate,
    targetTime: targetDayEnd(targetDate, dayStartHour),
    studyDays,
    dayStartHour,
  };
  const cards = input.cards.filter((card) => !card.suspended);
  const eligibleInput = { ...input, cards };
  const runs = runCount(cards.length, studyDays);
  if (cards.length === 0) return emptyResult(eligibleInput, calendar, runs);

  const twoButtonGrading = input.deckConfig.twoButtonGrading;
  const outcome = buildOutcomeModel(input.logs, input.fsrsOptions.w, twoButtonGrading);
  const key = plannerKey(eligibleInput);
  const baseSeed = input.seed ?? parseInt(key.slice(0, 8), 16);
  const results: RunSummary[] = [];
  const dailyNewTotal = new Array<number>(studyDays).fill(0);
  const dailyReviewTotal = new Array<number>(studyDays).fill(0);
  const dailyBacklogTotal = new Array<number>(studyDays).fill(0);
  let totalNew = 0;
  let totalReviews = 0;

  for (let run = 0; run < runs; run += 1) {
    const result = simulateRun(
      eligibleInput,
      calendar,
      outcome,
      (baseSeed + Math.imul(run + 1, 2654435761)) >>> 0
    );
    results.push(result.summary);
    for (let day = 0; day < studyDays; day += 1) {
      dailyNewTotal[day] += result.dailyNew[day];
      dailyReviewTotal[day] += result.dailyReviews[day];
      dailyBacklogTotal[day] += result.dailyBacklog[day];
      totalNew += result.dailyNew[day];
      totalReviews += result.dailyReviews[day];
    }
  }

  const coverages = results.map((result) => result.coverage).sort((a, b) => a - b);
  const retentions = results.map((result) => result.retention).sort((a, b) => a - b);
  const onTargetShares = results.map((result) => result.onTargetShare).sort((a, b) => a - b);
  const introducedCounts = results.map((result) => result.introduced).sort((a, b) => a - b);
  const peakReviews = results.map((result) => result.peakReviews).sort((a, b) => a - b);
  const overloadedDays = results.map((result) => result.overloadedDays).sort((a, b) => a - b);

  const initialIntroduced = cards.filter((card) => card.state !== 0).length;
  const remainingNew = cards.length - initialIntroduced;
  const requiredNewPerDay = Math.ceil(remainingNew / studyDays);
  const coverage = quantile(coverages, 0.5);
  const retention = quantile(retentions, 0.5);
  const onTargetShare = quantile(onTargetShares, 0.5);
  const overloadedAverage = overloadedDays.reduce((sum, value) => sum + value, 0) / runs;
  const newLimited = coverage < 0.999;
  const reviewLimited = overloadedAverage >= 0.5;
  const feasible =
    coverage >= 0.999 &&
    retention >= input.plan.targetRetention - 0.01 &&
    overloadedAverage < 0.5;

  let bottleneck: PlannerBottleneck = 'none';
  if (newLimited && reviewLimited) bottleneck = 'both';
  else if (newLimited) bottleneck = 'new';
  else if (reviewLimited) bottleneck = 'review';
  else if (!feasible) bottleneck = 'retention';

  return {
    targetDate,
    today,
    days: Math.max(0, daysBetweenKeys(today, targetDate)),
    studyDays,
    runs,
    totalCards: cards.length,
    remainingNew,
    requiredNewPerDay,
    dailyNewLimit: input.deckConfig.dailyNewLimit,
    dailyReviewLimit: input.deckConfig.dailyReviewLimit,
    targetRetention: input.plan.targetRetention,
    coverage: round(coverage),
    coverageLow: round(quantile(coverages, 0.1)),
    coverageHigh: round(quantile(coverages, 0.9)),
    retention: round(retention),
    retentionLow: round(quantile(retentions, 0.1)),
    retentionHigh: round(quantile(retentions, 0.9)),
    onTargetShare: round(onTargetShare),
    onTargetShareLow: round(quantile(onTargetShares, 0.1)),
    onTargetShareHigh: round(quantile(onTargetShares, 0.9)),
    introducedCards: quantile(introducedCounts, 0.5),
    averageNewPerDay: round(totalNew / runs / studyDays, 2),
    averageReviewsPerDay: round(totalReviews / runs / studyDays, 2),
    peakReviewsPerDay: quantile(peakReviews, 0.5),
    overloadedDays: Math.round(overloadedAverage),
    feasible,
    bottleneck,
    forecast: Array.from({ length: studyDays }, (_, day) => ({
      date: addDaysToKey(today, day),
      newCards: round(dailyNewTotal[day] / runs, 2),
      reviews: round(dailyReviewTotal[day] / runs, 2),
      backlog: round(dailyBacklogTotal[day] / runs, 2),
    })),
  };
}
