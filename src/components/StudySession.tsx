import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, DeckConfig, FSRSOptions, Rating, ReviewLog } from '../types/card';
import { MandarinCardView } from './MandarinCardView';
import { predictNextIntervals, scheduleCard } from '../lib/fsrs';
import { pushReviewLog, popReviewLog } from '../lib/storage';
import { speakChinese } from '../lib/speech';
import { ALL_HSK_LEVELS, loadNativeLevelCards } from '../data/defaultDecks';
import { ArrowLeft, RotateCcw, Volume2, CheckCircle2, Moon, Sun, ChevronDown, PenTool, Settings2 } from 'lucide-react';
import { HanziWritingCanvas } from './HanziWritingCanvas';
import { AudioVoiceSettings } from './AudioVoiceSettings';

interface StudySessionProps {
  cards: Card[];
  deckConfig: DeckConfig;
  fsrsOptions: FSRSOptions;
  theme: 'dark' | 'light';
  isolatedLevel: string | null;
  onSelectIsolatedLevel: (lvl: string | null) => void;
  onAddCards: (newCards: Card[]) => void;
  onToggleTheme: () => void;
  onUpdateCards: (updatedCards: Card[]) => void;
  onUpdateDeckConfig?: (config: DeckConfig) => void;
  onExit: () => void;
}

