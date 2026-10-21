import { Card, DeckConfig, FSRSOptions, StudyPlan, StudyPlanApplied } from '../types/card';
import { calculateRetrievability } from './fsrs';

export const STUDY_PLAN_RETENTION_MIN = 0.7;
export const STUDY_PLAN_RETENTION_MAX = 0.99;
export const DEFAULT_STUDY_PLAN_RETENTION = 0.9;
export const DEFAULT_STUDY_PLAN_DAYS = 30;
export const MAX_STUDY_PLAN_DAYS = 3650;
export const DEFAULT_STUDY_DAY_START_HOUR = 0;
export const MIN_STUDY_DAY_START_HOUR = 0;
export const MAX_STUDY_DAY_START_HOUR = 23;
export const DEFAULT_STUDY_PLAN_MINUTES = 45;
export const MIN_STUDY_PLAN_MINUTES = 10;
export const MAX_DYNAMIC_MINUTES = 180;
export const MAX_INTENSIVE_MINUTES = 360;
/** Absolute ceiling on answers in a day, whatever the time budget says */
export const MAX_REVIEWS_PER_DAY = 1500;
export const MAX_NEW_PER_DAY = 300;

const DAY_MS = 1000 * 60 * 60 * 24;
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function dateKeyFromParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function dateKeyOf(date: Date): string {
  return dateKeyFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function sanitizeStudyDayStartHour(
  value: unknown,
  fallback: number = DEFAULT_STUDY_DAY_START_HOUR
): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_STUDY_DAY_START_HOUR &&
    value <= MAX_STUDY_DAY_START_HOUR
    ? value
    : fallback;
}

/** The study day a local timestamp belongs to, honouring the rollover hour. */
export function studyDayKey(date: Date, startHour: number = DEFAULT_STUDY_DAY_START_HOUR): string {
  if (!Number.isFinite(date.getTime())) return '';
  const hour = sanitizeStudyDayStartHour(startHour);
  const shifted = new Date(date.getTime());
  if (hour > 0 && shifted.getHours() < hour) shifted.setDate(shifted.getDate() - 1);
  return dateKeyOf(shifted);
}

export function todayKey(
  now: Date = new Date(),
  startHour: number = DEFAULT_STUDY_DAY_START_HOUR
): string {
  return studyDayKey(now, startHour);
}

/** Local timestamp at which a study day with this date key begins. */
export function studyDayStartForDateKey(
  key: string,
  startHour: number = DEFAULT_STUDY_DAY_START_HOUR
): Date {
  const date = parseDateKey(key);
  if (!date) return new Date();
  return new Date(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    sanitizeStudyDayStartHour(startHour),
    0,
    0,
    0
  );
}

export function parseDateKey(key: string): Date | null {
  const match = DATE_KEY.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && parseDateKey(value) !== null;
}

