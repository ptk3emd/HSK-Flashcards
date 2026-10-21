import { Card, DeckConfig, FSRSOptions, Rating, ReviewLog, StudyPlan } from '../types/card';
import { calculateInterval, elapsedDaysSince, getForgettingCurveParams, scheduleCard } from './fsrs';
import { binIndexFor, CALIBRATION_BINS, predictedRecall } from './calibration';
import { dailyUsage } from './dailyUsage';
import {
  addDaysToKey,
  capDueForPlan,
  daysBetweenKeys,
  isGoalPlan,
  MAX_NEW_PER_DAY,
  MAX_REVIEWS_PER_DAY,
  MAX_STUDY_PLAN_DAYS,
  planLevels,
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
  /** Share of the cards that end mature (an interval of 21 days or more from their memory) */
  matureShare: number;
  /** Set when the plan is a goal: the daily limits it solved for and what they cost */
  goal?: GoalSolution;
}

export interface StudyPace {
  secondsPerNew: number;
  secondsPerReview: number;
  measured: boolean;
}

export interface GoalSolution {
  pace: 'dynamic' | 'intensive';
  minutesPerDay: number;
  newPerDay: number;
  reviewsPerDay: number;
  retention: number;
  secondsPerNew: number;
  secondsPerReview: number;
  paceMeasured: boolean;
  minutesToday: number;
  peakMinutes: number;
  /** Today's share of the plan, already bounded by the time left today */
  newToday: number;
  reviewsToday: number;
  /** When the goal does not fit: the daily minutes it would need, if any amount up to the ceiling works */
  neededMinutesPerDay: number | null;
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
  matureShare: number;
  introduced: number;
  peakReviews: number;
  overloadedDays: number;
  peakSeconds: number;
}

/** What one simulation follows each day: the limits, the time budget and the scheduler. */
interface SimParams {
  newPerDay: number;
  reviewsPerDay: number;
  budgetSeconds: number;
  pace: StudyPace;
  fsrsOptions: FSRSOptions;
  capToTarget: boolean;
  /** The simulated cards stand for this many real ones each (a sample of a large deck) */
  scale: number;
}

const MATURE_DAYS = 21;
const DEFAULT_SECONDS_NEW = 20;
const DEFAULT_SECONDS_REVIEW = 8;
const SESSION_GAP_MS = 3 * 60 * 1000;
/** A new card also brings its same-day learning steps */
const NEW_CARD_STEP_FACTOR = 1.5;
const SEARCH_RUNS = 6;
/** Large goals simulate an evenly spread sample of this many cards and scale the counts */
const GOAL_SAMPLE_MAX = 400;
/**
 * Share of the words that must end mature. Never 100%: a word missed in the last weeks is
 * relearning with a short interval whatever the pace. The goal asks for this share, or for
 * what the student's own error rate allows when that is lower (the ceiling minus a margin).
 */
export const MATURE_TARGET = 0.9;
const MATURE_MARGIN = 0.03;
/** Below this ceiling the date is too close for most words to mature at any pace */
const MATURE_FLOOR = 0.6;
const INTENSIVE_RETENTIONS = [0.97, 0.95, 0.93, 0.9];

const DAY_MS = 1000 * 60 * 60 * 24;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Seconds per card from the review history: the gap between consecutive answers in the same
 * sitting (under 3 minutes), split into first views of new cards and everything else.
 */
