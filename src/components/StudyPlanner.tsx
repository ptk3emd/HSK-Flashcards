import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Loader2,
  FastForward,
  Pencil,
  RefreshCw,
  X,
} from 'lucide-react';
import { Card, DeckConfig, FSRSOptions, StudyPlan, StudyPlanApplied, StudyPlanPace } from '../types/card';
import {
  addDaysToKey,
  createStudyPlan,
  DEFAULT_STUDY_PLAN_DAYS,
  DEFAULT_STUDY_PLAN_MINUTES,
  DEFAULT_STUDY_PLAN_RETENTION,
  isDateKey,
  isGoalPlan,
  MAX_DYNAMIC_MINUTES,
  MAX_INTENSIVE_MINUTES,
  MAX_STUDY_PLAN_DAYS,
  MIN_STUDY_PLAN_MINUTES,
  planLevels,
  STUDY_PLAN_RETENTION_MAX,
  STUDY_PLAN_RETENTION_MIN,
  todayKey,
} from '../lib/studyPlan';
import { loadReviewLogs } from '../lib/storage';
import { useNow } from './useNow';
import { ALL_HSK_LEVELS } from '../data/defaultDecks';
import { levelLabel } from '../lib/course';
import type { PlannerInput, PlannerResult } from '../lib/planner';

interface StudyPlannerProps {
  cards: Card[];
  deckConfig: DeckConfig;
  fsrsOptions: FSRSOptions;
  onUpdateDeckConfig: (config: DeckConfig) => void;
  onRequestMigration: () => void;
  onOpenSettings: () => void;
  /** Starts an ahead session up to the given study day: the intensive reinforcement */
  onReinforce: (until: string) => void;
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

const goalVerdict = (result: PlannerResult): string => {
  const goal = result.goal;
  if (!goal) return verdict(result);
  if (result.feasible) {
    return `Cabe no prazo: cerca de ${percent(result.matureShare)} das palavras maduras na data.`;
  }
  if (goal.neededMinutesPerDay) {
    return `Não cabe em ${goal.minutesPerDay} min por dia: precisa de cerca de ${goal.neededMinutesPerDay} min.`;
  }
  return 'O prazo é curto demais para as palavras amadurecerem. Escolha uma data mais distante.';
};

const GoalMetrics: React.FC<{
  result: PlannerResult;
  onReinforce?: () => void;
}> = ({ result, onReinforce }) => {
  const goal = result.goal;
  if (!goal) return null;
  const good = result.feasible;
  const rows: { label: string; value: string; detail?: string }[] = [
    {
      label: 'Hoje',
      value: `${goal.newToday} novos`,
      detail: `até ${goal.reviewsPerDay} revisões · faltam ~${goal.minutesToday} min`,
    },
    {
      label: 'Ritmo',
      value: `${goal.newPerDay} novos/dia`,
      detail: `pico de ~${goal.peakMinutes} min · ${goal.minutesPerDay} min disponíveis`,
    },
    {
      label: 'Maduras na data',
      value: percent(result.matureShare),
      detail: `retenção prevista ${percent(result.retention)}`,
    },
    {
      label: goal.pace === 'intensive' ? 'Retenção do intensivo' : 'Retenção do agendador',
      value: percent(goal.retention),
      detail: goal.paceMeasured
        ? `seu ritmo: ${number(goal.secondsPerNew)} s por novo, ${number(goal.secondsPerReview)} s por revisão`
        : 'ritmo padrão até haver histórico suficiente',
    },
  ];
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
        <p className="text-sm leading-snug">{goalVerdict(result)}</p>
      </div>
      <ul className="ledger border-y border-[var(--separator)]">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-4 py-2.5">
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium">{row.label}</span>
              {row.detail && <span className="block text-xs ink-tertiary tabular">{row.detail}</span>}
            </span>
            <span className="tabular text-base font-semibold text-right">{row.value}</span>
          </li>
        ))}
      </ul>
      {goal.pace === 'intensive' && onReinforce && (
        <button
          type="button"
          onClick={onReinforce}
          className="w-full min-h-11 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors bg-black/[0.05] hover:bg-black/[0.09] dark:bg-white/[0.08] dark:hover:bg-white/[0.14]"
        >
          <FastForward className="w-4 h-4" aria-hidden="true" />
          Reforço: adiantar os próximos 3 dias
        </button>
      )}
    </div>
  );
};

const sameApplied = (left: StudyPlanApplied | undefined, right: StudyPlanApplied) =>
  !!left &&
  left.date === right.date &&
  left.newPerDay === right.newPerDay &&
  left.reviewsPerDay === right.reviewsPerDay &&
  left.retention === right.retention;

const appliedFrom = (result: PlannerResult): StudyPlanApplied | undefined =>
  result.goal
    ? {
        date: result.today,
        newPerDay: result.goal.newToday,
        reviewsPerDay: result.goal.reviewsPerDay,
        retention: result.goal.retention,
      }
    : undefined;

