import React, { useMemo, useState } from 'react';
import { Card, DeckConfig } from '../types/card';
import { ALL_HSK_LEVELS, HSK_LEVEL_INFO, LEVEL_NUMERALS, loadNativeLevelCards } from '../data/defaultDecks';
import { Play, Loader2 } from 'lucide-react';

interface DeckDashboardProps {
  cards: Card[];
  deckConfig: DeckConfig;
  onUpdateDeckConfig: (config: DeckConfig) => void;
  onStartStudy: (isolatedLevel?: string | null) => void;
  onAddCards: (newCards: Card[]) => void;
  onNavigateTab?: (tab: 'study' | 'decks' | 'browser' | 'stats' | 'settings') => void;
}

export const DeckDashboard: React.FC<DeckDashboardProps> = ({
  cards,
  deckConfig,
  onUpdateDeckConfig,
  onStartStudy,
  onAddCards,
}) => {
  const [loadingLevel, setLoadingLevel] = useState<string | null>(null);

  // Suspended cards are not pending work, so they stay out of the study counts
  const activeLevelCards = useMemo(() => {
    return cards.filter(c => deckConfig.activeLevels.includes(c.level) && !c.suspended);
  }, [cards, deckConfig.activeLevels]);

  const now = new Date();

  const dueCount = useMemo(() => {
    return activeLevelCards.filter(c => {
      if (c.state === 0) return true;
      return new Date(c.due) <= now;
    }).length;
  }, [activeLevelCards, now]);

  const newCount = useMemo(() => {
    return activeLevelCards.filter(c => c.state === 0).length;
  }, [activeLevelCards]);

  const learningCount = useMemo(() => {
    return activeLevelCards.filter(c => c.state === 1 || c.state === 3).length;
  }, [activeLevelCards]);

  const reviewCount = useMemo(() => {
    return activeLevelCards.filter(c => c.state === 2).length;
  }, [activeLevelCards]);


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
          <span className="font-semibold text-red-700 dark:text-red-300">{learningCount}</span> aprendendo
          <span aria-hidden="true"> · </span>
          <span className="font-semibold text-emerald-700 dark:text-emerald-300">{reviewCount}</span> revisão
        </p>
        <button
          type="button"
          onClick={() => onStartStudy(null)}
          disabled={dueCount === 0}
          className="mt-6 w-full min-h-14 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-semibold text-base flex items-center justify-center gap-2 cursor-pointer transition-colors active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Play className="w-4 h-4 fill-current" aria-hidden="true" />
          {dueCount === 0 ? 'Nada para hoje' : 'Estudar'}
        </button>
      </section>

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
                    className={`hanzi-index w-9 shrink-0 text-center transition-colors ${
                      lvl === 'HSK 7-9' ? 'text-lg' : 'text-[28px]'
                    } ${isActive ? 'text-red-600 dark:text-red-400' : 'ink-tertiary'}`}
                  >
                    {LEVEL_NUMERALS[lvl]}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-baseline gap-2 min-w-0">
                      <span className="font-semibold whitespace-nowrap">{lvl}</span>
                      <span className="text-xs tabular ink-tertiary truncate">{formatCount(total)} no total</span>
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
                  aria-label={`Estudar só ${lvl}`}
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