export function measurePace(logs: ReviewLog[]): StudyPace {
  const ordered = logs
    .map((log) => ({ log, time: Date.parse(log.reviewTime) }))
    .filter((entry) => Number.isFinite(entry.time))
    .sort((a, b) => a.time - b.time);
  const fresh: number[] = [];
  const reviews: number[] = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const gap = ordered[index].time - ordered[index - 1].time;
    if (gap <= 0 || gap > SESSION_GAP_MS) continue;
    const previousState = ordered[index].log.previousCardSnapshot?.state ?? ordered[index].log.state;
    (previousState === 0 ? fresh : reviews).push(gap / 1000);
  }
  const newMedian = fresh.length >= 10 ? median(fresh) : null;
  const reviewMedian = reviews.length >= 20 ? median(reviews) : null;
  return {
    secondsPerNew: clamp(newMedian ?? DEFAULT_SECONDS_NEW, 4, 90),
    secondsPerReview: clamp(reviewMedian ?? DEFAULT_SECONDS_REVIEW, 3, 60),
    measured: newMedian !== null || reviewMedian !== null,
  };
}

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
  hash = hashText(hash, input.plan.pace ?? '');
  hash = hashNumber(hash, input.plan.minutesPerDay ?? 0);
  hash = hashText(hash, (input.plan.levels ?? []).join(','));
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
  seed: number,
  params: SimParams
): { summary: RunSummary; dailyNew: number[]; dailyReviews: number[]; dailyBacklog: number[] } {
  const { cards, deckConfig, logs, plan } = input;
  const { fsrsOptions } = params;
  const planLevelsList = planLevels(plan, deckConfig.activeLevels);
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
  let peakSeconds = 0;
  const newCost = params.pace.secondsPerNew + NEW_CARD_STEP_FACTOR * params.pace.secondsPerReview;

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
    const bucket = buckets[day];
    // Today's answers already spent part of the limits and of the time budget
    const usedNew = day === 0 ? usage.newCards / params.scale : 0;
    const usedReviews = day === 0 ? usage.reviews / params.scale : 0;
    const spentSeconds =
      usedNew * params.pace.secondsPerNew + usedReviews * params.pace.secondsPerReview;
    let budgetLeft = params.budgetSeconds - spentSeconds - bucket.learning.length * params.pace.secondsPerReview;
    const reviewCap = Number.isFinite(params.budgetSeconds)
      ? Math.max(0, Math.floor(budgetLeft / params.pace.secondsPerReview))
      : Infinity;
    const reviewLimit = Math.min(
      reviewCap,
      Math.max(0, Math.floor(params.reviewsPerDay - usedReviews))
    );
    const reviewScores = new Map<number, number>();
    for (const index of bucket.reviews) {
      reviewScores.set(index, retrievabilityAt(working[index], sessionAt, curve));
    }
    bucket.reviews.sort(
      (left, right) => (reviewScores.get(left) ?? 0) - (reviewScores.get(right) ?? 0)
    );
    const reviewTasks = bucket.reviews.slice(0, reviewLimit);
    const backlog = bucket.reviews.length - reviewTasks.length;
    budgetLeft -= reviewTasks.length * params.pace.secondsPerReview;
    // New cards wait while the reviews are behind, so a backlog never snowballs
    const newCap = Number.isFinite(params.budgetSeconds)
      ? backlog > 0
        ? 0
        : Math.max(0, Math.floor(budgetLeft / newCost))
      : Infinity;
    const newLimit = Math.min(
      newCap,
      Math.max(0, Math.floor(params.newPerDay - usedNew))
    );
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
    peakSeconds = Math.max(
      peakSeconds,
      (bucket.learning.length + reviewTasks.length) * params.pace.secondsPerReview +
        newTasks.length * newCost
    );

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

      const scheduled = scheduleCard(card, rating, at, fsrsOptions);
      const updated = params.capToTarget
        ? capDueForPlan(scheduled, plan, planLevelsList, at, fsrsOptions.w, calendar.dayStartHour)
        : scheduled;
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
  let mature = 0;
  for (const card of working) {
    if (card.state === 0) continue;
    introduced += 1;
    // Mature by memory, not by the last (possibly exam-capped) interval
    if (
      card.state === 2 &&
      calculateInterval(card.stability, fsrsOptions.request_retention, fsrsOptions.maximum_interval, fsrsOptions.w) >=
        MATURE_DAYS
    ) {
      mature += 1;
    }
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
      matureShare: total > 0 ? mature / total : 1,
      introduced,
      peakReviews,
      overloadedDays,
      peakSeconds,
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
    matureShare: input.cards.length === 0 ? 1 : 0,
  };
}