export const StudyPlanner: React.FC<StudyPlannerProps> = ({
  cards,
  deckConfig,
  fsrsOptions,
  onUpdateDeckConfig,
  onRequestMigration,
  onOpenSettings,
  onReinforce,
}) => {
  const activePlan = deckConfig.studyPlan?.enabled ? deckConfig.studyPlan : undefined;
  const activeCards = useMemo(
    () => cards.filter((card) => deckConfig.activeLevels.includes(card.level) && !card.suspended),
    [cards, deckConfig.activeLevels]
  );
  const loadedLevels = useMemo(
    () => ALL_HSK_LEVELS.filter((level) => cards.some((card) => card.level === level)),
    [cards]
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
  const [draftLevels, setDraftLevels] = useState<string[]>(
    activePlan ? planLevels(activePlan, deckConfig.activeLevels) : deckConfig.activeLevels
  );
  const [draftPace, setDraftPace] = useState<StudyPlanPace>(activePlan?.pace ?? 'dynamic');
  const [draftMinutes, setDraftMinutes] = useState(
    activePlan?.minutesPerDay ?? DEFAULT_STUDY_PLAN_MINUTES
  );
  const maxMinutes = draftPace === 'intensive' ? MAX_INTENSIVE_MINUTES : MAX_DYNAMIC_MINUTES;
  const draftCards = useMemo(
    () => cards.filter((card) => draftLevels.includes(card.level) && !card.suspended),
    [cards, draftLevels]
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
        cards: isGoalPlan(plan) ? cards : activeCards,
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
    [activeCards, cards, deckConfig, fsrsOptions]
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
      activePlan.pace ?? '',
      activePlan.minutesPerDay ?? 0,
      (activePlan.levels ?? []).join(','),
      today,
      activeCards.length,
      cards.length,
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
    cards.length,
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
    isDateKey(draftDate) && draftDate > today && draftDate <= maxDate && draftCards.length > 0;
  const previewReady =
    !!result &&
    !loading &&
    !!resultPlan &&
    resultPlan.targetDate === draftDate &&
    resultPlan.targetRetention === draftRetention &&
    resultPlan.pace === draftPace &&
    resultPlan.minutesPerDay === draftMinutes &&
    (resultPlan.levels ?? []).join(',') === draftLevels.join(',');

  // A goal follows the solved limits: every fresh solution for the saved plan is written back,
  // so the study queue picks up today's numbers (and tomorrow's, when the plan reruns)
  useEffect(() => {
    if (!activePlan || !isGoalPlan(activePlan) || !result || loading) return;
    if (!resultPlan || resultPlan.updatedAt !== activePlan.updatedAt) return;
    const applied = appliedFrom(result);
    if (!applied || sameApplied(activePlan.applied, applied)) return;
    skipAutoRef.current = true;
    onUpdateDeckConfig({ ...deckConfig, studyPlan: { ...activePlan, applied } });
  }, [result, resultPlan, loading, activePlan, deckConfig, onUpdateDeckConfig]);

  const goalDraft = () =>
    createStudyPlan(draftDate, draftRetention, new Date(), {
      levels: draftLevels,
      pace: draftPace,
      minutesPerDay: draftMinutes,
    });

  const toggleLevel = (level: string) => {
    setDraftLevels((current) =>
      current.includes(level)
        ? current.filter((item) => item !== level)
        : ALL_HSK_LEVELS.filter((item) => item === level || current.includes(item))
    );
    resetPreview();
  };

  const handlePace = (pace: StudyPlanPace) => {
    setDraftPace(pace);
    const cap = pace === 'intensive' ? MAX_INTENSIVE_MINUTES : MAX_DYNAMIC_MINUTES;
    setDraftMinutes((minutes) => Math.min(minutes, cap));
    resetPreview();
  };

  const handleMinutes = (minutes: number) => {
    setDraftMinutes(minutes);
    resetPreview();
  };

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
    requestPlan(goalDraft());
  };

  const handleSave = () => {
    if (!previewReady || !result || !resultPlan) return;
    const applied = appliedFrom(result);
    const plan: StudyPlan = { ...resultPlan, updatedAt: new Date().toISOString(), ...(applied ? { applied } : {}) };
    skipAutoRef.current = true;
    onUpdateDeckConfig({ ...deckConfig, studyPlan: plan });
    setResultPlan(plan);
    setMode('summary');
  };

  const handleEdit = () => {
    if (!activePlan) return;
    setDraftDate(activePlan.targetDate);
    setDraftRetention(activePlan.targetRetention);
    setDraftLevels(planLevels(activePlan, deckConfig.activeLevels));
    setDraftPace(activePlan.pace ?? 'dynamic');
    setDraftMinutes(activePlan.minutesPerDay ?? DEFAULT_STUDY_PLAN_MINUTES);
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
            <p className="mt-1 text-lg font-semibold">Objetivo: níveis, prazo e tempo por dia</p>
          )}
          {showSummary && isGoalPlan(activePlan) ? (
            <p className="mt-1 text-xs ink-secondary tabular">
              {planLevels(activePlan, deckConfig.activeLevels).map(levelLabel).join(', ')}
              <span aria-hidden="true"> · </span>
              {activePlan.pace === 'intensive' ? 'Intensivo' : 'Dinâmico'}, {activePlan.minutesPerDay} min por dia
            </p>
          ) : showSummary ? (
            <p className="mt-1 text-xs ink-secondary tabular">
              {activeCards.length} {activeCards.length === 1 ? 'cartão ativo' : 'cartões ativos'}
              <span aria-hidden="true"> · </span>
              {deckConfig.dailyNewLimit} novos e {deckConfig.dailyReviewLimit} revisões por dia
            </p>
          ) : (
            <p className="mt-1 text-xs ink-secondary tabular">
              {draftCards.length} {draftCards.length === 1 ? 'palavra' : 'palavras'} no objetivo
            </p>
          )}
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
              {(isGoalPlan(activePlan)
                ? cards.filter(
                    (card) =>
                      !card.suspended &&
                      planLevels(activePlan, deckConfig.activeLevels).includes(card.level)
                  )
                : activeCards
              ).filter((card) => card.state === 0).length}{' '}
              novos restantes
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
          {result &&
            (result.goal ? (
              <GoalMetrics
                result={result}
                onReinforce={() => onReinforce(addDaysToKey(today, 3))}
              />
            ) : (
              <PlannerMetrics result={result} onOpenSettings={onOpenSettings} />
            ))}

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
            <div className="space-y-2">
              <span id="study-plan-levels" className="text-sm font-medium">
                Níveis
              </span>
              <div role="group" aria-labelledby="study-plan-levels" className="flex flex-wrap gap-1.5">
                {loadedLevels.map((level) => {
                  const on = draftLevels.includes(level);
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => toggleLevel(level)}
                      aria-pressed={on}
                      className={`min-h-10 px-3 rounded-xl text-sm font-medium cursor-pointer transition-colors ${
                        on
                          ? 'bg-red-600 text-white'
                          : 'bg-black/[0.05] dark:bg-white/[0.08] ink-secondary hover:text-[var(--text-fg)]'
                      }`}
                    >
                      {levelLabel(level)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <label htmlFor="study-plan-date" className="text-sm font-medium">
                Data da prova
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

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span id="study-plan-pace" className="text-sm font-medium">
                Ritmo
              </span>
              <div role="group" aria-labelledby="study-plan-pace" className="flex gap-0.5 p-0.5 rounded-xl bg-black/[0.05] dark:bg-white/[0.07]">
                {(
                  [
                    { id: 'dynamic', label: 'Dinâmico' },
                    { id: 'intensive', label: 'Intensivo' },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handlePace(option.id)}
                    aria-pressed={draftPace === option.id}
                    className={`min-h-10 px-3 rounded-[10px] text-sm font-medium cursor-pointer transition-colors ${
                      draftPace === option.id
                        ? 'bg-white text-ink shadow-sm dark:bg-white/20 dark:text-white'
                        : 'ink-secondary hover:text-[var(--text-fg)]'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="w-full text-xs ink-tertiary">
                {draftPace === 'intensive'
                  ? 'Introduz as palavras o quanto antes e sobe a retenção até onde o tempo deixa.'
                  : 'O mínimo de novas por dia que ainda amadurece tudo no prazo.'}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <label htmlFor="study-plan-minutes" className="text-sm font-medium">
                  Tempo por dia
                </label>
                <span className="tabular text-sm font-semibold">
                  {draftMinutes >= 60
                    ? `${Math.floor(draftMinutes / 60)} h${draftMinutes % 60 ? ` ${draftMinutes % 60} min` : ''}`
                    : `${draftMinutes} min`}
                </span>
              </div>
              <input
                id="study-plan-minutes"
                type="range"
                min={MIN_STUDY_PLAN_MINUTES}
                max={maxMinutes}
                step={5}
                value={draftMinutes}
                onChange={(event) => handleMinutes(Number(event.target.value))}
                className="w-full accent-red-600 cursor-pointer"
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
              O plano usa seu histórico e define os limites diários; perto da prova, as revisões
              são puxadas para antes dela. Cartões suspensos ficam fora.
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
            {!draftCards.length && (
              <p className="text-xs ink-tertiary">Escolha um nível com cartões para calcular o plano.</p>
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

          {result &&
            (result.goal ? (
              <GoalMetrics result={result} />
            ) : (
              <PlannerMetrics result={result} onOpenSettings={onOpenSettings} />
            ))}

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
              {activePlan ? 'Salvar alterações' : 'Começar objetivo'}
            </button>
          </div>
        </>
      )}
    </section>
  );
};
