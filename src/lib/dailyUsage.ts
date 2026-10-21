import { DeckConfig, ReviewLog } from '../types/card';
import { studyDayKey, todayKey } from './studyPlan';

export interface DailyUsage {
  newCards: number;
  reviews: number;
}

export interface DailyLimits {
  newCards: number;
  reviews: number;
}

export function dailyUsage(
  logs: ReviewLog[],
  now: Date = new Date(),
  startHour: number = 0
): DailyUsage {
  const today = todayKey(now, startHour);
  const newIds = new Set<string>();
  const reviewIds = new Set<string>();

  for (const log of logs) {
    const reviewed = new Date(log.reviewTime);
    if (!Number.isFinite(reviewed.getTime()) || studyDayKey(reviewed, startHour) !== today) continue;
    const previousState = log.previousCardSnapshot?.state ?? log.state;
    if (previousState === 0) newIds.add(log.cardId);
    else if (previousState === 2) reviewIds.add(log.cardId);
  }

  return { newCards: newIds.size, reviews: reviewIds.size };
}

/** Cards already touched today, whatever their state; used to avoid re-showing them as "ahead". */
export function reviewedCardIdsOnDay(
  logs: ReviewLog[],
  now: Date = new Date(),
  startHour: number = 0
): Set<string> {
  const today = todayKey(now, startHour);
  const ids = new Set<string>();
  for (const log of logs) {
    const reviewed = new Date(log.reviewTime);
    if (!Number.isFinite(reviewed.getTime())) continue;
    if (studyDayKey(reviewed, startHour) === today) ids.add(log.cardId);
  }
  return ids;
}

export function remainingDailyLimits(
  config: Pick<DeckConfig, 'dailyNewLimit' | 'dailyReviewLimit'>,
  usage: DailyUsage
): DailyLimits {
  return {
    newCards: Math.max(0, config.dailyNewLimit - usage.newCards),
    reviews: Math.max(0, config.dailyReviewLimit - usage.reviews),
  };
}