interface Aggregate {
  results: RunSummary[];
  dailyNew: number[];
  dailyReviews: number[];
  dailyBacklog: number[];
  totalNew: number;
  totalReviews: number;
}

function simulateMany(
  input: PlannerInput,
  calendar: Calendar,
  outcome: OutcomeModel,
  runs: number,
  baseSeed: number,
  params: SimParams
): Aggregate {
  const { studyDays } = calendar;
  const results: RunSummary[] = [];
  const dailyNew = new Array<number>(studyDays).fill(0);
  const dailyReviews = new Array<number>(studyDays).fill(0);
  const dailyBacklog = new Array<number>(studyDays).fill(0);
  let totalNew = 0;
  let totalReviews = 0;
  for (let run = 0; run < runs; run += 1) {
    const result = simulateRun(
      input,
      calendar,
      outcome,
      (baseSeed + Math.imul(run + 1, 2654435761)) >>> 0,
      params
    );
    results.push(result.summary);
    for (let day = 0; day < studyDays; day += 1) {
      dailyNew[day] += result.dailyNew[day];
      dailyReviews[day] += result.dailyReviews[day];
      dailyBacklog[day] += result.dailyBacklog[day];
      totalNew += result.dailyNew[day];
      totalReviews += result.dailyReviews[day];
    }
  }
  return { results, dailyNew, dailyReviews, dailyBacklog, totalNew, totalReviews };
}

function medianOf(results: RunSummary[], pick: (run: RunSummary) => number): number {
  return quantile(results.map(pick).sort((a, b) => a - b), 0.5);
}

function overloadOf(results: RunSummary[]): number {
  return results.reduce((sum, run) => sum + run.overloadedDays, 0) / Math.max(1, results.length);
}

function buildResult(
  input: PlannerInput,
  calendar: Calendar,
  cards: Card[],
  runs: number,
  aggregate: Aggregate,
  limits: { newPerDay: number; reviewsPerDay: number },
  scale = 1
): PlannerResult {
  const { results } = aggregate;
  const { studyDays, today, targetDate } = calendar;
  const coverages = results.map((result) => result.coverage).sort((a, b) => a - b);
  const retentions = results.map((result) => result.retention).sort((a, b) => a - b);
  const onTargetShares = results.map((result) => result.onTargetShare).sort((a, b) => a - b);
  const introducedCounts = results.map((result) => result.introduced).sort((a, b) => a - b);
  const peakReviews = results.map((result) => result.peakReviews).sort((a, b) => a - b);

  const initialIntroduced = cards.filter((card) => card.state !== 0).length;
  const remainingNew = cards.length - initialIntroduced;
  const requiredNewPerDay = Math.ceil(remainingNew / studyDays);
  const coverage = quantile(coverages, 0.5);
  const retention = quantile(retentions, 0.5);
  const onTargetShare = quantile(onTargetShares, 0.5);
  const matureShare = medianOf(results, (run) => run.matureShare);
  const overloadedAverage = overloadOf(results);
  const newLimited = coverage < 0.999;
  const reviewLimited = overloadedAverage >= 0.5;
  const goalMature = isGoalPlan(input.plan) && input.plan.goal !== 'retention';
  const feasible =
    coverage >= 0.999 &&
    retention >= input.plan.targetRetention - 0.01 &&
    overloadedAverage < 0.5 &&
    (!goalMature || matureShare >= MATURE_FLOOR);

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
    dailyNewLimit: limits.newPerDay,
    dailyReviewLimit: limits.reviewsPerDay,
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
    introducedCards: Math.min(cards.length, Math.round(quantile(introducedCounts, 0.5) * scale)),
    averageNewPerDay: round((aggregate.totalNew * scale) / runs / studyDays, 2),
    averageReviewsPerDay: round((aggregate.totalReviews * scale) / runs / studyDays, 2),
    peakReviewsPerDay: Math.round(quantile(peakReviews, 0.5) * scale),
    overloadedDays: Math.round(overloadedAverage),
    feasible,
    bottleneck,
    matureShare: round(matureShare),
    forecast: Array.from({ length: studyDays }, (_, day) => ({
      date: addDaysToKey(today, day),
      newCards: round((aggregate.dailyNew[day] * scale) / runs, 2),
      reviews: round((aggregate.dailyReviews[day] * scale) / runs, 2),
      backlog: round((aggregate.dailyBacklog[day] * scale) / runs, 2),
    })),
  };
}

