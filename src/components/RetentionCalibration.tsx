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
  theme: 'dark' | 'light';
}

const MIN_SAMPLE = 5; // Cells with fewer reviews are shown without colour
const NEUTRAL_BAND = 0.05; // Within 5 points of the prediction counts as on target
const STRONG_BAND = 0.15; // Beyond 15 points is a strong miss in either direction
const GRID_COLS = 'grid-cols-[52px_repeat(5,minmax(0,1fr))]';

const formatPercent = (value: number | null) => (value === null ? '-' : `${Math.round(value * 100)}%`);

const formatDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

function cellTone(cell: CalibrationCell, isLight: boolean): string {
  const rate = cellRate(cell);
  const predicted = cellPredicted(cell);
  if (cell.count < MIN_SAMPLE || rate === null || predicted === null) {
    return isLight ? 'bg-black/[0.03] text-black/40' : 'bg-white/[0.03] text-white/35';
  }

  // Positive gap: the card was remembered more often than FSRS expected
  const gap = rate - predicted;
  if (gap <= -STRONG_BAND) return 'bg-red-600/70 text-white';
  if (gap <= -NEUTRAL_BAND) return isLight ? 'bg-red-500/25 text-red-900' : 'bg-red-500/30 text-red-100';
  if (gap < NEUTRAL_BAND) return isLight ? 'bg-black/5 text-black' : 'bg-white/10 text-white';
  if (gap < STRONG_BAND) return isLight ? 'bg-emerald-500/25 text-emerald-900' : 'bg-emerald-500/30 text-emerald-100';
  return 'bg-emerald-600/70 text-white';
}

export const RetentionCalibration: React.FC<RetentionCalibrationProps> = ({ logs, theme }) => {
  const isLight = theme === 'light';
  const data = useMemo(() => buildCalibration(logs), [logs]);

  const subtleText = isLight ? 'text-black/60' : 'text-white/60';
  const totalRate = cellRate(data.total);
  const totalPredicted = cellPredicted(data.total);
  const gapPoints =
    totalRate !== null && totalPredicted !== null
      ? Math.round((totalRate - totalPredicted) * 100)
      : null;

  if (data.total.count === 0) {
    return (
      <div className={`py-10 text-center text-xs ${subtleText}`}>
        Sem revisões de cartões em revisão neste período. A calibração compara a previsão do FSRS
        com o resultado de cada revisão.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`rounded-2xl p-3 border ${isLight ? 'bg-black/[0.02] border-black/5' : 'bg-white/[0.03] border-white/10'}`}>
          <div className={`text-xs uppercase font-bold tracking-wider ${subtleText}`}>Real</div>
          <div className="text-lg font-black tabular-nums">{formatPercent(totalRate)}</div>
        </div>
        <div className={`rounded-2xl p-3 border ${isLight ? 'bg-black/[0.02] border-black/5' : 'bg-white/[0.03] border-white/10'}`}>
          <div className={`text-xs uppercase font-bold tracking-wider ${subtleText}`}>Prevista</div>
          <div className="text-lg font-black tabular-nums">{formatPercent(totalPredicted)}</div>
        </div>
        <div className={`rounded-2xl p-3 border ${isLight ? 'bg-black/[0.02] border-black/5' : 'bg-white/[0.03] border-white/10'}`}>
          <div className={`text-xs uppercase font-bold tracking-wider ${subtleText}`}>Diferença</div>
          <div
            className={`text-lg font-black tabular-nums ${
              gapPoints === null || Math.abs(gapPoints) < 5
                ? ''
                : gapPoints < 0
                ? 'text-red-500'
                : 'text-emerald-500'
            }`}
          >
            {gapPoints === null ? '-' : `${gapPoints > 0 ? '+' : ''}${gapPoints} pts`}
          </div>
        </div>
        <div className={`rounded-2xl p-3 border ${isLight ? 'bg-black/[0.02] border-black/5' : 'bg-white/[0.03] border-white/10'}`}>
          <div className={`text-xs uppercase font-bold tracking-wider ${subtleText}`}>Revisões</div>
          <div className="text-lg font-black tabular-nums">{data.total.count}</div>
        </div>
      </div>

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
                    className={`rounded-xl px-1 py-1.5 text-center tabular-nums ${cellTone(cell, isLight)}`}
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
          <span className={`w-3 h-3 rounded ${isLight ? 'bg-black/10' : 'bg-white/20'}`} />
          Em linha (até 5 pts)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-emerald-600/70" />
          Real acima da prevista
        </span>
        <span className="flex items-center gap-1.5">
          <span className={`w-3 h-3 rounded ${isLight ? 'bg-black/[0.05]' : 'bg-white/[0.06]'}`} />
          Menos de {MIN_SAMPLE} revisões
        </span>
      </div>
    </div>
  );
};
