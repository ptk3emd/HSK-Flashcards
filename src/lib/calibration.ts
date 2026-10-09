import { ReviewLog } from '../types/card';
import { calculateRetrievability, elapsedDaysSince } from './fsrs';

export interface CalibrationBin {
  label: string;
  min: number; // inclusive
  max: number; // exclusive
}

// Predicted recall probability buckets. The last bin's upper bound sits above 1 so R = 1 is included.
export const CALIBRATION_BINS: CalibrationBin[] = [
  { label: '<60%', min: 0, max: 0.6 },
  { label: '60-70%', min: 0.6, max: 0.7 },
  { label: '70-80%', min: 0.7, max: 0.8 },
  { label: '80-90%', min: 0.8, max: 0.9 },
  { label: '90%+', min: 0.9, max: 1.01 },
];

export interface CalibrationCell {
  count: number;
  recalled: number; // reviews answered Hard, Good or Easy
  predictedSum: number; // sum of predicted recall, for the mean
}

export interface CalibrationRow {
  day: string; // YYYY-MM-DD (UTC, same convention as the streak calculation)
  cells: CalibrationCell[]; // one per CALIBRATION_BINS entry
  total: CalibrationCell;
}

export interface CalibrationData {
  rows: CalibrationRow[]; // most recent day first
  total: CalibrationCell;
}

function emptyCell(): CalibrationCell {
  return { count: 0, recalled: 0, predictedSum: 0 };
}

function addToCell(cell: CalibrationCell, predicted: number, recalled: boolean): void {
  cell.count += 1;
  cell.recalled += recalled ? 1 : 0;
  cell.predictedSum += predicted;
}

/**
 * Recall probability FSRS predicted at the moment of a review, computed from the card
 * state before that review. New and learning cards have no meaningful memory state
 * yet, so they return null.
 */
export function predictedRecall(log: ReviewLog): number | null {
  const snapshot = log.previousCardSnapshot;
  if (!snapshot || !snapshot.last_review) return null;
  if (snapshot.state !== 2 && snapshot.state !== 3) return null;

  const elapsed = elapsedDaysSince(snapshot.last_review, new Date(log.reviewTime));
  const predicted = calculateRetrievability(elapsed, snapshot.stability);
  return Number.isFinite(predicted) ? predicted : null;
}

export function binIndexFor(predicted: number): number {
  const idx = CALIBRATION_BINS.findIndex(bin => predicted >= bin.min && predicted < bin.max);
  return idx === -1 ? 0 : idx;
}

export function cellRate(cell: CalibrationCell): number | null {
  return cell.count > 0 ? cell.recalled / cell.count : null;
}

export function cellPredicted(cell: CalibrationCell): number | null {
  return cell.count > 0 ? cell.predictedSum / cell.count : null;
}

/**
 * Groups reviews by day and by predicted-recall bin, so each cell compares the
 * recall rate that actually happened against the rate FSRS expected.
 */
export function buildCalibration(logs: ReviewLog[], maxDays = 14): CalibrationData {
  const rowsByDay = new Map<string, CalibrationRow>();
  const total = emptyCell();

  for (const log of logs) {
    const predicted = predictedRecall(log);
    if (predicted === null) continue;

    const day = new Date(log.reviewTime).toISOString().slice(0, 10);
    let row = rowsByDay.get(day);
    if (!row) {
      row = { day, cells: CALIBRATION_BINS.map(() => emptyCell()), total: emptyCell() };
      rowsByDay.set(day, row);
    }

    const recalled = log.rating !== 1;
    addToCell(row.cells[binIndexFor(predicted)], predicted, recalled);
    addToCell(row.total, predicted, recalled);
    addToCell(total, predicted, recalled);
  }

  const rows = Array.from(rowsByDay.values())
    .sort((a, b) => b.day.localeCompare(a.day))
    .slice(0, maxDays);

  return { rows, total };
}
