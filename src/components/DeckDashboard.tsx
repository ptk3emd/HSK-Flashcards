import React, { useMemo, useState } from 'react';
import { Card, DeckConfig } from '../types/card';
import { ALL_HSK_LEVELS, HSK_LEVEL_INFO, loadNativeLevelCards } from '../data/defaultDecks';
import { Play, Check, Plus, Loader2 } from 'lucide-react';

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
    <div className="w-full max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Minimal Header & Primary Action */}
      <div
        className={`rounded-3xl p-6 sm:p-7 backdrop-blur-xl border transition-all ${
          'bg-white/80 border-black/5 shadow-sm text-[#111113] dark:bg-white/[0.04] dark:border-white/10 dark:text-white dark:shadow-none'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Decks HSK</h1>
            <p className={`text-xs sm:text-sm mt-1 ${'text-black/60 dark:text-white/60'}`}>
              {deckConfig.activeLevels.length} {deckConfig.activeLevels.length === 1 ? 'nível ativo' : 'níveis ativos'} ({deckConfig.activeLevels.join(', ')})
            </p>
          </div>

          <button
            type="button"
            onClick={() => onStartStudy(null)}
            disabled={dueCount === 0}
            className="px-6 py-3 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Estudar ({dueCount})</span>
          </button>
        </div>

        {/* Minimal Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-6 pt-5 border-t border-black/5 dark:border-white/10">
          <div className="p-3 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03]">
            <div className={`text-xs font-semibold ${'text-black/55 dark:text-white/55'}`}>Pendentes</div>
            <div className="text-xl font-black mt-0.5">{dueCount}</div>
          </div>
          <div className="p-3 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03]">
            <div className={`text-xs font-semibold ${'text-blue-600 dark:text-blue-400'}`}>Novos</div>
            <div className="text-xl font-black mt-0.5 text-blue-600 dark:text-blue-400">{newCount}</div>
          </div>
          <div className="p-3 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03]">
            <div className={`text-xs font-semibold ${'text-amber-600 dark:text-amber-400'}`}>Aprendendo</div>
            <div className="text-xl font-black mt-0.5 text-amber-600 dark:text-amber-400">{learningCount}</div>
          </div>
          <div className="p-3 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03]">
            <div className={`text-xs font-semibold ${'text-emerald-600 dark:text-emerald-400'}`}>Revisão</div>
            <div className="text-xl font-black mt-0.5 text-emerald-600 dark:text-emerald-400">{reviewCount}</div>
          </div>
        </div>
      </div>

      {/* Minimal Levels List */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 px-1">
          <h2 className="text-sm font-bold tracking-tight">Níveis HSK 1 a 9</h2>
          <span className={`text-xs ${'text-black/60 dark:text-white/55'}`}>
            Toque no card para ativar ou no botão para estudar isolado
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ALL_HSK_LEVELS.map((lvl, idx) => {
            const levelCards = cards.filter(c => c.level === lvl);
            const isLoaded = levelCards.length > 0;
            const count = isLoaded ? levelCards.length : HSK_LEVEL_INFO[lvl].count;
            const isActive = isLoaded && deckConfig.activeLevels.includes(lvl);
            const levelDue = levelCards.filter(
              c => !c.suspended && (c.state === 0 || new Date(c.due) <= now)
            ).length;
            const isLoading = loadingLevel === lvl;

            return (
              <div
                key={lvl}
                // The levels arrive as a list: a short stagger, 30 ms apart, capped at 240 ms
                style={{ '--enter-delay': `${Math.min(idx, 8) * 30}ms` } as React.CSSProperties}
                className={`animate-in fade-in enter-rise duration-300 relative p-4 rounded-2xl border transition-[background-color,border-color,box-shadow] select-none flex flex-col justify-between gap-3 has-[>button:focus-visible]:outline-2 has-[>button:focus-visible]:outline-offset-2 has-[>button:focus-visible]:outline-[var(--color-focus)] ${
                  isActive
                    ? 'bg-red-50/70 border-red-300 shadow-xs ring-1 ring-red-400/40 dark:bg-red-500/15 dark:border-red-500/50 dark:ring-1 dark:ring-red-500/40 dark:shadow-none'
                    : 'bg-white/80 border-black/5 hover:bg-white shadow-xs dark:bg-white/[0.03] dark:border-white/10 dark:hover:bg-white/[0.06] dark:shadow-none'
                }`}
              >
                {/* The whole card toggles the level: the button's ::after covers it */}
                <button
                  type="button"
                  onClick={() => handleToggleOrActivateLevel(lvl)}
                  disabled={isLoading}
                  aria-pressed={isActive}
                  className="flex items-start justify-between w-full text-left cursor-pointer focus-visible:outline-none after:absolute after:inset-0 after:rounded-2xl disabled:cursor-wait"
                >
                  <span className="block">
                    <span className="flex items-center gap-2">
                      <span className="font-extrabold text-base">{lvl}</span>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          isActive
                            ? 'bg-red-600 text-white'
                            : isLoaded
                            ? 'bg-black/10 text-black/70 dark:bg-white/10 dark:text-white/60'
                            : 'bg-black/5 text-black/50 dark:bg-white/5 dark:text-white/40'
                        }`}
                      >
                        {isActive ? 'Ativo' : isLoaded ? 'Inativo' : 'Disponível'}
                      </span>
                    </span>
                    <span className={`block text-xs mt-1 ${'text-black/60 dark:text-white/60'}`}>
                      {count} vocábulos {isLoaded && levelDue > 0 ? `• ${levelDue} pendentes` : ''}
                    </span>
                  </span>

                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-red-500" aria-hidden="true" />
                  ) : isActive ? (
                    <span className="w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center" aria-hidden="true">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </span>
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center text-xs font-bold opacity-60" aria-hidden="true">
                      <Plus className="w-3.5 h-3.5" />
                    </span>
                  )}
                </button>

                {/* Above the stretched toggle: only the Estudar button takes clicks here */}
                <div className="relative z-10 pointer-events-none pt-2 border-t border-black/5 dark:border-white/10 flex items-center justify-between gap-2">
                  <span className={`text-xs line-clamp-2 ${'text-black/60 dark:text-white/55'}`}>
                    {HSK_LEVEL_INFO[lvl].desc}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => handleStudyIsolated(lvl, e)}
                    disabled={isLoading}
                    aria-label={`Estudar só ${lvl}`}
                    className={`pointer-events-auto min-h-11 sm:min-h-9 py-1.5 px-3 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 flex-shrink-0 ${
                      'bg-black/5 hover:bg-black/10 text-black dark:bg-white/10 dark:hover:bg-white/20 dark:text-white'
                    }`}
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Estudar</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
