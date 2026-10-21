import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Loader2,
  Pencil,
  RefreshCw,
  X,
} from 'lucide-react';
import { Card, DeckConfig, FSRSOptions, StudyPlan } from '../types/card';
import {
  addDaysToKey,
  createStudyPlan,
  DEFAULT_STUDY_PLAN_DAYS,
  DEFAULT_STUDY_PLAN_RETENTION,
  isDateKey,
  MAX_STUDY_PLAN_DAYS,
  STUDY_PLAN_RETENTION_MAX,
  STUDY_PLAN_RETENTION_MIN,
  todayKey,
} from '../lib/studyPlan';
import { loadReviewLogs } from '../lib/storage';
import { useNow } from './useNow';
import type { PlannerInput, PlannerResult } from '../lib/planner';

interface StudyPlannerProps {
  cards: Card[];
  deckConfig: DeckConfig;
  fsrsOptions: FSRSOptions;
  onUpdateDeckConfig: (config: DeckConfig) => void;
  onRequestMigration: () => void;
  onOpenSettings: () => void;
}

interface WorkerResponse {
  id: number;
  result?: PlannerResult;
  error?: string;
}

const percent = (value: number) => `${Math.round(value * 100)}%`;
const number = (value: number) =>
  value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

const formatDate = (key: string) => {
  const date = new Date(`${key}T12:00:00`);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : key;
};

const verdict = (result: PlannerResult): string => {
  if (result.feasible) return 'Cabe no prazo com o ritmo atual.';
  if (result.bottleneck === 'new') {
    if (result.requiredNewPerDay > result.dailyNewLimit) {
      return `Faltam novos por dia: o plano pede ${result.requiredNewPerDay}, o limite é ${result.dailyNewLimit}.`;
    }
    return `O limite de hoje segura a cobertura: ${result.introducedCards} de ${result.totalCards} cartões.`;
  }
  if (result.bottleneck === 'review') {
    return `As revisões passam do limite em ${result.overloadedDays} ${result.overloadedDays === 1 ? 'dia' : 'dias'}.`;
  }
  if (result.bottleneck === 'both') {
    return 'Novos e revisões passam dos limites atuais.';
  }
  return `A cobertura cabe, mas a retenção prevista fica abaixo de ${percent(
    result.targetRetention
  )}.`;
};

