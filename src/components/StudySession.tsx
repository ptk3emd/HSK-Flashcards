import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDialogFocus } from './useDialogFocus';
import { Card, DeckConfig, FSRSOptions, Rating, ReviewLog } from '../types/card';
import { MandarinCardView } from './MandarinCardView';
import { isLeech, predictNextIntervals, scheduleCard } from '../lib/fsrs';
import { pushReviewLog, popReviewLog } from '../lib/storage';
import { speakChinese } from '../lib/speech';
import { ALL_HSK_LEVELS, loadNativeLevelCards } from '../data/defaultDecks';
import { ArrowLeft, Volume2, CheckCircle2, Moon, Sun, PenTool, Settings2, PauseCircle, ArrowRight, Undo2, EllipsisVertical, Check } from 'lucide-react';
import { HanziWritingCanvas } from './HanziWritingCanvas';
import { AudioVoiceSettings } from './AudioVoiceSettings';
import { StudyOptionsSettings } from './StudyOptionsSettings';

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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
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
  // Suspended cards stay out of every queue and count until reactivated in the browser
  const activeLevelCards = useMemo(() => {
    const unsuspended = sessionCards.filter(c => !c.suspended);
    if (isolatedLevel) {
      return unsuspended.filter(c => c.level === isolatedLevel);
    }
    return unsuspended.filter(c => deckConfig.activeLevels.includes(c.level));
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

  // Dialogs keep focus inside while open, close on Escape and return focus to their trigger
  const writingDialogRef = useRef<HTMLDivElement>(null);
  const voiceDialogRef = useRef<HTMLDivElement>(null);
  const closeWritingPad = useCallback(() => setShowWritingPad(false), []);
  const closeVoiceSettings = useCallback(() => setShowVoiceSettingsModal(false), []);
  useDialogFocus(writingDialogRef, showWritingPad && currentCard !== null, closeWritingPad);
  useDialogFocus(voiceDialogRef, showVoiceSettingsModal && !!onUpdateDeckConfig, closeVoiceSettings);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);
  useDialogFocus(menuRef, isMenuOpen, closeMenu);

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

  const handleSuspendCurrent = useCallback(() => {
    if (!currentCard) return;
    const suspended: Card = { ...currentCard, suspended: true };
    const nextCards = sessionCards.map(c => (c.id === currentCard.id ? suspended : c));
    setSessionCards(nextCards);
    onUpdateCards(nextCards);
  }, [currentCard, sessionCards, onUpdateCards]);

  // Gestures on the card: double tap shows the answer; with the answer shown,
  // swipe right answers "Bom" and swipe left answers "Novamente".
  const SWIPE_PX = 70;
  const TAP_SLOP_PX = 10;
  const DOUBLE_TAP_MS = 320;
  const gestureRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const lastTapRef = useRef(0);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const resetDrag = () => {
    gestureRef.current = null;
    setIsDragging(false);
    setDragX(0);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!currentCard || gestureRef.current) return; // a second finger never takes over the first
    if ((e.target as HTMLElement).closest('button')) return; // card buttons keep their own taps
    gestureRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || g.id !== e.pointerId || !isFlipped) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (Math.abs(dx) > TAP_SLOP_PX && Math.abs(dx) > Math.abs(dy)) {
      setIsDragging(true);
      setDragX(dx);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    resetDrag();

    if (isFlipped && Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
      lastTapRef.current = 0;
      handleAnswer(dx > 0 ? 3 : 1);
      return;
    }
    if (Math.abs(dx) < TAP_SLOP_PX && Math.abs(dy) < TAP_SLOP_PX) {
      const now = performance.now();
      if (now - lastTapRef.current < DOUBLE_TAP_MS) {
        lastTapRef.current = 0;
        if (!isFlipped) setIsFlipped(true);
      } else {
        lastTapRef.current = now;
      }
    }
  };

  // Cancelled or interrupted gestures (system scroll, lost capture) never leave the card offset
  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (gestureRef.current?.id === e.pointerId) resetDrag();
  };

  const swipeHint = isDragging && Math.abs(dragX) > 30 ? (dragX > 0 ? 'Bom' : 'Novamente') : null;

  // Handle switching level right inside study session
  const handleSwitchLevel = async (lvl: string | null) => {
    setIsMenuOpen(false);
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
      // Focused controls keep their native keyboard behaviour (Enter/Space activate them)
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes((e.target as HTMLElement).tagName)) return;
      // While a dialog is open, its keys belong to the dialog, not to the card underneath.
      // W still closes the writing pad, as it toggled it before.
      if (showWritingPad && (e.key === 'w' || e.key === 'W')) {
        setShowWritingPad(false);
        return;
      }
      if (showWritingPad || showVoiceSettingsModal || isMenuOpen) return;

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (!isFlipped) {
          setIsFlipped(true);
        } else {
          handleAnswer(3); // Good
        }
      } else if (e.key === '1' && isFlipped) {
        handleAnswer(1);
      } else if (e.key === '2' && isFlipped && !deckConfig.twoButtonGrading) {
        handleAnswer(2);
      } else if (e.key === '3' && isFlipped) {
        handleAnswer(3);
      } else if (e.key === '4' && isFlipped && !deckConfig.twoButtonGrading) {
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
  }, [isFlipped, handleAnswer, handleUndo, handleSpeak, showWritingPad, showVoiceSettingsModal, isMenuOpen, deckConfig.twoButtonGrading]);

  return (
    <main
      className={`card ${
        isLight ? 'card-theme-light' : 'night_mode card-theme-dark'
      } flex flex-col justify-between select-none relative min-h-screen w-full transition-colors duration-300 overflow-x-hidden`}
    >
      <h1 className="sr-only">Sessão de estudo</h1>

      {/* Session progress: a hairline, no text */}
      <div
        className={`fixed top-0 inset-x-0 z-40 h-0.5 ${isLight ? 'bg-black/5' : 'bg-white/5'}`}
        role="progressbar"
        aria-label="Progresso da sessão"
        aria-valuenow={progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-red-600/80 transition-[width] duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Main Flashcard Scene (Zero vertical shifting on answer reveal) */}
      <div
        className="study-card-container relative w-full flex-1 flex flex-col items-center justify-center my-auto py-4"
        style={{
          perspective: '1000px',
          WebkitPerspective: '1000px',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          touchAction: 'pan-y',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={handlePointerCancel}
      >
        {swipeHint && (
          <div
            aria-hidden="true"
            className={`absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
              swipeHint === 'Bom'
                ? 'bg-emerald-600 text-white'
                : 'bg-red-600 text-white'
            }`}
            style={{ opacity: Math.min(1, (Math.abs(dragX) - 30) / 60) }}
          >
            {swipeHint}
          </div>
        )}
        {currentCard ? (
          <div
            className="w-full"
            style={{
              transform: `translate3d(${dragX}px, 0, 0) rotate(${dragX / 40}deg)`,
              transition: isDragging ? 'none' : 'transform 0.36s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <MandarinCardView
              card={currentCard}
              isFlipped={isFlipped}
            />
          </div>
        ) : (
          <div className="mandarin-scene">
            <div
              className={`mandarin-card text-center py-12 px-6 flex flex-col items-center gap-4 ${
                isLight ? 'bg-white/85 text-ink' : ''
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
      </div>

      {/* Bottom Bar — Anki style with fixed layout height to prevent vertical jitter */}
      <footer className="w-full max-w-2xl mx-auto px-4 py-4 flex flex-col items-center gap-3 z-20">
        {/* Action Controls with fixed min-height to guarantee zero layout flicker */}
        <div className="w-full min-h-[68px] flex items-stretch">
          {deckConfig.hideAnswerButtons ? (
            <p className={`w-full flex items-center justify-center gap-2 text-xs ${isLight ? 'text-black/60' : 'text-white/60'}`}>
              {!currentCard || reviewedInSession > 0 ? null : !isFlipped ? (
                'Toque duas vezes para ver a resposta'
              ) : (
                <>
                  <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Novamente</span>
                  <span className="opacity-40" aria-hidden="true">|</span>
                  <span>Bom</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </>
              )}
            </p>
          ) : !isFlipped ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsFlipped(true);
              }}
              disabled={!currentCard}
              className={`w-full h-full py-4 px-6 rounded-2xl font-bold text-base shadow-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border active:scale-[0.99] backdrop-blur-xl ${
                isLight
                  ? 'bg-white/85 hover:bg-white text-ink border-white/95'
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
              className={`grid ${deckConfig.twoButtonGrading ? 'grid-cols-2' : 'grid-cols-4'} gap-2 w-full h-full`}
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
                <span className="text-[11px] font-extrabold text-red-700 dark:text-red-200 uppercase tracking-wider">Novamente</span>
                <span className="text-sm font-black mt-0.5 text-current">
                  {predictions ? predictions[1].text : '< 10m'}
                </span>
                <span className="text-[10px] opacity-60 mt-0.5">1</span>
              </button>

              {/* Rating 2: Hard */}
              {!deckConfig.twoButtonGrading && (
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
              )}

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
              {!deckConfig.twoButtonGrading && (
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
              )}
            </div>
          )}
        </div>
      </footer>

      {/* Bottom bar: back, queue counts, undo and the session menu */}
      <nav
        aria-label="Sessão"
        className={`relative z-30 w-full border-t ${
          isLight ? 'bg-white/90 border-black/5 text-ink' : 'bg-black/85 border-white/5 text-white'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-2xl mx-auto px-2 h-16 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onExit}
              aria-label="Voltar aos Decks"
              className={`size-11 flex items-center justify-center rounded-full transition-colors cursor-pointer ${
                isLight ? 'hover:bg-black/5' : 'hover:bg-white/10'
              }`}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 px-2 text-base font-semibold tabular-nums" aria-label="Novos, aprendendo e revisão">
              <span className={`text-blue-600 dark:text-blue-400 ${currentCard?.state === 0 ? 'underline underline-offset-4' : ''}`} title="Novos">{newCount}</span>
              <span className={`text-red-600 dark:text-red-400 ${currentCard && (currentCard.state === 1 || currentCard.state === 3) ? 'underline underline-offset-4' : ''}`} title="Aprendendo">{learningCount}</span>
              <span className={`text-emerald-600 dark:text-emerald-400 ${currentCard?.state === 2 ? 'underline underline-offset-4' : ''}`} title="Revisão">{reviewCount}</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleUndo}
              disabled={!canUndo}
              aria-label="Desfazer última revisão"
              title="Desfazer (Ctrl+Z)"
              className={`size-11 flex items-center justify-center rounded-full transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default ${
                isLight ? 'hover:bg-black/5' : 'hover:bg-white/10'
              }`}
            >
              <Undo2 className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              aria-label="Mais opções"
              aria-expanded={isMenuOpen}
              className={`size-11 flex items-center justify-center rounded-full transition-colors cursor-pointer ${
                isLight ? 'hover:bg-black/5' : 'hover:bg-white/10'
              }`}
            >
              <EllipsisVertical className="w-5 h-5" />
            </button>
          </div>
        </div>

        {isMenuOpen && (
          <>
            <button
              type="button"
              aria-label="Fechar menu"
              tabIndex={-1}
              className="fixed inset-0 z-40 cursor-default"
              onClick={closeMenu}
            />
            <div
              ref={menuRef}
              role="dialog"
              aria-modal="true"
              aria-label="Mais opções"
              className={`absolute right-2 bottom-full mb-2 z-50 w-64 max-h-[70vh] overflow-y-auto rounded-2xl p-1.5 shadow-2xl border ${
                isLight ? 'bg-white border-black/10 text-ink' : 'bg-neutral-900 border-white/10 text-white'
              }`}
            >
              {[
                { icon: PenTool, label: 'Praticar escrita', hint: 'W', onClick: () => setShowWritingPad(true), show: !!currentCard },
                { icon: Volume2, label: 'Ouvir pronúncia', hint: 'R', onClick: handleSpeak, show: !!currentCard },
                { icon: PauseCircle, label: 'Suspender cartão', hint: '', onClick: handleSuspendCurrent, show: !!currentCard },
                { icon: Settings2, label: 'Configurações da sessão', hint: '', onClick: () => setShowVoiceSettingsModal(true), show: !!onUpdateDeckConfig },
                { icon: isLight ? Moon : Sun, label: isLight ? 'Tema escuro' : 'Tema claro', hint: '', onClick: onToggleTheme, show: true },
              ]
                .filter((item) => item.show)
                .map(({ icon: Icon, label, hint, onClick }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      closeMenu();
                      onClick();
                    }}
                    className={`w-full min-h-11 flex items-center gap-3 px-3 rounded-xl text-sm transition-colors cursor-pointer ${
                      isLight ? 'hover:bg-black/5' : 'hover:bg-white/10'
                    }`}
                  >
                    <Icon className="w-4 h-4 opacity-70" />
                    <span className="flex-1 text-left">{label}</span>
                    {hint && <span className="text-xs opacity-40">{hint}</span>}
                  </button>
                ))}

              <div className={`my-1.5 border-t ${isLight ? 'border-black/5' : 'border-white/10'}`} />
              <div className="px-3 py-1 text-xs font-semibold opacity-50">Nível</div>
              {[null, ...ALL_HSK_LEVELS].map((lvl) => {
                const isSelected = isolatedLevel === lvl;
                return (
                  <button
                    key={lvl ?? 'all'}
                    type="button"
                    onClick={() => handleSwitchLevel(lvl)}
                    className={`w-full min-h-10 flex items-center justify-between px-3 rounded-xl text-sm transition-colors cursor-pointer ${
                      isLight ? 'hover:bg-black/5' : 'hover:bg-white/10'
                    }`}
                  >
                    <span>{lvl ?? 'Todos os ativos'}</span>
                    {isSelected && <Check className="w-4 h-4 text-red-500" />}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </nav>

      {/* Floating Hanzi Writing Canvas Overlay */}
      {showWritingPad && currentCard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setShowWritingPad(false)}
        >
          <div
            ref={writingDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Praticar escrita do Hanzi"
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
            ref={voiceDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Configurações da sessão"
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 sm:p-7 shadow-2xl border animate-in zoom-in-95 duration-200 ${
              isLight
                ? 'bg-white/95 border-white text-ink'
                : 'bg-night-panel/95 border-white/15 text-white'
            }`}
          >
            <AudioVoiceSettings
              deckConfig={deckConfig}
              onUpdateDeckConfig={onUpdateDeckConfig}
              theme={theme}
            />
            <div className={`mt-6 pt-5 border-t space-y-4 ${isLight ? 'border-black/10' : 'border-white/10'}`}>
              <h2 className="text-sm font-bold">Sessão de estudo</h2>
              <StudyOptionsSettings
                deckConfig={deckConfig}
                onUpdateDeckConfig={onUpdateDeckConfig}
                theme={theme}
              />
            </div>
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
    </main>
  );
};
