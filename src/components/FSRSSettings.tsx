import React, { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { FSRSOptions } from '../types/card';
import { ALL_HSK_LEVELS } from '../data/defaultDecks';
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
  const isLight = theme === 'light';
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

  const inputClass = `w-full px-3 py-1.5 rounded-xl text-xs border font-semibold ${
    isLight ? 'bg-white border-black/15 text-black' : 'bg-black/40 border-white/15 text-white'
  }`;
  const hintClass = `text-[11px] leading-relaxed ${isLight ? 'text-black/60' : 'text-white/50'}`;
  const sectionClass = `pt-4 border-t ${isLight ? 'border-black/5' : 'border-white/10'} space-y-3`;

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
        `Informe ${WEIGHTS_COUNT} números separados por vírgula. Os quatro primeiros devem ser positivos.`
      );
      return;
    }
    onUpdateFSRSOptions({ ...fsrsOptions, w: parsed });
  };

  const restoreWeights = () => {
    onUpdateFSRSOptions({ ...fsrsOptions, w: [...DEFAULT_FSRS_OPTIONS.w] });
  };

  return (
    <div className="space-y-5">
      {/* Global request retention */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs font-semibold">
          <span>Retenção desejada (padrão):</span>
          <span className="text-red-500 font-bold">{formatPercent(fsrsOptions.request_retention)}</span>
        </div>
        <input
          type="range"
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          step={SLIDER_STEP}
          value={fsrsOptions.request_retention}
          aria-label="Retenção desejada padrão"
          onChange={(e) =>
            onUpdateFSRSOptions({
              ...fsrsOptions,
              request_retention: parseFloat(e.target.value),
            })
          }
          className="w-full accent-red-500 cursor-pointer"
        />
        <p className={hintClass}>
          Padrão 90%. Vale para os níveis sem ajuste próprio.
        </p>
      </div>

      {/* Per-level request retention */}
      <div className={sectionClass}>
        <h3 className="text-xs font-bold">Retenção por nível</h3>
        <div className="space-y-2.5">
          {ALL_HSK_LEVELS.map((level) => {
            const override = levelRetention[level];
            const isOverridden = override !== undefined;
            const effective = override ?? fsrsOptions.request_retention;
            return (
              <div key={level} className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3">
                <span className="text-xs font-semibold">{level}</span>
                <input
                  type="range"
                  min={SLIDER_MIN}
                  max={SLIDER_MAX}
                  step={SLIDER_STEP}
                  value={effective}
                  aria-label={`Retenção desejada para ${level}`}
                  onChange={(e) => setLevelRetention(level, parseFloat(e.target.value))}
                  className="w-full accent-red-500 cursor-pointer"
                />
                <div className="flex items-center justify-end gap-1.5 min-w-[92px]">
                  <span
                    className={`text-xs font-bold tabular-nums ${
                      isOverridden ? 'text-red-500' : 'opacity-50'
                    }`}
                  >
                    {formatPercent(effective)}
                  </span>
                  {isOverridden && (
                    <button
                      type="button"
                      onClick={() => setLevelRetention(level, null)}
                      className={`p-1 rounded-lg cursor-pointer transition-all ${
                        isLight ? 'hover:bg-black/5 text-black/60' : 'hover:bg-white/10 text-white/60'
                      }`}
                      title={`Usar a retenção padrão em ${level}`}
                      aria-label={`Usar a retenção padrão em ${level}`}
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className={hintClass}>
          Níveis sem ajuste usam a retenção padrão. Valores menores espaçam mais as revisões.
        </p>
      </div>

      {/* Maximum interval and advanced weights */}
      <div className={sectionClass}>
        <div>
          <label
            htmlFor="max-interval"
            className={`block text-xs font-semibold mb-1 ${isLight ? 'text-black/80' : 'text-white/80'}`}
          >
            Intervalo máximo (dias):
          </label>
          <input
            id="max-interval"
            type="number"
            min={1}
            max={MAX_INTERVAL_LIMIT}
            value={intervalDraft}
            onChange={(e) => setIntervalDraft(e.target.value)}
            onBlur={commitInterval}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitInterval();
            }}
            className={inputClass}
          />
          <p className={`${hintClass} mt-1`}>
            Maior intervalo entre revisões. Padrão {MAX_INTERVAL_LIMIT} dias.
          </p>
        </div>

        <details className={`rounded-2xl border p-3 ${isLight ? 'border-black/10 bg-black/[0.02]' : 'border-white/10 bg-black/20'}`}>
          <summary className="cursor-pointer text-xs font-bold select-none">
            Avançado: pesos FSRS (w)
          </summary>
          <div className="mt-3 space-y-2">
            <textarea
              rows={3}
              value={weightsDraft}
              onChange={(e) => setWeightsDraft(e.target.value)}
              spellCheck={false}
              aria-label="Pesos FSRS"
              className={`${inputClass} font-mono resize-y`}
            />
            {weightsError && <p className="text-[11px] text-red-500">{weightsError}</p>}
            <p className={hintClass}>
              {WEIGHTS_COUNT} valores separados por vírgula. Mudanças valem para as próximas revisões de todos os cartões.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={applyWeights}
                className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs cursor-pointer shadow-sm transition-all active:scale-95"
              >
                Aplicar pesos
              </button>
              <button
                type="button"
                onClick={restoreWeights}
                className={`px-3.5 py-1.5 rounded-xl font-bold text-xs cursor-pointer transition-all ${
                  isLight ? 'bg-black/5 hover:bg-black/10 text-black' : 'bg-white/10 hover:bg-white/15 text-white'
                }`}
              >
                Restaurar padrão
              </button>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
};