export function daysBetweenKeys(from: string, to: string): number {
  const start = parseDateKey(from);
  const end = parseDateKey(to);
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

export function addDaysToKey(key: string, days: number): string {
  const date = parseDateKey(key);
  if (!date) return key;
  date.setUTCDate(date.getUTCDate() + Math.trunc(days));
  return dateKeyFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function isRetention(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= STUDY_PLAN_RETENTION_MIN &&
    value <= STUDY_PLAN_RETENTION_MAX
  );
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isCount(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;
}

function sanitizeApplied(raw: unknown): StudyPlanApplied | undefined {
  if (!isRecord(raw) || !isDateKey(raw.date)) return undefined;
  if (!isCount(raw.newPerDay, MAX_NEW_PER_DAY) || !isCount(raw.reviewsPerDay, MAX_REVIEWS_PER_DAY)) {
    return undefined;
  }
  return {
    date: raw.date,
    newPerDay: raw.newPerDay,
    reviewsPerDay: raw.reviewsPerDay,
    retention: isRetention(raw.retention) ? raw.retention : DEFAULT_STUDY_PLAN_RETENTION,
  };
}

export function sanitizeStudyPlan(raw: unknown): StudyPlan | undefined {
  if (!isRecord(raw) || !isDateKey(raw.targetDate)) return undefined;
  const plan: StudyPlan = {
    targetDate: raw.targetDate,
    targetRetention: isRetention(raw.targetRetention)
      ? raw.targetRetention
      : DEFAULT_STUDY_PLAN_RETENTION,
    enabled: raw.enabled !== false,
    updatedAt: isTimestamp(raw.updatedAt) ? new Date(raw.updatedAt).toISOString() : new Date(0).toISOString(),
  };
  if (Array.isArray(raw.levels)) {
    const levels = raw.levels.filter((level): level is string => typeof level === 'string');
    if (levels.length > 0) plan.levels = Array.from(new Set(levels));
  }
  if (raw.pace === 'dynamic' || raw.pace === 'intensive') {
    plan.pace = raw.pace;
    const max = raw.pace === 'intensive' ? MAX_INTENSIVE_MINUTES : MAX_DYNAMIC_MINUTES;
    plan.minutesPerDay =
      typeof raw.minutesPerDay === 'number' && Number.isFinite(raw.minutesPerDay)
        ? Math.round(Math.min(Math.max(raw.minutesPerDay, MIN_STUDY_PLAN_MINUTES), max))
        : DEFAULT_STUDY_PLAN_MINUTES;
    plan.goal = raw.goal === 'retention' ? 'retention' : 'mature';
    const applied = sanitizeApplied(raw.applied);
    if (applied) plan.applied = applied;
  }
  return plan;
}

export interface StudyGoalOptions {
  levels: string[];
  pace: 'dynamic' | 'intensive';
  minutesPerDay: number;
}

export function createStudyPlan(
  targetDate: string,
  targetRetention: number,
  now: Date = new Date(),
  goal?: StudyGoalOptions
): StudyPlan {
  const plan: StudyPlan = {
    targetDate,
    targetRetention,
    enabled: true,
    updatedAt: now.toISOString(),
  };
  if (goal) {
    plan.levels = [...goal.levels];
    plan.pace = goal.pace;
    plan.minutesPerDay = goal.minutesPerDay;
    plan.goal = 'mature';
  }
  return plan;
}

/** The plan is a goal (solves the daily limits) rather than a check of the current ones. */
export function isGoalPlan(plan: StudyPlan | undefined): plan is StudyPlan & { pace: 'dynamic' | 'intensive' } {
  return !!plan && plan.enabled && (plan.pace === 'dynamic' || plan.pace === 'intensive');
}

export function planLevels(plan: StudyPlan, activeLevels: string[]): string[] {
  return plan.levels && plan.levels.length > 0 ? plan.levels : activeLevels;
}

/** Daily limits in force: the goal's solved limits while a goal is active, else the settings. */
export function effectiveDailyLimits(
  config: Pick<DeckConfig, 'dailyNewLimit' | 'dailyReviewLimit' | 'studyPlan'>
): Pick<DeckConfig, 'dailyNewLimit' | 'dailyReviewLimit'> {
  const plan = config.studyPlan;
  if (isGoalPlan(plan) && plan.applied) {
    return { dailyNewLimit: plan.applied.newPerDay, dailyReviewLimit: plan.applied.reviewsPerDay };
  }
  return { dailyNewLimit: config.dailyNewLimit, dailyReviewLimit: config.dailyReviewLimit };
}

/** FSRS options for study: an intensive goal raises the retention of its own levels. */
export function effectiveFSRSOptions(options: FSRSOptions, config: DeckConfig): FSRSOptions {
  const plan = config.studyPlan;
  if (!isGoalPlan(plan) || !plan.applied) return options;
  const levels = planLevels(plan, config.activeLevels);
  const byLevel = { ...(options.retention_by_level ?? {}) };
  for (const level of levels) {
    byLevel[level] = Math.max(plan.applied.retention, byLevel[level] ?? options.request_retention);
  }
  return { ...options, retention_by_level: byLevel };
}

/**
 * Exam-date cap: a review of a goal word that would fall after the target date, with recall
 * below the target on that day, is pulled in to the day before it so the word is fresh then.
 */
export function capDueForPlan(
  card: Card,
  plan: StudyPlan | undefined,
  activeLevels: string[],
  now: Date,
  weights: number[],
  startHour: number = DEFAULT_STUDY_DAY_START_HOUR
): Card {
  if (!plan?.enabled || card.state !== 2 || !card.last_review) return card;
  if (!planLevels(plan, activeLevels).includes(card.level)) return card;
  const today = todayKey(now, startHour);
  if (plan.targetDate <= today) return card;
  const due = new Date(card.due);
  if (!Number.isFinite(due.getTime()) || studyDayKey(due, startHour) <= plan.targetDate) return card;
  const targetEnd = studyDayStartForDateKey(addDaysToKey(plan.targetDate, 1), startHour);
  const elapsed = (targetEnd.getTime() - new Date(card.last_review).getTime()) / DAY_MS;
  if (calculateRetrievability(elapsed, card.stability, weights) >= plan.targetRetention) return card;
  const tomorrow = addDaysToKey(today, 1);
  const eve = addDaysToKey(plan.targetDate, -1);
  const day = eve > tomorrow ? eve : tomorrow;
  return {
    ...card,
    due: studyDayStartForDateKey(day, startHour).toISOString(),
    scheduled_days: Math.max(1, daysBetweenKeys(today, day)),
  };
}

export function mergeStudyPlan(local: unknown, remote: unknown): StudyPlan | undefined {
  const left = sanitizeStudyPlan(local);
  const right = sanitizeStudyPlan(remote);
  if (!left) return right;
  if (!right) return left;
  return Date.parse(right.updatedAt) > Date.parse(left.updatedAt) ? right : left;
}
