import { Card } from '../types/card';
import { addDaysToKey, daysBetweenKeys, studyDayKey, studyDayStartForDateKey } from './studyPlan';

/**
 * Fuzz range around an interval, from FSRS: ±15% from 2.5 to 7 days, ±10% from 7 to 20,
 * ±5% beyond, plus one day. Intervals under 2.5 days are left alone.
 */
export function fuzzRange(interval: number, maxInterval: number): [number, number] {
  if (interval < 2.5) return [interval, interval];
  const ranges: [number, number, number][] = [
    [2.5, 7, 0.15],
    [7, 20, 0.1],
    [20, Infinity, 0.05],
  ];
  let delta = 1;
  for (const [start, end, factor] of ranges) {
    delta += factor * Math.max(Math.min(interval, end) - start, 0);
  }
  const min = Math.max(2, Math.round(interval - delta));
  const max = Math.min(Math.round(interval + delta), maxInterval);
  return [Math.min(min, max), max];
}

/** Review cards due on each study day, the load the balancer spreads. */
export function reviewLoadByDay(cards: Card[], startHour: number): Map<string, number> {
  const load = new Map<string, number>();
  for (const card of cards) {
    if (card.state !== 2 || card.suspended) continue;
    const due = new Date(card.due);
    if (!Number.isFinite(due.getTime())) continue;
    const key = studyDayKey(due, startHour);
    load.set(key, (load.get(key) ?? 0) + 1);
  }
  return load;
}

/**
 * Moves a freshly scheduled review to the least loaded day inside its fuzz range, so the
 * reviews spread out instead of piling up on the same days. Ties keep the day closest to
 * the FSRS interval.
 */
export function balanceDue(
  card: Card,
  load: Map<string, number>,
  now: Date,
  startHour: number,
  maxInterval: number
): Card {
  if (card.state !== 2 || card.scheduled_days < 3) return card;
  const today = studyDayKey(now, startHour);
  const [min, max] = fuzzRange(card.scheduled_days, maxInterval);
  let best = card.scheduled_days;
  let bestLoad = load.get(addDaysToKey(today, best)) ?? 0;
  for (let days = min; days <= max; days += 1) {
    const dayLoad = load.get(addDaysToKey(today, days)) ?? 0;
    const closer = Math.abs(days - card.scheduled_days) < Math.abs(best - card.scheduled_days);
    if (dayLoad < bestLoad || (dayLoad === bestLoad && closer)) {
      best = days;
      bestLoad = dayLoad;
    }
  }
  if (best === card.scheduled_days) return card;
  const key = addDaysToKey(today, best);
  const due = new Date(card.due);
  const start = studyDayStartForDateKey(key, startHour);
  // Keep the time of day of the original due, moved onto the chosen day
  const shifted = new Date(due.getTime() + daysBetweenKeys(studyDayKey(due, startHour), key) * 86400000);
  return {
    ...card,
    due: (Number.isFinite(shifted.getTime()) ? shifted : start).toISOString(),
    scheduled_days: best,
  };
}
