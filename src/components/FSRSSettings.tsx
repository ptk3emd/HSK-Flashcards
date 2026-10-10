import React, { useEffect, useState } from 'react';
import { ChevronDown, RotateCcw } from 'lucide-react';
import { FSRSOptions } from '../types/card';
import { ALL_HSK_LEVELS, LEVEL_NUMERALS } from '../data/defaultDecks';
import {
  DEFAULT_FSRS_OPTIONS,
  MAX_INTERVAL_LIMIT,
  WEIGHTS_COUNT,
  parseWeights,
} from '../lib/fsrs';

interface FSRSSettingsProps {
  fsrsOptions: FSRSOptions;
  onUpdateFSRSOptions: (options: FSRSOptions) => void;
  theme: 'dark' | 'light';
}

const SLIDER_MIN = 0.8;
const SLIDER_MAX = 0.97;
const SLIDER_STEP = 0.01;

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

export const FSRSSettings: React.FC<FSRSSettingsProps> = ({
  fsrsOptions,
  onUpdateFSRSOptions,
  theme,
}) => {
  const levelRetention = fsrsOptions.retention_by_level ?? {};

  const [intervalDraft, setIntervalDraft] = useState(String(fsrsOptions.maximum_interval));
  const [weightsDraft, setWeightsDraft] = useState(fsrsOptions.w.join(', '));
  const [weightsError, setWeightsError] = useState<string | null>(null);

  // Keep drafts in sync when the options change from elsewhere (e.g. restore defaults)
  useEffect(() => {
    setIntervalDraft(String(fsrsOptions.maximum_interval));
  }, [fsrsOptions.maximum_interval]);

  useEffect(() => {
    setWeightsDraft(fsrsOptions.w.join(', '));
    setWeightsError(null);
  }, [fsrsOptions.w]);

  const fieldClass =
    'min-h-11 px-3 rounded-xl text-sm border bg-white/60 border-black/10 dark:bg-black/30 dark:border-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60';

  const setLevelRetention = (level: string, value: number | null) => {
    const next = { ...levelRetention };
    if (value === null) {
      delete next[level];
    } else {
      next[level] = value;
    }
    onUpdateFSRSOptions({ ...fsrsOptions, retention_by_level: next });
  };

  const commitInterval = () => {
    const parsed = parseInt(intervalDraft, 10);
    if (!Number.isFinite(parsed)) {
      setIntervalDraft(String(fsrsOptions.maximum_interval));
      return;
    }
    const clamped = Math.min(Math.max(parsed, 1), MAX_INTERVAL_LIMIT);
    setIntervalDraft(String(clamped));
    if (clamped !== fsrsOptions.maximum_interval) {
      onUpdateFSRSOptions({ ...fsrsOptions, maximum_interval: clamped });
    }
  };

  const applyWeights = () => {
    const parsed = parseWeights(weightsDraft);
    if (!parsed) {
      setWeightsError(
        `${WEIGHTS_COUNT} números separados por vírgula; os quatro primeiros positivos.`
      );
      return;
    }
    onUpdateFSRSOptions({ ...fsrsOptions, w: parsed });
  };

  const restoreWeights = () => {
    onUpdateFSRSOptions({ ...fsrsOptions, w: [...DEFAULT_FSRS_OPTIONS.w] });
  };

  return (
    <div className="ledger border-t border-[var(--separator)]">
      <div className="py-3 space-y-2">
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="retention-global" className="text-sm">Retenção desejada</label>
          <span className="tabular text-sm font-semibold">{formatPercent(fsrsOptions.request_retention)}</span>
        </div>
        <input
          id="retention-global"
          type="range"
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          step={SLIDER_STEP}
          value={fsrsOptions.request_retention}
          onChange={(e) =>
            onUpdateFSRSOptions({
              ...fsrsOptions,
              request_retention: parseFloat(e.target.value),
            })
          }
          className="w-full accent-red-600 cursor-pointer"
        />
      </div>

      <details className="group py-1">
        <summary className="flex items-center justify-between gap-4 min-h-11 cursor-pointer list-none text-sm [&::-webkit-details-marker]:hidden">
          <span>Retenção por nível</span>
          <span className="flex items-center gap-2 text-xs ink-tertiary tabular">
            {Object.keys(levelRetention).length > 0 ? `${Object.keys(levelRetention).length} ajustados` : 'padrão'}
            <ChevronDown aria-hidden="true" className="w-4 h-4 transition-transform group-open:rotate-180" />
          </span>
        </summary>
        <ul className="pb-2">
          {ALL_HSK_LEVELS.map((level) => {
            const override = levelRetention[level];
            const isOverridden = override !== undefined;
            const effective = override ?? fsrsOptions.request_retention;
            return (
              <li key={level} className="grid grid-cols-[2.5rem_minmax(0,1fr)_3rem_2.75rem] items-center gap-2">
                <span lang="zh-CN" aria-hidden="true" className={`hanzi-index text-lg text-center ${isOverridden ? 'text-red-700 dark:text-red-300' : 'ink-tertiary'}`}>
                  {LEVEL_NUMERALS[level]}
                </span>
                <input
                  type="range"
                  min={SLIDER_MIN}
                  max={SLIDER_MAX}
                  step={SLIDER_STEP}
                  value={effective}
                  aria-label={`Retenção desejada para ${level}`}
                  onChange={(e) => setLevelRetention(level, parseFloat(e.target.value))}
                  className="w-full accent-red-600 cursor-pointer"
                />
                <span className={`text-sm text-right tabular ${isOverridden ? 'font-semibold' : 'ink-tertiary'}`}>
                  {formatPercent(effective)}
                </span>
                {isOverridden ? (
                  <button
                    type="button"
                    onClick={() => setLevelRetention(level, null)}
                    className="size-11 rounded-xl flex items-center justify-center ink-tertiary hover:text-[var(--text-fg)] cursor-pointer"
                    aria-label={`Usar a retenção padrão em ${level}`}
                  >
                    <RotateCcw aria-hidden="true" className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <span className="size-11" aria-hidden="true" />
                )}
              </li>
            );
          })}
        </ul>
      </details>

      <div className="flex items-center justify-between gap-4 py-3">
        <label htmlFor="max-interval" className="text-sm">Intervalo máximo (dias)</label>
        <input
          id="max-interval"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_INTERVAL_LIMIT}
          value={intervalDraft}
          onChange={(e) => setIntervalDraft(e.target.value)}
          onBlur={commitInterval}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitInterval();
          }}
          className={`${fieldClass} w-24 text-right tabular font-semibold`}
        />
      </div>

      <details className="group py-1">
        <summary className="flex items-center justify-between min-h-11 cursor-pointer list-none text-sm select-none [&::-webkit-details-marker]:hidden">
          Pesos FSRS
          <ChevronDown aria-hidden="true" className="w-4 h-4 ink-tertiary transition-transform group-open:rotate-180" />
        </summary>
        <div className="pb-3 space-y-2">
          <textarea
            rows={3}
            value={weightsDraft}
            onChange={(e) => setWeightsDraft(e.target.value)}
            spellCheck={false}
            aria-label="Pesos FSRS"
            className={`${fieldClass} w-full py-2 text-xs font-mono resize-y`}
          />
          {weightsError && <p className="text-xs text-red-700 dark:text-red-300">{weightsError}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={applyWeights}
              className="min-h-10 px-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-sm cursor-pointer transition-colors"
            >
              Aplicar
            </button>
            <button
              type="button"
              onClick={restoreWeights}
              className="min-h-10 px-3.5 rounded-xl font-medium text-sm cursor-pointer transition-colors ink-secondary hover:text-[var(--text-fg)]"
            >
              Padrão
            </button>
          </div>
        </div>
      </details>
    </div>
  );
};
