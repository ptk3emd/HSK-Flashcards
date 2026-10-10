import React, { useMemo } from 'react';
import { ReviewLog } from '../types/card';
import {
  CALIBRATION_BINS,
  CalibrationCell,
  buildCalibration,
  cellPredicted,
  cellRate,
} from '../lib/calibration';

interface RetentionCalibrationProps {
  logs: ReviewLog[];
}

const MIN_SAMPLE = 5; // Cells with fewer reviews are shown without colour
const NEUTRAL_BAND = 0.05; // Within 5 points of the prediction counts as on target
const STRONG_BAND = 0.15; // Beyond 15 points is a strong miss in either direction
const GRID_COLS = 'grid-cols-[52px_repeat(5,minmax(0,1fr))]';

const formatPercent = (value: number | null) => (value === null ? '-' : `${Math.round(value * 100)}%`);

const formatDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

function cellTone(cell: CalibrationCell): string {
  const rate = cellRate(cell);
  const predicted = cellPredicted(cell);
  if (cell.count < MIN_SAMPLE || rate === null || predicted === null) {
    return 'bg-black/[0.03] text-black/40 dark:bg-white/[0.03] dark:text-white/35';
  }

  // Positive gap: the card was remembered more often than FSRS expected
  const gap = rate - predicted;
  if (gap <= -STRONG_BAND) return 'bg-red-600/70 text-white';
  if (gap <= -NEUTRAL_BAND) return 'bg-red-500/25 text-red-900 dark:bg-red-500/30 dark:text-red-100';
  if (gap < NEUTRAL_BAND) return 'bg-black/5 text-black dark:bg-white/10 dark:text-white';
  if (gap < STRONG_BAND) return 'bg-emerald-500/25 text-emerald-900 dark:bg-emerald-500/30 dark:text-emerald-100';
  return 'bg-emerald-600/70 text-white';
}

export const RetentionCalibration: React.FC<RetentionCalibrationProps> = ({ logs }) => {
  const data = useMemo(() => buildCalibration(logs), [logs]);

  const subtleText = 'text-black/60 dark:text-white/60';
  const totalRate = cellRate(data.total);
  const totalPredicted = cellPredicted(data.total);
  const gapPoints =
    totalRate !== null && totalPredicted !== null
      ? Math.round((totalRate - totalPredicted) * 100)
      : null;

  if (data.total.count === 0) {
    return (
      <div className={`py-10 text-center text-sm ${subtleText}`}>
        Sem revisões neste período
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <dl className="grid grid-cols-4 -mx-5 sm:-mx-6 border-y border-[var(--separator)] divide-x divide-[var(--separator)]">
        {[
          { label: 'Real', value: formatPercent(totalRate), tone: '' },
          { label: 'Prevista', value: formatPercent(totalPredicted), tone: '' },
          {
            label: 'Diferença',
            value: gapPoints === null ? '-' : `${gapPoints > 0 ? '+' : ''}${gapPoints}`,
            tone:
              gapPoints === null || Math.abs(gapPoints) < 5
                ? ''
                : gapPoints < 0
                ? 'text-red-700 dark:text-red-300'
                : 'text-emerald-700 dark:text-emerald-300',
          },
          { label: 'Revisões', value: String(data.total.count), tone: '' },
        ].map((item) => (
          <div key={item.label} className="px-3 py-3 text-center">
            <dt className={`text-xs ${subtleText}`}>{item.label}</dt>
            <dd className={`text-lg font-semibold tabular-nums ${item.tone}`}>{item.value}</dd>
          </div>
        ))}
      </dl>

      {/* Heatmap: one row per day, one column per predicted-recall bin */}
      <div
        tabIndex={0}
        role="region"
        aria-label="Grade de calibração por dia e faixa de previsão"
        className="overflow-x-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 rounded-xl"
      >
        <div className="min-w-[340px] space-y-1.5">
          <div className={`grid ${GRID_COLS} gap-1.5 px-0.5 text-xs font-bold uppercase tracking-wider ${subtleText}`}>
            <span>Dia</span>
            {CALIBRATION_BINS.map((bin) => (
              <span key={bin.label} className="text-center">
                {bin.label}
              </span>
            ))}
          </div>

          {data.rows.map((row) => (
            <div key={row.day} className={`grid ${GRID_COLS} gap-1.5 items-stretch`}>
              <span className="text-xs font-semibold self-center tabular-nums">{formatDay(row.day)}</span>
              {row.cells.map((cell, idx) => {
                const rate = cellRate(cell);
                const predicted = cellPredicted(cell);
                return (
                  <div
                    key={CALIBRATION_BINS[idx].label}
                    className={`rounded-xl px-1 py-1.5 text-center tabular-nums ${cellTone(cell)}`}
                    title={`${cell.count} revisões · real ${formatPercent(rate)} · prevista ${formatPercent(predicted)}`}
                  >
                    <div className="text-xs font-extrabold">{formatPercent(rate)}</div>
                    <div className="text-xs opacity-75">prev {formatPercent(predicted)}</div>
                    <div className="text-[9px] opacity-50">n={cell.count}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-xs ${subtleText}`}>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-600/70" />
          Real abaixo da prevista
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`w-3 h-3 rounded ${'bg-black/10 dark:bg-white/20'}`} />
          Em linha (até 5 pts)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-emerald-600/70" />
          Real acima da prevista
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`w-3 h-3 rounded ${'bg-black/[0.05] dark:bg-white/[0.06]'}`} />
          Menos de {MIN_SAMPLE} revisões
        </span>
      </div>
    </div>
  );
};