function withRetention(options: FSRSOptions, levels: string[], retention: number): FSRSOptions {
  const byLevel = { ...(options.retention_by_level ?? {}) };
  for (const level of levels) {
    byLevel[level] = Math.max(retention, byLevel[level] ?? options.request_retention);
  }
  return { ...options, retention_by_level: byLevel };
}

/** An evenly spread subset keeping the deck's order (new cards in study order, the rest by due) */
function sampleCards(cards: Card[], max: number): Card[] {
  if (cards.length <= max) return cards;
  const step = cards.length / max;
  return Array.from({ length: max }, (_, index) => cards[Math.floor(index * step)]);
}

interface GoalContext {
  input: PlannerInput;
  calendar: Calendar;
  outcome: OutcomeModel;
  baseSeed: number;
  pace: StudyPace;
  levels: string[];
  remainingNew: number;
  scale: number;
}

/** Answers a day the time allows, under the absolute ceiling */
function reviewCeiling(minutes: number, pace: StudyPace): number {
  return Math.min(MAX_REVIEWS_PER_DAY, Math.floor((minutes * 60) / pace.secondsPerReview));
}

/** Simulation parameters in sample units: limits and time shrink with the sample */
function goalParams(
  context: GoalContext,
  newPerDay: number,
  retention: number,
  minutes: number
): SimParams {
  return {
    newPerDay,
    reviewsPerDay: reviewCeiling(minutes, context.pace) / context.scale,
    budgetSeconds: (minutes * 60) / context.scale,
    pace: context.pace,
    fsrsOptions: withRetention(context.input.fsrsOptions, context.levels, retention),
    capToTarget: true,
    scale: context.scale,
  };
}

interface Trial {
  newPerDay: number;
  matureShare: number;
  reached: boolean;
  overloaded: boolean;
}

function trial(
  context: GoalContext,
  newPerDay: number,
  retention: number,
  minutes: number,
  runs: number,
  matureTarget: number
): Trial {
  const { results } = simulateMany(
    context.input,
    context.calendar,
    context.outcome,
    runs,
    context.baseSeed,
    goalParams(context, newPerDay, retention, minutes)
  );
  const mature = context.input.plan.goal !== 'retention';
  const matureShare = medianOf(results, (run) => run.matureShare);
  const reached = mature
    ? matureShare >= matureTarget
    : medianOf(results, (run) => run.coverage) >= 0.999 &&
      medianOf(results, (run) => run.retention) >= context.input.plan.targetRetention - 0.01;
  return { newPerDay, matureShare, reached, overloaded: overloadOf(results) >= 0.5 };
}