const PlannerMetrics: React.FC<{ result: PlannerResult; onOpenSettings: () => void }> = ({
  result,
  onOpenSettings,
}) => {
  const good = result.feasible;
  return (
    <div className="mt-4 space-y-4">
      <div
        className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 ${
          good
            ? 'border-emerald-600/25 bg-emerald-600/10 text-emerald-900 dark:text-emerald-100'
            : 'border-amber-600/25 bg-amber-500/10 text-amber-950 dark:text-amber-100'
        }`}
        role="status"
        aria-live="polite"
      >
        {good ? (
          <CheckCircle2 className="mt-0.5 w-4 h-4 shrink-0" aria-hidden="true" />
        ) : (
          <AlertTriangle className="mt-0.5 w-4 h-4 shrink-0" aria-hidden="true" />
        )}
        <p className="text-sm leading-snug">{verdict(result)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-[var(--separator)] px-3.5 py-3">
          <p className="text-xs ink-tertiary">Cobertura</p>
          <p className="mt-1 text-2xl font-semibold tabular">{percent(result.coverage)}</p>
          <p className="mt-0.5 text-xs ink-secondary tabular">
            {result.introducedCards} de {result.totalCards} cartões
          </p>
        </div>
        <div className="rounded-xl border border-[var(--separator)] px-3.5 py-3">
          <p className="text-xs ink-tertiary">Retenção na data</p>
          <p className="mt-1 text-2xl font-semibold tabular">{percent(result.retention)}</p>
          <p className="mt-0.5 text-xs ink-secondary tabular">
            {percent(result.onTargetShare)} na meta
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-[var(--separator)] rounded-xl border border-[var(--separator)] py-3 text-center">
        <div>
          <p className="text-[11px] ink-tertiary">Novos/dia</p>
          <p className="text-sm font-semibold tabular">{number(result.averageNewPerDay)}</p>
        </div>
        <div>
          <p className="text-[11px] ink-tertiary">Revisões/dia</p>
          <p className="text-sm font-semibold tabular">{number(result.averageReviewsPerDay)}</p>
        </div>
        <div>
          <p className="text-[11px] ink-tertiary">Pico</p>
          <p className="text-sm font-semibold tabular">{number(result.peakReviewsPerDay)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs ink-tertiary">
        <span>
          {result.days === 0
            ? 'Avaliação para hoje'
            : `${result.days} ${result.days === 1 ? 'dia restante' : 'dias restantes'}`}
        </span>
        <span aria-hidden="true">·</span>
        <span>{result.runs} simulações</span>
        <button
          type="button"
          onClick={onOpenSettings}
          className="ml-auto min-h-9 px-2.5 rounded-lg font-semibold text-red-700 dark:text-red-300 cursor-pointer hover:bg-red-600/10 transition-colors"
        >
          Ajustar limites
        </button>
      </div>
    </div>
  );
};

export const StudyPlanner: React.FC<StudyPlannerProps> = ({
  cards,
  deckConfig,
  fsrsOptions,
  onUpdateDeckConfig,
  onRequestMigration,
  onOpenSettings,
}) => {
  const activePlan = deckConfig.studyPlan?.enabled ? deckConfig.studyPlan : undefined;
  const activeCards = useMemo(
    () => cards.filter((card) => deckConfig.activeLevels.includes(card.level) && !card.suspended),
    [cards, deckConfig.activeLevels]
  );
  const now = useNow();
  const today = todayKey(now, deckConfig.studyDayStartHour);
  const defaultDate = addDaysToKey(today, DEFAULT_STUDY_PLAN_DAYS);
  const maxDate = addDaysToKey(today, MAX_STUDY_PLAN_DAYS);

  const [mode, setMode] = useState<'summary' | 'form'>(activePlan ? 'summary' : 'form');
  const [draftDate, setDraftDate] = useState(activePlan?.targetDate ?? defaultDate);
  const [draftRetention, setDraftRetention] = useState(
    activePlan?.targetRetention ?? DEFAULT_STUDY_PLAN_RETENTION
  );
  const [result, setResult] = useState<PlannerResult | null>(null);
  const [resultPlan, setResultPlan] = useState<StudyPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef(0);
  const autoRequestedRef = useRef<string | null>(null);
  const skipAutoRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const requestPlan = useCallback(
    (plan: StudyPlan) => {
      const input: PlannerInput = {
        cards: activeCards,
        deckConfig,
        fsrsOptions,
        logs: loadReviewLogs(),
        plan,
        now: new Date().toISOString(),
      };
      const request = ++requestRef.current;
      setLoading(true);
      setError(null);
      setResult(null);
      setResultPlan(plan);

      const fallback = async () => {
        try {
          const { runStudyPlan } = await import('../lib/planner');
          const next = runStudyPlan(input);
          if (!mountedRef.current || request !== requestRef.current) return;
          setResult(next);
        } catch {
          if (!mountedRef.current || request !== requestRef.current) return;
          setError('Não foi possível calcular a previsão.');
        } finally {
          if (mountedRef.current && request === requestRef.current) setLoading(false);
        }
      };

      if (typeof Worker === 'undefined') {
        void fallback();
        return;
      }

      if (!workerRef.current) {
        try {
          const worker = new Worker(new URL('../lib/planner.worker.ts', import.meta.url), {
            type: 'module',
          });
          worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
            if (!mountedRef.current || event.data.id !== requestRef.current) return;
            setLoading(false);
            if (event.data.result) setResult(event.data.result);
            else setError(event.data.error ?? 'Não foi possível calcular a previsão.');
          };
          worker.onerror = () => {
            worker.terminate();
            if (workerRef.current === worker) workerRef.current = null;
            if (!mountedRef.current) return;
            setLoading(false);
            setError('Não foi possível calcular a previsão.');
          };
          workerRef.current = worker;
        } catch {
          workerRef.current = null;
        }
      }

      if (!workerRef.current) {
        void fallback();
        return;
      }
      workerRef.current.postMessage({ id: request, input });
    },
    [activeCards, deckConfig, fsrsOptions]
  );

  useEffect(() => {
    if (mode !== 'summary' || !activePlan || fsrsOptions.fsrsVersion === 5) return;
    if (skipAutoRef.current) {
      skipAutoRef.current = false;
      return;
    }
    const signature = [
      activePlan.updatedAt,
      activePlan.targetDate,
      activePlan.targetRetention,
      today,
      activeCards.length,
      deckConfig.dailyNewLimit,
      deckConfig.dailyReviewLimit,
      deckConfig.studyDayStartHour,
      deckConfig.twoButtonGrading ? 'two' : 'four',
      fsrsOptions.request_retention,
      fsrsOptions.maximum_interval,
      fsrsOptions.fsrsVersion ?? 6,
      JSON.stringify(fsrsOptions.retention_by_level ?? {}),
      fsrsOptions.w.join(','),
    ].join('|');
    if (autoRequestedRef.current === signature) return;
    autoRequestedRef.current = signature;
    requestPlan(activePlan);
  }, [
    mode,
    activePlan,
    activeCards.length,
    today,
    deckConfig.dailyNewLimit,
    deckConfig.dailyReviewLimit,
    deckConfig.studyDayStartHour,
    deckConfig.twoButtonGrading,
    fsrsOptions.request_retention,
    fsrsOptions.maximum_interval,
    fsrsOptions.fsrsVersion,
    fsrsOptions.retention_by_level,
    fsrsOptions.w,
    requestPlan,
  ]);

  const validity =
    isDateKey(draftDate) && draftDate >= today && draftDate <= maxDate && activeCards.length > 0;
  const previewReady =
    !!result &&
    !loading &&
    !!resultPlan &&
    resultPlan.targetDate === draftDate &&
    resultPlan.targetRetention === draftRetention;

  const resetPreview = () => {
    requestRef.current += 1;
    setLoading(false);
    setResult(null);
    setResultPlan(null);
    setError(null);
    autoRequestedRef.current = null;
  };

  const handleDate = (value: string) => {
    setDraftDate(value);
    resetPreview();
  };

  const handleRetention = (value: number) => {
    setDraftRetention(value);
    resetPreview();
  };

  const handleCalculate = () => {
    if (!validity) return;
    requestPlan(createStudyPlan(draftDate, draftRetention));
  };

  const handleSave = () => {
    if (!previewReady) return;
    const plan = createStudyPlan(draftDate, draftRetention);
    skipAutoRef.current = true;
    onUpdateDeckConfig({ ...deckConfig, studyPlan: plan });
    setMode('summary');
  };

  const handleEdit = () => {
    if (!activePlan) return;
    setDraftDate(activePlan.targetDate);
    setDraftRetention(activePlan.targetRetention);
    resetPreview();
    setMode('form');
  };

  const handleCancel = () => {
    if (!activePlan) return;
    resetPreview();
    setMode('summary');
  };

  const handleEnd = () => {
    if (!activePlan) return;
    const ended: StudyPlan = { ...activePlan, enabled: false, updatedAt: new Date().toISOString() };
    onUpdateDeckConfig({ ...deckConfig, studyPlan: ended });
    resetPreview();
    setMode('form');
  };

  if (fsrsOptions.fsrsVersion === 5) {
    return (
      <section className="sheet px-6 sm:px-8 py-6" aria-labelledby="study-plan-heading">
        <div className="flex items-center gap-2">
          <h2 id="study-plan-heading" className="text-sm font-medium ink-secondary">
            Plano de estudo
          </h2>
          <CalendarDays className="w-4 h-4 ml-auto ink-tertiary" aria-hidden="true" />
        </div>
        <p className="mt-3 text-sm leading-relaxed">
          O planejador por prazo precisa do FSRS-6. Atualize o motor para calcular cobertura e retenção.
        </p>
        <button
          type="button"
          onClick={onRequestMigration}
          className="mt-4 min-h-11 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-sm cursor-pointer transition-colors"
        >
          Atualizar para FSRS-6
        </button>
      </section>
    );
  }

  const showSummary = mode === 'summary' && !!activePlan;

  return (
    <section className="sheet px-6 sm:px-8 py-6" aria-labelledby="study-plan-heading">
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <h2 id="study-plan-heading" className="text-sm font-medium ink-secondary">
            Plano de estudo
          </h2>
          {showSummary && activePlan ? (
            <p className="mt-1 text-lg font-semibold">Até {formatDate(activePlan.targetDate)}</p>
          ) : (
            <p className="mt-1 text-lg font-semibold">Escolha uma data, veja se cabe</p>
          )}
          <p className="mt-1 text-xs ink-secondary tabular">
            {activeCards.length} {activeCards.length === 1 ? 'cartão ativo' : 'cartões ativos'}
            <span aria-hidden="true"> · </span>
            {deckConfig.dailyNewLimit} novos e {deckConfig.dailyReviewLimit} revisões por dia
          </p>
        </div>
        {showSummary ? (
          <button
            type="button"
            onClick={handleEnd}
            aria-label="Encerrar plano"
            className="size-9 shrink-0 rounded-full flex items-center justify-center cursor-pointer ink-tertiary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        ) : (
          <CalendarDays className="w-5 h-5 shrink-0 ink-tertiary" aria-hidden="true" />
        )}
      </div>

      {showSummary ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm ink-secondary">
            <span>Retenção alvo {percent(activePlan?.targetRetention ?? 0.9)}</span>
            <span aria-hidden="true">·</span>
            <span>
              {activeCards.filter((card) => card.state === 0).length} novos restantes
            </span>
          </div>

          {loading && (
            <p className="mt-4 flex items-center gap-2 text-sm ink-secondary" aria-live="polite">
              <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              Calculando a previsão...
            </p>
          )}
          {error && (
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-amber-600/25 bg-amber-500/10 px-3.5 py-3">
              <p className="text-sm">{error}</p>
              <button
                type="button"
                onClick={() => activePlan && requestPlan(activePlan)}
                className="ml-auto flex items-center gap-1.5 min-h-9 px-2.5 rounded-lg text-xs font-semibold cursor-pointer hover:bg-black/5 dark:hover:bg-white/10"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                Tentar de novo
              </button>
            </div>
          )}
          {result && <PlannerMetrics result={result} onOpenSettings={onOpenSettings} />}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleEdit}
              className="min-h-10 px-3.5 rounded-xl border border-[var(--separator)] text-sm font-semibold cursor-pointer hover:bg-black/5 dark:hover:bg-white/10 transition-colors inline-flex items-center gap-1.5"
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              Editar plano
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mt-5 grid gap-4">
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="study-plan-date" className="text-sm font-medium">
                Data alvo
              </label>
              <input
                id="study-plan-date"
                type="date"
                min={today}
                max={maxDate}
                value={draftDate}
                onChange={(event) => handleDate(event.target.value)}
                className="min-h-11 px-3 rounded-xl text-sm font-semibold tabular glass-field focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <label htmlFor="study-plan-retention" className="text-sm font-medium">
                  Retenção na data
                </label>
                <span className="tabular text-sm font-semibold">{percent(draftRetention)}</span>
              </div>
              <input
                id="study-plan-retention"
                type="range"
                min={STUDY_PLAN_RETENTION_MIN * 100}
                max={STUDY_PLAN_RETENTION_MAX * 100}
                step={1}
                value={draftRetention * 100}
                onChange={(event) => handleRetention(Number(event.target.value) / 100)}
                className="w-full accent-red-600 cursor-pointer"
              />
            </div>

            <p className="text-xs ink-tertiary">
              A previsão usa seus limites diários e seu histórico. Cartões suspensos ficam fora.
            </p>

            <button
              type="button"
              onClick={handleCalculate}
              disabled={!validity || loading}
              className="min-h-12 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <CalendarDays className="w-4 h-4" aria-hidden="true" />
              )}
              {loading ? 'Simulando...' : 'Calcular previsão'}
            </button>
            {!activeCards.length && (
              <p className="text-xs ink-tertiary">Ative um nível com cartões para calcular o plano.</p>
            )}
          </div>

          {error && (
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-amber-600/25 bg-amber-500/10 px-3.5 py-3">
              <p className="text-sm">{error}</p>
              <button
                type="button"
                onClick={handleCalculate}
                className="ml-auto flex items-center gap-1.5 min-h-9 px-2.5 rounded-lg text-xs font-semibold cursor-pointer hover:bg-black/5 dark:hover:bg-white/10"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                Tentar de novo
              </button>
            </div>
          )}

          {result && <PlannerMetrics result={result} onOpenSettings={onOpenSettings} />}

          <div className="mt-5 flex items-center gap-2">
            {activePlan && (
              <button
                type="button"
                onClick={handleCancel}
                className="min-h-10 px-3.5 rounded-xl text-sm font-semibold cursor-pointer ink-secondary hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                Cancelar
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={!previewReady}
              className="ml-auto min-h-10 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-sm cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {activePlan ? 'Salvar alterações' : 'Salvar plano'}
            </button>
          </div>
        </>
      )}
    </section>
  );
};
