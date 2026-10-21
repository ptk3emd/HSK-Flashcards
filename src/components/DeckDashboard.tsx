import React, { useMemo, useState } from 'react';
import { Card, DeckConfig, FSRSOptions } from '../types/card';
import { ALL_HSK_LEVELS, HSK_LEVEL_INFO, LEVEL_NUMERALS, loadNativeLevelCards } from '../data/defaultDecks';
import { COURSE, levelLabel } from '../lib/course';
import { loadReviewLogs } from '../lib/storage';
import { dailyUsage, remainingDailyLimits, reviewedCardIdsOnDay } from '../lib/dailyUsage';
import { BrandMark } from './BrandHeader';
import { CourseSwitch } from './CourseSwitch';
import { StudyPlanner } from './StudyPlanner';
import { useNow } from './useNow';
import { addDaysToKey, effectiveDailyLimits, isDateKey, studyDayKey, todayKey } from '../lib/studyPlan';
import { Play, Loader2, FastForward } from 'lucide-react';

interface DeckDashboardProps {
  cards: Card[];
  deckConfig: DeckConfig;
  fsrsOptions: FSRSOptions;
  onUpdateDeckConfig: (config: DeckConfig) => void;
  onStartStudy: (
    isolatedLevel?: string | null,
    freePractice?: boolean,
    ahead?: boolean,
    aheadUntil?: string | null
  ) => void;
  onAddCards: (newCards: Card[]) => void;
  onRequestMigration: () => void;
  onNavigateTab?: (tab: 'study' | 'decks' | 'browser' | 'stats' | 'settings') => void;
}

