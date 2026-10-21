import { StudyPlan } from '../types/card';

export const STUDY_PLAN_RETENTION_MIN = 0.7;
export const STUDY_PLAN_RETENTION_MAX = 0.99;
export const DEFAULT_STUDY_PLAN_RETENTION = 0.9;
export const DEFAULT_STUDY_PLAN_DAYS = 30;
export const MAX_STUDY_PLAN_DAYS = 3650;
export const DEFAULT_STUDY_DAY_START_HOUR = 0;
export const MIN_STUDY_DAY_START_HOUR = 0;
export const MAX_STUDY_DAY_START_HOUR = 23;

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

export function sanitizeStudyPlan(raw: unknown): StudyPlan | undefined {
  if (!isRecord(raw) || !isDateKey(raw.targetDate)) return undefined;
  return {
    targetDate: raw.targetDate,
    targetRetention: isRetention(raw.targetRetention)
      ? raw.targetRetention
      : DEFAULT_STUDY_PLAN_RETENTION,
    enabled: raw.enabled !== false,
    updatedAt: isTimestamp(raw.updatedAt) ? new Date(raw.updatedAt).toISOString() : new Date(0).toISOString(),
  };
}

export function createStudyPlan(
  targetDate: string,
  targetRetention: number,
  now: Date = new Date()
): StudyPlan {
  return {
    targetDate,
    targetRetention,
    enabled: true,
    updatedAt: now.toISOString(),
  };
}

export function mergeStudyPlan(local: unknown, remote: unknown): StudyPlan | undefined {
  const left = sanitizeStudyPlan(local);
  const right = sanitizeStudyPlan(remote);
  if (!left) return right;
  if (!right) return left;
  return Date.parse(right.updatedAt) > Date.parse(left.updatedAt) ? right : left;
}