/** The fewest new cards per day that still reach the goal, or null when no amount does. */
function minimalNewPerDay(
  context: GoalContext,
  retention: number,
  minutes: number,
  runs: number
): { found: Trial; matureTarget: number } | null {
  const maxNew = Math.min(Math.ceil(MAX_NEW_PER_DAY / context.scale), Math.max(1, context.remainingNew));
  // The best this student can reach by the date: every new card as early as the time allows
  const ceiling = trial(context, context.remainingNew === 0 ? 0 : maxNew, retention, minutes, runs, 0);
  const mature = context.input.plan.goal !== 'retention';
  if (mature && ceiling.matureShare < MATURE_FLOOR) return null;
  const matureTarget = Math.min(MATURE_TARGET, ceiling.matureShare - MATURE_MARGIN);
  if (context.remainingNew === 0) {
    const done = trial(context, 0, retention, minutes, runs, matureTarget);
    return done.reached && !done.overloaded ? { found: done, matureTarget } : null;
  }
  let low = 1;
  let high = maxNew;
  let found: Trial | null = null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const attempt = trial(context, middle, retention, minutes, runs, matureTarget);
    if (attempt.reached) {
      found = attempt;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }
  return found && !found.overloaded ? { found, matureTarget } : null;
}

/** The most new cards per day that still fit the time every day: the intensive front-load. */
function maximalNewPerDay(
  context: GoalContext,
  from: Trial,
  retention: number,
  minutes: number,
  runs: number,
  matureTarget: number
): Trial {
  let low = from.newPerDay + 1;
  let high = Math.min(Math.ceil(MAX_NEW_PER_DAY / context.scale), context.remainingNew);
  let best = from;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const attempt = trial(context, middle, retention, minutes, runs, matureTarget);
    if (attempt.reached && !attempt.overloaded) {
      best = attempt;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}

function solveGoal(
  context: GoalContext,
  minutes: number,
  runs: number
): { newPerDay: number; retention: number } | null {
  const base = context.input.fsrsOptions.request_retention;
  if (context.input.plan.pace === 'intensive') {
    const maxNew = Math.min(Math.ceil(MAX_NEW_PER_DAY / context.scale), context.remainingNew);
    for (const retention of INTENSIVE_RETENTIONS) {
      if (retention < base) continue;
      // Every new card as early as the time allows: the intensive choice whenever it fits
      const ceiling = trial(context, maxNew, retention, minutes, runs, 0);
      const mature = context.input.plan.goal !== 'retention';
      if (mature && ceiling.matureShare < MATURE_FLOOR) continue;
      if (!ceiling.overloaded) return { newPerDay: maxNew, retention };
      const minimal = minimalNewPerDay(context, retention, minutes, runs);
      if (!minimal) continue;
      const chosen = maximalNewPerDay(context, minimal.found, retention, minutes, runs, minimal.matureTarget);
      return { newPerDay: chosen.newPerDay, retention };
    }
  }
  const minimal = minimalNewPerDay(context, base, minutes, runs);
  return minimal ? { newPerDay: minimal.found.newPerDay, retention: base } : null;
}

const NEEDED_MINUTES_STEPS = [30, 45, 60, 90, 120, 150, 180, 240, 300, 360];

function runGoalPlan(
  input: PlannerInput,
  calendar: Calendar,
  outcome: OutcomeModel,
  baseSeed: number,
  runs: number
): PlannerResult {
  const plan = input.plan;
  const minutes = plan.minutesPerDay ?? 45;
  const levels = planLevels(plan, input.deckConfig.activeLevels);
  const sample = sampleCards(input.cards, GOAL_SAMPLE_MAX);
  const scale = input.cards.length / Math.max(1, sample.length);
  const sampled = { ...input, cards: sample };
  const pace = measurePace(input.logs);
  const context: GoalContext = {
    input: sampled,
    calendar,
    outcome,
    baseSeed,
    pace,
    levels,
    remainingNew: sample.filter((card) => card.state === 0).length,
    scale,
  };
  const realRemainingNew = input.cards.filter((card) => card.state === 0).length;
  const solved = solveGoal(context, minutes, SEARCH_RUNS);
  let neededMinutesPerDay: number | null = null;
  if (!solved) {
    // Only search for the minutes needed when the most time allowed would reach the goal at all
    const dynamicContext = { ...context, input: { ...sampled, plan: { ...plan, pace: 'dynamic' as const } } };
    const steps = NEEDED_MINUTES_STEPS.filter((step) => step > minutes);
    if (steps.length > 0 && solveGoal(dynamicContext, steps[steps.length - 1], 4)) {
      let low = 0;
      let high = steps.length - 1;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (solveGoal(dynamicContext, steps[middle], 4)) high = middle;
        else low = middle + 1;
      }
      neededMinutesPerDay = steps[low];
    }
  }

  // Without a solution, study at the most the time allows and show how far that gets
  const fallbackNew = Math.max(1, Math.ceil(context.remainingNew / calendar.studyDays));
  const sampleNew = solved ? solved.newPerDay : context.remainingNew === 0 ? 0 : fallbackNew;
  const retention = solved ? solved.retention : input.fsrsOptions.request_retention;
  const params = goalParams(context, sampleNew, retention, minutes);
  const aggregate = simulateMany(sampled, calendar, outcome, runs, baseSeed, params);
  const newPerDay = Math.min(MAX_NEW_PER_DAY, realRemainingNew, Math.round(sampleNew * scale));
  const reviewsPerDay = reviewCeiling(minutes, pace);
  const result = buildResult(
    input,
    calendar,
    input.cards,
    runs,
    aggregate,
    { newPerDay, reviewsPerDay },
    scale
  );
  const newCost = context.pace.secondsPerNew + NEW_CARD_STEP_FACTOR * context.pace.secondsPerReview;
  const first = result.forecast[0];
  const usageToday = dailyUsage(input.logs, calendar.now, calendar.dayStartHour);
  return {
    ...result,
    feasible: result.feasible && solved !== null,
    goal: {
      pace: plan.pace ?? 'dynamic',
      minutesPerDay: minutes,
      newPerDay,
      reviewsPerDay,
      retention,
      secondsPerNew: round(context.pace.secondsPerNew, 1),
      secondsPerReview: round(context.pace.secondsPerReview, 1),
      paceMeasured: context.pace.measured,
      // A daily total, like the settings: the queue subtracts what was already done today
      newToday: first ? Math.min(newPerDay, Math.ceil(first.newCards) + usageToday.newCards) : newPerDay,
      reviewsToday: first ? Math.ceil(first.reviews) + usageToday.reviews : 0,
      minutesToday: first
        ? Math.round((first.newCards * newCost + first.reviews * context.pace.secondsPerReview) / 60)
        : 0,
      peakMinutes: Math.round((medianOf(aggregate.results, (run) => run.peakSeconds) * scale) / 60),
      neededMinutesPerDay,
    },
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
  const goal = isGoalPlan(input.plan);
  const levels = planLevels(input.plan, input.deckConfig.activeLevels);
  const cards = input.cards.filter(
    (card) => !card.suspended && (!goal || levels.includes(card.level))
  );
  const eligibleInput = { ...input, cards };
  const runs = runCount(cards.length, studyDays);
  if (cards.length === 0) return emptyResult(eligibleInput, calendar, runs);

  const twoButtonGrading = input.deckConfig.twoButtonGrading;
  const outcome = buildOutcomeModel(input.logs, input.fsrsOptions.w, twoButtonGrading);
  const key = plannerKey(eligibleInput);
  const baseSeed = input.seed ?? parseInt(key.slice(0, 8), 16);
  if (goal) return runGoalPlan(eligibleInput, calendar, outcome, baseSeed, Math.min(runs, 40));

  const aggregate = simulateMany(eligibleInput, calendar, outcome, runs, baseSeed, {
    newPerDay: input.deckConfig.dailyNewLimit,
    reviewsPerDay: input.deckConfig.dailyReviewLimit,
    budgetSeconds: Infinity,
    pace: measurePace(input.logs),
    fsrsOptions: input.fsrsOptions,
    capToTarget: false,
    scale: 1,
  });
  return buildResult(eligibleInput, calendar, cards, runs, aggregate, {
    newPerDay: input.deckConfig.dailyNewLimit,
    reviewsPerDay: input.deckConfig.dailyReviewLimit,
  });
}