export const DeckDashboard: React.FC<DeckDashboardProps> = ({
  cards,
  deckConfig,
  fsrsOptions,
  onUpdateDeckConfig,
  onStartStudy,
  onAddCards,
  onRequestMigration,
  onNavigateTab,
}) => {
  const [loadingLevel, setLoadingLevel] = useState<string | null>(null);

  // Suspended cards are not pending work, so they stay out of the study counts
  const activeLevelCards = useMemo(() => {
    return cards.filter(c => deckConfig.activeLevels.includes(c.level) && !c.suspended);
  }, [cards, deckConfig.activeLevels]);

  const now = useNow();

  const counts = useMemo(() => {
    const current = now;
    const newCards = activeLevelCards.filter((card) => card.state === 0);
    const learningDue = activeLevelCards.filter(
      (card) => (card.state === 1 || card.state === 3) && new Date(card.due) <= current
    );
    const reviewsDue = activeLevelCards.filter(
      (card) => card.state === 2 && new Date(card.due) <= current
    );
    const logs = loadReviewLogs();
    const reviewedToday = reviewedCardIdsOnDay(logs, current, deckConfig.studyDayStartHour);
    const futureCards = activeLevelCards.filter(
      (card) =>
        !reviewedToday.has(card.id) &&
        Number.isFinite(Date.parse(card.due)) &&
        Date.parse(card.due) > current.getTime()
    );
    const limits = remainingDailyLimits(
      effectiveDailyLimits(deckConfig),
      dailyUsage(logs, current, deckConfig.studyDayStartHour)
    );
    const plannedNew = Math.min(newCards.length, limits.newCards);
    const plannedReviews = Math.min(reviewsDue.length, limits.reviews);
    return {
      dueCount: learningDue.length + plannedNew + plannedReviews,
      newCount: plannedNew,
      learningCount: learningDue.length,
      reviewCount: plannedReviews,
      rawCount: newCards.length + learningDue.length + reviewsDue.length,
      futureCount: futureCards.length,
      futureDays: futureCards.map((card) =>
        studyDayKey(new Date(card.due), deckConfig.studyDayStartHour)
      ),
    };
  }, [
    activeLevelCards,
    deckConfig.dailyNewLimit,
    deckConfig.dailyReviewLimit,
    deckConfig.studyDayStartHour,
    deckConfig.studyPlan,
    now,
  ]);

  const { dueCount, newCount, learningCount, reviewCount, rawCount, futureCount, futureDays } = counts;
  const today = todayKey(now, deckConfig.studyDayStartHour);
  const [aheadUntil, setAheadUntil] = useState(() => addDaysToKey(today, 1));
  const aheadValid = isDateKey(aheadUntil) && aheadUntil > today;
  const aheadCount = aheadValid ? futureDays.filter((day) => day <= aheadUntil).length : 0;
  const aheadPresets = [
    { days: 1, label: 'Amanhã' },
    { days: 3, label: '3 d' },
    { days: 7, label: '7 d' },
  ];
  const startBeyondLimits = dueCount === 0 && rawCount > 0;
  const startAhead = dueCount === 0 && rawCount === 0 && futureCount > 0;


  const handleToggleOrActivateLevel = async (lvl: string) => {
    const levelCards = cards.filter(c => c.level === lvl);

    if (levelCards.length === 0) {
      setLoadingLevel(lvl);
      try {
        const nativeCards = await loadNativeLevelCards(lvl);
        onAddCards(nativeCards);
        if (!deckConfig.activeLevels.includes(lvl)) {
          onUpdateDeckConfig({
            ...deckConfig,
            activeLevels: [...deckConfig.activeLevels, lvl],
          });
        }
      } catch (e) {
        console.error('Failed to load native level', lvl, e);
      } finally {
        setLoadingLevel(null);
      }
      return;
    }

    let nextLevels = [...deckConfig.activeLevels];
    if (nextLevels.includes(lvl)) {
      if (nextLevels.length === 1) return;
      nextLevels = nextLevels.filter(l => l !== lvl);
    } else {
      nextLevels.push(lvl);
    }
    onUpdateDeckConfig({ ...deckConfig, activeLevels: nextLevels });
  };

  const handleStudyIsolated = async (lvl: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    const levelCards = cards.filter(c => c.level === lvl);
    if (levelCards.length === 0) {
      setLoadingLevel(lvl);
      try {
        const nativeCards = await loadNativeLevelCards(lvl);
        onAddCards(nativeCards);
        onStartStudy(lvl);
      } catch (err) {
        console.error('Failed to load level for isolated study', lvl, err);
      } finally {
        setLoadingLevel(null);
      }
      return;
    }

    onStartStudy(lvl);
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 animate-in fade-in duration-200">
      {/* Brand lockup: the seal mark and the name, above the day's count */}
      <div className="flex items-center gap-2.5 px-1">
        <BrandMark className="size-6" />
        <span className="hanzi-index text-lg font-semibold">{COURSE.brand}</span>
        <span className="text-[11px] uppercase tracking-[0.2em] ink-tertiary">{COURSE.brandSub}</span>
        <CourseSwitch className="ml-auto" />
      </div>

      {/* Today: the count and the one action that matters */}
      <section className="sheet px-6 pt-6 pb-6 sm:px-8 sm:pt-8" aria-labelledby="today-heading">
        <h1 id="today-heading" className="text-sm font-medium ink-secondary">
          Hoje
        </h1>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="hanzi-index tabular text-6xl sm:text-7xl">{dueCount}</span>
          <span className="text-base ink-secondary">{dueCount === 1 ? 'cartão' : 'cartões'}</span>
        </p>
        <p className="mt-3 text-sm tabular ink-secondary">
          <span className="font-semibold text-blue-700 dark:text-blue-300">{newCount}</span> novos
          <span aria-hidden="true"> · </span>
          <span className="state-learning font-semibold text-red-700 dark:text-red-300">{learningCount}</span> aprendendo
          <span aria-hidden="true"> · </span>
          <span className="font-semibold text-emerald-700 dark:text-emerald-300">{reviewCount}</span> revisão
        </p>
        {rawCount > dueCount && (
          <p className="mt-1 text-xs ink-tertiary">Limites diários aplicados.</p>
        )}
        <button
          type="button"
          onClick={() => onStartStudy(null, startBeyondLimits, startAhead)}
          disabled={rawCount === 0 && futureCount === 0}
          className="mt-6 w-full min-h-14 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-semibold text-base flex items-center justify-center gap-2 cursor-pointer transition-colors active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Play className="w-4 h-4 fill-current" aria-hidden="true" />
          {startAhead
            ? 'Estudar adiantado'
            : rawCount === 0
            ? 'Nada para hoje'
            : startBeyondLimits
            ? 'Praticar além do limite'
            : 'Estudar'}
        </button>

        {/* Ahead: pull reviews due up to a chosen day, the most forgotten first */}
        {futureCount > 0 && (
          <div className="mt-5 pt-4 border-t border-[var(--separator)] space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="ahead-until" className="text-sm font-medium mr-auto">
                Adiantar até
              </label>
              <div role="group" aria-label="Atalhos" className="flex gap-0.5 p-0.5 rounded-xl bg-black/[0.05] dark:bg-white/[0.07]">
                {aheadPresets.map((preset) => {
                  const key = addDaysToKey(today, preset.days);
                  const active = aheadUntil === key;
                  return (
                    <button
                      key={preset.days}
                      type="button"
                      onClick={() => setAheadUntil(key)}
                      aria-pressed={active}
                      className={`min-h-10 px-3 rounded-[10px] text-sm font-medium cursor-pointer transition-colors ${
                        active
                          ? 'bg-white text-ink shadow-sm dark:bg-white/20 dark:text-white'
                          : 'ink-secondary hover:text-[var(--text-fg)]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
              <input
                id="ahead-until"
                type="date"
                min={addDaysToKey(today, 1)}
                value={aheadUntil}
                onChange={(event) => setAheadUntil(event.target.value)}
                className="min-h-11 px-3 rounded-xl text-sm tabular glass-field focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
              />
            </div>
            <button
              type="button"
              onClick={() => onStartStudy(null, false, true, aheadUntil)}
              disabled={aheadCount === 0}
              className="w-full min-h-11 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors bg-black/[0.05] hover:bg-black/[0.09] dark:bg-white/[0.08] dark:hover:bg-white/[0.14] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FastForward className="w-4 h-4" aria-hidden="true" />
              {aheadCount === 0
                ? 'Nada até essa data'
                : `Adiantar ${aheadCount} ${aheadCount === 1 ? 'revisão' : 'revisões'}`}
            </button>
          </div>
        )}
      </section>

      <StudyPlanner
        cards={cards}
        deckConfig={deckConfig}
        fsrsOptions={fsrsOptions}
        onUpdateDeckConfig={onUpdateDeckConfig}
        onRequestMigration={onRequestMigration}
        onOpenSettings={() => onNavigateTab?.('settings')}
        onReinforce={(until) => onStartStudy(null, false, true, until)}
      />

      {/* Levels as a ledger: hanzi numeral, state, count, a hairline of progress */}
      <section className="sheet overflow-hidden" aria-labelledby="levels-heading">
        <h2 id="levels-heading" className="px-6 sm:px-8 pt-5 pb-2 text-sm font-medium ink-secondary">
          Níveis
        </h2>
        <ul className="ledger">
          {ALL_HSK_LEVELS.map((lvl, idx) => {
            const levelCards = cards.filter(c => c.level === lvl);
            const isLoaded = levelCards.length > 0;
            const { count, total } = HSK_LEVEL_INFO[lvl];
            const isActive = isLoaded && deckConfig.activeLevels.includes(lvl);
            const levelDue = levelCards.filter(
              c => !c.suspended && (c.state === 0 || new Date(c.due) <= now)
            ).length;
            const studied = levelCards.filter(c => c.reps > 0).length;
            const progress = isLoaded ? studied / levelCards.length : 0;
            const isLoading = loadingLevel === lvl;
            const stateLabel = isLoading ? 'Baixando' : isActive ? 'Ativo' : isLoaded ? 'Inativo' : 'Não baixado';

            return (
              <li
                key={lvl}
                // The levels arrive as a list: a short stagger, 30 ms apart, capped at 240 ms
                style={{ '--enter-delay': `${Math.min(idx, 8) * 30}ms` } as React.CSSProperties}
                className="animate-in fade-in enter-rise duration-300 relative flex items-center gap-4 px-6 sm:px-8 py-3 has-[>button:focus-visible]:outline-2 has-[>button:focus-visible]:-outline-offset-2 has-[>button:focus-visible]:outline-[var(--color-focus)] hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors"
              >
                {/* The row toggles the level; the button's ::after covers the whole row */}
                <button
                  type="button"
                  onClick={() => handleToggleOrActivateLevel(lvl)}
                  disabled={isLoading}
                  aria-pressed={isActive}
                  className="flex-1 min-w-0 min-h-12 flex items-center gap-4 text-left cursor-pointer focus-visible:outline-none after:absolute after:inset-0 disabled:cursor-wait"
                >
                  <span
                    aria-hidden="true"
                    className={`hanzi-index w-14 whitespace-nowrap shrink-0 text-center transition-colors ${
                      lvl === 'HSK 7-9' ? 'text-lg' : 'text-[28px]'
                    } ${isActive ? 'text-red-600 dark:text-red-400' : 'ink-tertiary'}`}
                  >
                    {LEVEL_NUMERALS[lvl]}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex flex-wrap items-baseline gap-x-2 min-w-0">
                      <span className="font-semibold whitespace-nowrap">{levelLabel(lvl)}</span>
                      <span className="text-xs tabular ink-tertiary whitespace-nowrap">{formatCount(total)} no total</span>
                    </span>
                    <span className="block text-xs tabular ink-secondary truncate">
                      +{formatCount(count)}
                      {isActive && !isLoading ? ' novas' : ` · ${stateLabel.toLowerCase()}`}
                    </span>
                    {isLoaded && (
                      <span className="mt-2 block h-0.5 rounded-full bg-black/10 dark:bg-white/10" aria-hidden="true">
                        <span
                          className="block h-full rounded-full bg-red-600/70 dark:bg-red-400/70"
                          style={{ width: `${Math.round(progress * 100)}%` }}
                        />
                      </span>
                    )}
                  </span>
                </button>

                <span className="relative z-10 pointer-events-none w-10 text-right text-sm font-semibold tabular">
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 ml-auto animate-spin motion-reduce:animate-none text-red-500" aria-hidden="true" />
                  ) : levelDue > 0 ? (
                    <span aria-label={`${levelDue} pendentes`}>{levelDue}</span>
                  ) : null}
                </span>

                <button
                  type="button"
                  onClick={(e) => handleStudyIsolated(lvl, e)}
                  disabled={isLoading}
                  aria-label={`Estudar só ${levelLabel(lvl)}`}
                  className="relative z-10 size-11 shrink-0 rounded-full flex items-center justify-center cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40"
                >
                  <Play className="w-4 h-4 fill-current" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
};

/** Hanzi numerals for the level column; the advanced band reads 七–九 */

const formatCount = (n: number) => n.toLocaleString('pt-BR');