export const StudySession: React.FC<StudySessionProps> = ({
  cards,
  deckConfig,
  fsrsOptions,
  theme,
  isolatedLevel,
  onSelectIsolatedLevel,
  onAddCards,
  onToggleTheme,
  onUpdateCards,
  onUpdateDeckConfig,
  onExit,
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionCards, setSessionCards] = useState<Card[]>(cards);
  const [canUndo, setCanUndo] = useState(false);
  const [isLevelDropdownOpen, setIsLevelDropdownOpen] = useState(false);
  const [showWritingPad, setShowWritingPad] = useState(false);
  const [showVoiceSettingsModal, setShowVoiceSettingsModal] = useState(false);
  const [reviewedInSession, setReviewedInSession] = useState(0);

  const isLight = theme === 'light';

  useEffect(() => {
    setReviewedInSession(0);
  }, [isolatedLevel]);

  useEffect(() => {
    setSessionCards(cards);
  }, [cards]);

  // Filter cards: either for the single isolated level or all active levels in deckConfig
  const activeLevelCards = useMemo(() => {
    if (isolatedLevel) {
      return sessionCards.filter(c => c.level === isolatedLevel);
    }
    return sessionCards.filter(c => deckConfig.activeLevels.includes(c.level));
  }, [sessionCards, isolatedLevel, deckConfig.activeLevels]);

  const dueQueue = useMemo(() => {
    const nowDate = new Date();
    
    // Learning & relearning cards due
    const learningDue = activeLevelCards.filter(c => 
      (c.state === 1 || c.state === 3) && new Date(c.due) <= nowDate
    );

    // Review cards due
    const reviewsDue = activeLevelCards.filter(c => 
      c.state === 2 && new Date(c.due) <= nowDate
    );

    // New cards
    const newCards = activeLevelCards.filter(c => c.state === 0);

    return [...learningDue, ...reviewsDue, ...newCards];
  }, [activeLevelCards]);

  const newCount = useMemo(
    () => activeLevelCards.filter(c => c.state === 0).length,
    [activeLevelCards]
  );
  const learningCount = useMemo(
    () => activeLevelCards.filter(c => c.state === 1 || c.state === 3).length,
    [activeLevelCards]
  );
  const reviewCount = useMemo(
    () => activeLevelCards.filter(c => c.state === 2 && new Date(c.due) <= new Date()).length,
    [activeLevelCards]
  );

  const remainingCount = dueQueue.length;
  const totalSessionCount = reviewedInSession + remainingCount;
  const progressPercent =
    totalSessionCount > 0
      ? Math.min(100, Math.round((reviewedInSession / totalSessionCount) * 100))
      : remainingCount === 0
      ? 100
      : 0;

  const currentCard = dueQueue[0] || null;

  useEffect(() => {
    if (currentCard && deckConfig.autoPlayAudio) {
      speakChinese(currentCard.hanzi, {
        rate: deckConfig.speechSpeed,
        gender: deckConfig.speechVoiceGender,
        voiceURI: deckConfig.speechVoiceURI,
      });
    }
    setIsFlipped(false);
  }, [
    currentCard?.id,
    deckConfig.autoPlayAudio,
    deckConfig.speechSpeed,
    deckConfig.speechVoiceGender,
    deckConfig.speechVoiceURI,
  ]);

  const predictions = useMemo(() => {
    if (!currentCard) return null;
    return predictNextIntervals(currentCard, new Date(), fsrsOptions);
  }, [currentCard, fsrsOptions]);

  const handleSpeak = useCallback(() => {
    if (currentCard) {
      speakChinese(currentCard.hanzi, {
        rate: deckConfig.speechSpeed,
        gender: deckConfig.speechVoiceGender,
        voiceURI: deckConfig.speechVoiceURI,
      });
    }
  }, [
    currentCard,
    deckConfig.speechSpeed,
    deckConfig.speechVoiceGender,
    deckConfig.speechVoiceURI,
  ]);

  const handleAnswer = useCallback(
    (rating: Rating) => {
      if (!currentCard) return;

      const nowDate = new Date();
      const updatedCard = scheduleCard(currentCard, rating, nowDate, fsrsOptions);

      const log: ReviewLog = {
        cardId: currentCard.id,
        rating,
        state: currentCard.state,
        due: currentCard.due,
        stability: currentCard.stability,
        difficulty: currentCard.difficulty,
        elapsed_days: currentCard.elapsed_days,
        last_elapsed_days: currentCard.elapsed_days,
        scheduled_days: updatedCard.scheduled_days,
        reviewTime: nowDate.toISOString(),
        previousCardSnapshot: { ...currentCard },
      };
      pushReviewLog(log);
      setCanUndo(true);

      const newCardList = sessionCards.map(c => (c.id === currentCard.id ? updatedCard : c));
      setSessionCards(newCardList);
      onUpdateCards(newCardList);
      setReviewedInSession(prev => prev + 1);

      setIsFlipped(false);
    },
    [currentCard, fsrsOptions, sessionCards, onUpdateCards]
  );

  const handleUndo = useCallback(() => {
    const lastLog = popReviewLog();
    if (!lastLog) {
      setCanUndo(false);
      return;
    }

    const reverted = sessionCards.map(c => 
      c.id === lastLog.cardId ? lastLog.previousCardSnapshot : c
    );
    setSessionCards(reverted);
    onUpdateCards(reverted);
    setReviewedInSession(prev => Math.max(0, prev - 1));
    setIsFlipped(false);
  }, [sessionCards, onUpdateCards]);

  // Handle switching level right inside study session
  const handleSwitchLevel = async (lvl: string | null) => {
    setIsLevelDropdownOpen(false);
    setReviewedInSession(0);
    if (!lvl) {
      onSelectIsolatedLevel(null);
      return;
    }

    const hasCards = sessionCards.some(c => c.level === lvl);
    if (!hasCards) {
      try {
        const nativeCards = await loadNativeLevelCards(lvl);
        onAddCards(nativeCards);
        onSelectIsolatedLevel(lvl);
      } catch (err) {
        console.error('Failed to load level', lvl, err);
      }
      return;
    }

    onSelectIsolatedLevel(lvl);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (!isFlipped) {
          setIsFlipped(true);
        } else {
          handleAnswer(3); // Good
        }
      } else if (e.key === '1' && isFlipped) {
        handleAnswer(1);
      } else if (e.key === '2' && isFlipped) {
        handleAnswer(2);
      } else if (e.key === '3' && isFlipped) {
        handleAnswer(3);
      } else if (e.key === '4' && isFlipped) {
        handleAnswer(4);
      } else if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey || !isFlipped)) {
        handleUndo();
      } else if (e.key === 'r' || e.key === 'R') {
        handleSpeak();
      } else if (e.key === 'w' || e.key === 'W') {
        setShowWritingPad((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFlipped, handleAnswer, handleUndo, handleSpeak]);

  return (
    <div
      className={`card ${
        isLight ? 'card-theme-light' : 'night_mode card-theme-dark'
      } flex flex-col justify-between select-none relative min-h-screen w-full transition-colors duration-300 overflow-x-hidden`}
    >
      {/* Barra de Progresso da Sessão no Topo */}
      <div className="w-full z-40 bg-black/[0.03] dark:bg-white/[0.04] border-b border-black/5 dark:border-white/10 sticky top-0 backdrop-blur-md">
        {/* Linha da barra de progresso */}
        <div className="w-full bg-black/10 dark:bg-white/10 h-1.5 overflow-hidden">
          <div
            className="h-full bg-red-600 dark:bg-red-500 transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Indicador de cartões restantes da sessão atual */}
        <div className="w-full max-w-2xl mx-auto px-4 py-1.5 flex items-center justify-between text-xs font-medium">
          <div className="flex items-center gap-2">
            <span className="font-bold text-neutral-800 dark:text-neutral-200">
              {remainingCount} {remainingCount === 1 ? 'cartão restante' : 'cartões restantes'}
            </span>
            {reviewedInSession > 0 && (
              <span className="opacity-50 text-[11px]">
                ({reviewedInSession} {reviewedInSession === 1 ? 'concluído' : 'concluídos'})
              </span>
            )}
          </div>
          <span className="font-bold text-[11px] tabular-nums text-red-600 dark:text-red-400">
            {progressPercent}%
          </span>
        </div>
      </div>

      {/* Top Header Bar with Level Filter Dropdown */}
      <header className="w-full max-w-2xl mx-auto px-4 py-3 flex items-center justify-between z-30 relative">
        <button
          type="button"
          onClick={onExit}
          className={`p-2.5 rounded-full backdrop-blur-md transition-all cursor-pointer flex items-center gap-1.5 text-sm font-semibold border ${
            isLight
              ? 'bg-white/80 hover:bg-white text-[#111113] border-white/90 shadow-sm'
              : 'bg-black/35 hover:bg-black/50 text-white/90 hover:text-white border-white/10'
          }`}
          title="Voltar aos Decks"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Decks</span>
        </button>

        {/* Level Selector Dropdown Pill */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsLevelDropdownOpen(!isLevelDropdownOpen)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full backdrop-blur-md border text-xs font-bold tracking-wider transition-all cursor-pointer shadow-sm ${
              isLight
                ? 'bg-white/80 hover:bg-white border-white/90 text-[#111113]'
                : 'bg-black/35 hover:bg-black/50 border-white/10 text-white/90'
            }`}
          >
            <span>{isolatedLevel ? `${isolatedLevel} (Isolado)` : 'Todos Ativos'}</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </button>

          {isLevelDropdownOpen && (
            <div
              className={`absolute top-full mt-2 left-1/2 -translate-x-1/2 w-52 rounded-2xl p-1.5 shadow-2xl border backdrop-blur-2xl z-50 animate-in fade-in zoom-in-95 duration-150 ${
                isLight
                  ? 'bg-white/95 border-white text-[#111113]'
                  : 'bg-neutral-900/95 border-white/15 text-white'
              }`}
            >
              <button
                type="button"
                onClick={() => handleSwitchLevel(null)}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-between ${
                  !isolatedLevel
                    ? 'bg-red-600 text-white'
                    : isLight
                    ? 'hover:bg-black/5'
                    : 'hover:bg-white/10'
                }`}
              >
                <span>Todos Selecionados</span>
                {!isolatedLevel && <CheckCircle2 className="w-3.5 h-3.5" />}
              </button>

              <div className="my-1 border-t border-black/5 dark:border-white/10" />

              <div className="text-[10px] uppercase font-bold tracking-wider px-3 py-1 opacity-50">
                Estudar Isolado:
              </div>

              {ALL_HSK_LEVELS.map((lvl) => {
                const isSelected = isolatedLevel === lvl;
                return (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => handleSwitchLevel(lvl)}
                    className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-red-600 text-white font-bold'
                        : isLight
                        ? 'hover:bg-black/5 text-[#111113]'
                        : 'hover:bg-white/10 text-white'
                    }`}
                  >
                    <span>{lvl}</span>
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Audio, Writing & Theme Controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowWritingPad((prev) => !prev)}
            className={`p-2.5 rounded-full backdrop-blur-md transition-all cursor-pointer border ${
              showWritingPad
                ? 'bg-red-600 text-white border-red-500 shadow-md scale-105'
                : isLight
                ? 'bg-white/80 hover:bg-white text-[#111113] border-white/90 shadow-sm'
                : 'bg-black/35 hover:bg-black/50 text-white/90 hover:text-white border-white/10'
            }`}
            title="Praticar Escrita do Hanzi (W)"
          >
            <PenTool className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleSpeak}
            className={`p-2.5 rounded-full backdrop-blur-md transition-all cursor-pointer border ${
              isLight
                ? 'bg-white/80 hover:bg-white text-[#111113] border-white/90 shadow-sm'
                : 'bg-black/35 hover:bg-black/50 text-white/90 hover:text-white border-white/10'
            }`}
            title="Pronunciar (R)"
          >
            <Volume2 className="w-4 h-4" />
          </button>
          {onUpdateDeckConfig && (
            <button
              type="button"
              onClick={() => setShowVoiceSettingsModal(true)}
              className={`p-2.5 rounded-full backdrop-blur-md transition-all cursor-pointer border ${
                showVoiceSettingsModal
                  ? 'bg-red-600 text-white border-red-500 shadow-md scale-105'
                  : isLight
                  ? 'bg-white/80 hover:bg-white text-[#111113] border-white/90 shadow-sm'
                  : 'bg-black/35 hover:bg-black/50 text-white/90 hover:text-white border-white/10'
              }`}
              title="Configurar Voz e Gênero (TTS)"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onToggleTheme}
            className={`p-2.5 rounded-full backdrop-blur-md transition-all cursor-pointer border ${
              isLight
                ? 'bg-white/80 hover:bg-white text-[#111113] border-white/90 shadow-sm'
                : 'bg-black/35 hover:bg-black/50 text-white/90 hover:text-white border-white/10'
            }`}
            title="Alternar Modo Claro / Escuro"
          >
            {isLight ? <Moon className="w-4 h-4 text-slate-800" /> : <Sun className="w-4 h-4 text-amber-300" />}
          </button>
        </div>
      </header>

      {/* Main Flashcard Scene (Zero vertical shifting on answer reveal) */}
      <main
        className="study-card-container w-full flex-1 flex flex-col items-center justify-center my-auto cursor-pointer py-4"
        style={{
          perspective: '1000px',
          WebkitPerspective: '1000px',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
        }}
        onClick={() => {
          if (!isFlipped && currentCard) setIsFlipped(true);
        }}
      >
        {currentCard ? (
          <MandarinCardView
            card={currentCard}
            isFlipped={isFlipped}
            onSpeak={handleSpeak}
            onOpenWriting={() => setShowWritingPad(true)}
          />
        ) : (
          <div className="mandarin-scene">
            <div
              className={`mandarin-card text-center py-12 px-6 flex flex-col items-center gap-4 ${
                isLight ? 'bg-white/85 text-[#111113]' : ''
              }`}
            >
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center mb-1">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-black tracking-tight">
                {isolatedLevel ? `Nível ${isolatedLevel} Concluído!` : 'Sessão Concluída!'}
              </h2>
              <p className="text-sm opacity-80 max-w-sm">
                {isolatedLevel
                  ? `Você concluiu todos os cartões agendados para ${isolatedLevel}.`
                  : 'Todos os cartões agendados para os níveis ativos foram revisados.'}
              </p>

              <div className="mt-3 flex flex-wrap gap-2.5 justify-center">
                {isolatedLevel && (
                  <button
                    type="button"
                    onClick={() => handleSwitchLevel(null)}
                    className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition-all cursor-pointer shadow-md"
                  >
                    Estudar Todos os Níveis
                  </button>
                )}
                <button
                  type="button"
                  onClick={onExit}
                  className={`px-5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer shadow-md ${
                    isLight
                      ? 'bg-black/10 hover:bg-black/15 text-black'
                      : 'bg-white/20 hover:bg-white/30 text-white'
                  }`}
                >
                  Voltar ao Painel
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Bar — Anki style with fixed layout height to prevent vertical jitter */}
      <footer className="w-full max-w-2xl mx-auto px-4 py-4 flex flex-col items-center gap-3 z-20">
        {/* Anki Counts (New, Learning, Review) */}
        <div className="flex items-center justify-between w-full px-2 text-sm font-semibold">
          <div
            className={`flex items-center gap-3 backdrop-blur-md px-3.5 py-1.5 rounded-full border shadow-sm ${
              isLight
                ? 'bg-white/85 border-white/95 text-[#111113]'
                : 'bg-black/35 border-white/10 text-white'
            }`}
          >
            <span className="text-blue-600 dark:text-blue-400 font-black" title="Novos">{newCount}</span>
            <span className="text-red-600 dark:text-red-400 font-black" title="Aprendendo">{learningCount}</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-black" title="Revisão">{reviewCount}</span>
          </div>

          {canUndo && (
            <button
              type="button"
              onClick={handleUndo}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-md text-xs font-semibold cursor-pointer transition-all border shadow-sm ${
                isLight
                  ? 'bg-white/85 hover:bg-white text-[#111113] border-white/95'
                  : 'bg-black/35 hover:bg-black/50 text-white/90 border-white/10'
              }`}
              title="Desfazer última revisão (Ctrl+Z)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Desfazer</span>
            </button>
          )}
        </div>

        {/* Action Controls with fixed min-height to guarantee zero layout flicker */}
        <div className="w-full min-h-[68px] flex items-stretch">
          {!isFlipped ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsFlipped(true);
              }}
              disabled={!currentCard}
              className={`w-full h-full py-4 px-6 rounded-2xl font-bold text-base shadow-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border active:scale-[0.99] backdrop-blur-xl ${
                isLight
                  ? 'bg-white/85 hover:bg-white text-[#111113] border-white/95'
                  : 'bg-white/15 hover:bg-white/25 text-white border-white/20'
              }`}
              style={{
                transform: 'translate3d(0, 0, 0)',
                WebkitTransform: 'translate3d(0, 0, 0)',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
              }}
            >
              Mostrar Resposta (Espaço)
            </button>
          ) : (
            <div
              className="grid grid-cols-4 gap-2 w-full h-full"
              style={{
                transform: 'translate3d(0, 0, 0)',
                WebkitTransform: 'translate3d(0, 0, 0)',
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
              }}
            >
              {/* Rating 1: Again */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAnswer(1);
                }}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all cursor-pointer active:scale-95 border backdrop-blur-xl shadow-md ${
                  isLight
                    ? 'bg-red-50 hover:bg-red-100 text-red-950 border-red-300'
                    : 'bg-red-600/35 hover:bg-red-600/50 text-white border-red-500/40'
                }`}
              >
                <span className="text-[11px] font-extrabold text-red-700 dark:text-red-200 uppercase tracking-wider">Outra vez</span>
                <span className="text-sm font-black mt-0.5 text-current">
                  {predictions ? predictions[1].text : '< 10m'}
                </span>
                <span className="text-[10px] opacity-60 mt-0.5">1</span>
              </button>

              {/* Rating 2: Hard */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAnswer(2);
                }}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all cursor-pointer active:scale-95 border backdrop-blur-xl shadow-md ${
                  isLight
                    ? 'bg-amber-50 hover:bg-amber-100 text-amber-950 border-amber-300'
                    : 'bg-amber-600/35 hover:bg-amber-600/50 text-white border-amber-500/40'
                }`}
              >
                <span className="text-[11px] font-extrabold text-amber-700 dark:text-amber-200 uppercase tracking-wider">Difícil</span>
                <span className="text-sm font-black mt-0.5 text-current">
                  {predictions ? predictions[2].text : '1d'}
                </span>
                <span className="text-[10px] opacity-60 mt-0.5">2</span>
              </button>

              {/* Rating 3: Good */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAnswer(3);
                }}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all cursor-pointer active:scale-95 border backdrop-blur-xl shadow-md ring-1 ${
                  isLight
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border-emerald-400 ring-emerald-400/40'
                    : 'bg-emerald-600/35 hover:bg-emerald-600/50 text-white border-emerald-500/40 ring-emerald-400/30'
                }`}
              >
                <span className="text-[11px] font-extrabold text-emerald-700 dark:text-emerald-200 uppercase tracking-wider">Bom</span>
                <span className="text-sm font-black mt-0.5 text-current">
                  {predictions ? predictions[3].text : '3d'}
                </span>
                <span className="text-[10px] opacity-60 mt-0.5">Espaço / 3</span>
              </button>

              {/* Rating 4: Easy */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAnswer(4);
                }}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all cursor-pointer active:scale-95 border backdrop-blur-xl shadow-md ${
                  isLight
                    ? 'bg-blue-50 hover:bg-blue-100 text-blue-950 border-blue-300'
                    : 'bg-blue-600/35 hover:bg-blue-600/50 text-white border-blue-500/40'
                }`}
              >
                <span className="text-[11px] font-extrabold text-blue-700 dark:text-blue-200 uppercase tracking-wider">Fácil</span>
                <span className="text-sm font-black mt-0.5 text-current">
                  {predictions ? predictions[4].text : '5d'}
                </span>
                <span className="text-[10px] opacity-60 mt-0.5">4</span>
              </button>
            </div>
          )}
        </div>
      </footer>

      {/* Floating Hanzi Writing Canvas Overlay */}
      {showWritingPad && currentCard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setShowWritingPad(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md animate-in zoom-in-95 duration-200"
          >
            <HanziWritingCanvas
              hanzi={currentCard.hanzi}
              pinyin={currentCard.pinyin}
              meaning={currentCard.ptbr}
              theme={theme}
              onClose={() => setShowWritingPad(false)}
            />
          </div>
        </div>
      )}

      {/* Floating Audio Voice Settings Overlay */}
      {showVoiceSettingsModal && onUpdateDeckConfig && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setShowVoiceSettingsModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 sm:p-7 shadow-2xl border animate-in zoom-in-95 duration-200 ${
              isLight
                ? 'bg-white/95 border-white text-[#111113]'
                : 'bg-[#180a0c]/95 border-white/15 text-white'
            }`}
          >
            <AudioVoiceSettings
              deckConfig={deckConfig}
              onUpdateDeckConfig={onUpdateDeckConfig}
              theme={theme}
            />
            <div className="mt-6 pt-4 border-t border-black/10 dark:border-white/10 flex justify-end">
              <button
                type="button"
                onClick={() => setShowVoiceSettingsModal(false)}
                className="px-6 py-2.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs sm:text-sm cursor-pointer shadow-md transition-all active:scale-95"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
