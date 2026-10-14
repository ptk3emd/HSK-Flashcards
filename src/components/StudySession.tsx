import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from './useDialogFocus';
import { Card, DeckConfig, FSRSOptions, Rating, ReviewLog, StudyAction, StudyGesture } from '../types/card';
import { GESTURES, GRADE_ACTIONS, effectiveActionLabel, isActionAvailable } from '../lib/gestures';
import { MandarinCardView } from './MandarinCardView';
import { predictNextIntervals, scheduleCard } from '../lib/fsrs';
import { pushReviewLog, popReviewLog } from '../lib/storage';
import { speakChinese } from '../lib/speech';
import { ALL_HSK_LEVELS, loadNativeLevelCards } from '../data/defaultDecks';
import { ArrowLeft, Volume2, CheckCircle2, Moon, Sun, PenTool, Settings2, PauseCircle, Undo2, EllipsisVertical, Check } from 'lucide-react';
import { ViewLoading } from './ViewLoading';
import { usePrefetched } from './usePrefetched';
import { AudioVoiceSettings } from './AudioVoiceSettings';
import { StudyOptionsSettings } from './StudyOptionsSettings';
import '../styles/study-session.css';

// The writing pad carries hanzi-writer; it loads on its own and is fetched ahead once this view mounts
const loadWritingCanvas = () => import('./HanziWritingCanvas').then((m) => m.HanziWritingCanvas);
const HanziWritingCanvasLazy = lazy(() => loadWritingCanvas().then((c) => ({ default: c })));

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

/** Exit direction per grade (x, y): matches the swipe gestures' layout */
const GRADE_EXIT: Record<Rating, [number, number]> = { 1: [-1, 0], 2: [0, 1], 3: [1, 0], 4: [0, -1] };

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
  const [loadingLevel, setLoadingLevel] = useState<string | null>(null);
  const [levelLoadError, setLevelLoadError] = useState<string | null>(null);
  const levelRequestRef = useRef(0);
  useEffect(() => () => { levelRequestRef.current += 1; }, []);

  const isLight = theme === 'light';
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  );
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    const update = () => setReducedMotion(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  // Fetched as soon as this view mounts, so the pad opens instantly when asked for
  const HanziWritingCanvas = usePrefetched(loadWritingCanvas) ?? HanziWritingCanvasLazy;

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
  const navRef = useRef<HTMLElement>(null);
  const closeMenu = useCallback(() => {
    // Closing the menu also invalidates any pending level selection.
    levelRequestRef.current += 1;
    setLoadingLevel(null);
    setLevelLoadError(null);
    setIsMenuOpen(false);
  }, []);
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

  // The answered card leaves in the direction of its grade, the same directions the swipe
  // gestures use: Novamente left, Bom right, Fácil up, Difícil down. It starts from wherever
  // the card is (mid-swipe included), takes 180 ms, then the grade is applied and the next
  // card makes its entrance. Input is held during the exit so a grade cannot land twice.
  const cardWrapperRef = useRef<HTMLDivElement>(null);
  const exitingRef = useRef(false);
  const exitAnimationRef = useRef<Animation | null>(null);
  const [isGrading, setIsGrading] = useState(false);

  // Cancelling an exit (leaving the session or changing levels) must never record a grade.
  useEffect(() => {
    exitingRef.current = false;
    setIsGrading(false);
    return () => {
      const animation = exitAnimationRef.current;
      exitAnimationRef.current = null;
      animation?.cancel();
      exitingRef.current = false;
    };
  }, [currentCard?.id, isolatedLevel]);
  const gradeCard = useCallback(
    (rating: Rating) => {
      if (exitingRef.current || !currentCard) return;
      const el = cardWrapperRef.current;
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      if (!el || typeof el.animate !== 'function' || typeof DOMMatrixReadOnly === 'undefined' || reduceMotion) {
        // Keep the same duplicate-input guard even when no animation is played.
        exitingRef.current = true;
        handleAnswer(rating);
        window.queueMicrotask(() => { exitingRef.current = false; });
        return;
      }
      exitingRef.current = true;
      setIsGrading(true);
      const [dx, dy] = GRADE_EXIT[rating];
      const from = getComputedStyle(el).transform;
      // Travel outward from the release position, so a long swipe never jumps back.
      const matrix = new DOMMatrixReadOnly(from === 'none' ? undefined : from);
      const travelX = matrix.m41 + dx * Math.min(window.innerWidth * 0.45, 260);
      const travelY = matrix.m42 + dy * 130;
      const exit = el.animate(
        [
          { transform: from === 'none' ? 'translate3d(0, 0, 0)' : from, opacity: 1 },
          { transform: `translate3d(${travelX}px, ${travelY}px, 0) rotate(${dx * 9}deg) scale(0.97)`, opacity: 0 },
        ],
        { duration: 180, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
      );
      exitAnimationRef.current = exit;
      void exit.finished.then(() => {
        if (exitAnimationRef.current !== exit) return;
        exitAnimationRef.current = null;
        handleAnswer(rating);
        exit.cancel(); // Also release the transform if a same-card learning step stays due.
        exitingRef.current = false;
        setIsGrading(false);
      }).catch(() => {
        // Cancellation is a navigation event, never an answer.
      });
    },
    [handleAnswer, currentCard]
  );

  const handleUndo = useCallback(() => {
    if (exitingRef.current) return; // the grade leaving now has not been applied yet
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
    if (!currentCard || exitingRef.current) return;
    const suspended: Card = { ...currentCard, suspended: true };
    const nextCards = sessionCards.map(c => (c.id === currentCard.id ? suspended : c));
    setSessionCards(nextCards);
    onUpdateCards(nextCards);
  }, [currentCard, sessionCards, onUpdateCards]);

  // Gestures on the card. Each one runs the action chosen in the settings; by default
  // double tap shows the answer, swipe right answers Bom and swipe left Novamente.
  const SWIPE_PX = 70;
  const TAP_SLOP_PX = 10;
  const DOUBLE_TAP_MS = 320;
  const LONG_PRESS_MS = 500;
  const gestureMap = deckConfig.gestures;
  const gestureCtx = { isFlipped, twoButtonGrading: deckConfig.twoButtonGrading, canUndo };
  const gestureRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const lastTapRef = useRef(0);
  const tapTimerRef = useRef<number | undefined>(undefined);
  const longPressTimerRef = useRef<number | undefined>(undefined);
  const longPressFiredRef = useRef(false);
  type Drag = { x: number; y: number; gesture: StudyGesture };
  const [drag, setDrag] = useState<Drag | null>(null);
  const pendingDragRef = useRef<Drag | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  // Pointer events can arrive faster than a display refresh. Paint at most once per frame.
  const queueDrag = (next: Drag | null) => {
    pendingDragRef.current = next;
    if (dragFrameRef.current !== null) return;
    dragFrameRef.current = window.requestAnimationFrame(() => {
      dragFrameRef.current = null;
      setDrag(pendingDragRef.current);
    });
  };

  // A touch that ends a gesture is followed by the browser's synthetic click. When the
  // gesture opens the menu or the writing pad, that click would land on the new backdrop
  // and close it again, so it is swallowed. Only for a click that follows right away.
  const swallowGhostClick = () => {
    const until = performance.now() + 500;
    const handler = (ev: MouseEvent) => {
      window.removeEventListener('click', handler, true);
      if (performance.now() < until) {
        ev.stopPropagation();
        ev.preventDefault();
      }
    };
    window.addEventListener('click', handler, true);
    window.setTimeout(() => window.removeEventListener('click', handler, true), 500);
  };

  const runGestureAction = (action: StudyAction, fromPointer = true) => {
    if (!currentCard || exitingRef.current || !isActionAvailable(action, gestureCtx)) return;
    if (fromPointer && (action === 'menu' || action === 'writing')) swallowGhostClick();
    switch (action) {
      case 'reveal':
        setIsFlipped(true);
        break;
      case 'revealOrGood':
        if (isFlipped) gradeCard(3);
        else setIsFlipped(true);
        break;
      case 'again':
        gradeCard(1);
        break;
      case 'hard':
        gradeCard(2);
        break;
      case 'good':
        gradeCard(3);
        break;
      case 'easy':
        gradeCard(4);
        break;
      case 'undo':
        handleUndo();
        break;
      case 'speak':
        handleSpeak();
        break;
      case 'writing':
        setShowWritingPad(true);
        break;
      case 'suspend':
        handleSuspendCurrent();
        break;
      case 'menu':
        setIsMenuOpen(true);
        break;
    }
  };
  // Timers fire after later renders, so they call the latest version (current card, side)
  const runGestureActionRef = useRef(runGestureAction);
  runGestureActionRef.current = runGestureAction;

  useEffect(
    () => () => {
      window.clearTimeout(tapTimerRef.current);
      window.clearTimeout(longPressTimerRef.current);
      if (dragFrameRef.current !== null) window.cancelAnimationFrame(dragFrameRef.current);
    },
    []
  );
  // Pending taps and drags belong to the card on which they started.
  useEffect(() => {
    window.clearTimeout(tapTimerRef.current);
    window.clearTimeout(longPressTimerRef.current);
    if (dragFrameRef.current !== null) window.cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = null;
    pendingDragRef.current = null;
    gestureRef.current = null;
    setDrag(null);
    lastTapRef.current = 0;
  }, [currentCard?.id]);

  const swipeGestureFor = (dx: number, dy: number): StudyGesture =>
    Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'swipeRight' : 'swipeLeft') : dy > 0 ? 'swipeDown' : 'swipeUp';

  const resetDrag = () => {
    gestureRef.current = null;
    window.clearTimeout(longPressTimerRef.current);
    if (dragFrameRef.current !== null) window.cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = null;
    pendingDragRef.current = null;
    setDrag(null);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!currentCard || gestureRef.current || exitingRef.current) return; // a second finger never takes over the first
    if ((e.target as HTMLElement).closest('button')) return; // card buttons keep their own taps
    gestureRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    longPressFiredRef.current = false;
    const longPressAction = gestureMap.longPress;
    if (isActionAvailable(longPressAction, gestureCtx)) {
      longPressTimerRef.current = window.setTimeout(() => {
        if (!gestureRef.current) return;
        longPressFiredRef.current = true;
        navigator.vibrate?.(15);
        // The finger is still down; its click is swallowed on release instead
        runGestureActionRef.current(longPressAction, false);
      }, LONG_PRESS_MS);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) <= TAP_SLOP_PX) return;
    window.clearTimeout(longPressTimerRef.current); // moving is not a long press
    if (longPressFiredRef.current) return;
    const gesture = swipeGestureFor(dx, dy);
    // The card only follows the finger toward a gesture that does something here
    if (!isActionAvailable(gestureMap[gesture], gestureCtx)) {
      queueDrag(null);
      return;
    }
    const horizontal = gesture === 'swipeLeft' || gesture === 'swipeRight';
    queueDrag({ x: horizontal ? dx : 0, y: horizontal ? 0 : dy, gesture });
  };

  const handleTap = () => {
    const now = performance.now();
    const doubleTapActive = isActionAvailable(gestureMap.doubleTap, gestureCtx);
    if (doubleTapActive && now - lastTapRef.current < DOUBLE_TAP_MS) {
      lastTapRef.current = 0;
      window.clearTimeout(tapTimerRef.current);
      runGestureAction(gestureMap.doubleTap);
      return;
    }
    lastTapRef.current = now;
    const tapAction = gestureMap.tap;
    if (tapAction === 'none') return;
    if (!doubleTapActive) {
      runGestureAction(tapAction);
      return;
    }
    // Wait to see whether a second tap makes this a double tap
    window.clearTimeout(tapTimerRef.current);
    // By the time it fires, the tap's own click has already happened
    tapTimerRef.current = window.setTimeout(() => runGestureActionRef.current(tapAction, false), DOUBLE_TAP_MS);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    const longPressFired = longPressFiredRef.current;
    resetDrag();
    if (longPressFired) {
      lastTapRef.current = 0;
      if (gestureMap.longPress === 'menu' || gestureMap.longPress === 'writing') swallowGhostClick();
      return;
    }

    const major = Math.max(Math.abs(dx), Math.abs(dy));
    const minor = Math.min(Math.abs(dx), Math.abs(dy));
    if (major >= SWIPE_PX && major > minor * 1.5) {
      lastTapRef.current = 0;
      runGestureAction(gestureMap[swipeGestureFor(dx, dy)]);
      return;
    }
    if (major < TAP_SLOP_PX) handleTap();
  };

  // Cancelled or interrupted gestures (system scroll, lost capture) never leave the card offset
  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (gestureRef.current?.id === e.pointerId) resetDrag();
  };

  // Bar buttons pressed with a finger or mouse do not keep focus. Otherwise the next
  // Space or Enter would press that button again (undo twice, reopen the menu)
  // instead of revealing or grading the card. Keyboard focus is unaffected.
  const keepCardFocus = (e: React.MouseEvent) => e.preventDefault();

  const dragAction = drag ? gestureMap[drag.gesture] : null;
  const dragLabel =
    drag && dragAction && Math.abs(drag.x) + Math.abs(drag.y) > 30 ? effectiveActionLabel(dragAction, isFlipped) : null;
  const dragTone =
    dragAction === 'again'
      ? 'bg-red-600 text-white'
      : dragAction === 'good' || (dragAction === 'revealOrGood' && isFlipped)
      ? 'bg-emerald-700 text-white'
      : dragAction === 'hard'
      ? 'bg-amber-700 text-white'
      : dragAction === 'easy'
      ? 'bg-blue-600 text-white'
      : isLight
      ? 'bg-black/80 text-white'
      : 'bg-white/90 text-black';
  const dragDistance = drag ? Math.abs(drag.x) + Math.abs(drag.y) : 0;
  // Vertical swipes need the page to stop scrolling under the finger
  const usesVerticalSwipes = gestureMap.swipeUp !== 'none' || gestureMap.swipeDown !== 'none';

  // Gesture hint for answering without buttons: what reveals on the front, what grades on the back
  const gestureHints = GESTURES.filter(({ id }) => {
    const action = gestureMap[id];
    if (!isActionAvailable(action, gestureCtx)) return false;
    return isFlipped ? GRADE_ACTIONS.includes(action) || action === 'revealOrGood' : action === 'reveal' || action === 'revealOrGood';
  }).map(({ id, label }) => `${label}: ${effectiveActionLabel(gestureMap[id], isFlipped)}`);

  // Keep the current queue intact until the requested level is ready.
  const handleSwitchLevel = async (lvl: string | null) => {
    if (exitingRef.current || loadingLevel !== null) return;
    setLevelLoadError(null);
    const selectLevel = () => {
      resetDrag();
      setReviewedInSession(0);
      onSelectIsolatedLevel(lvl);
      closeMenu();
    };
    if (!lvl || sessionCards.some(c => c.level === lvl)) {
      selectLevel();
      return;
    }

    const request = ++levelRequestRef.current;
    setLoadingLevel(lvl);
    try {
      const nativeCards = await loadNativeLevelCards(lvl);
      if (request !== levelRequestRef.current) return;
      onAddCards(nativeCards);
      selectLevel();
    } catch {
      if (request === levelRequestRef.current) {
        setLevelLoadError(lvl);
      }
    } finally {
      if (request === levelRequestRef.current) setLoadingLevel(null);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (exitingRef.current) return; // a grade is on its way out
      // W closes the writing pad. Checked first: the pad moves focus to its own buttons.
      if (showWritingPad && (e.key === 'w' || e.key === 'W')) {
        setShowWritingPad(false);
        return;
      }
      // Focused controls keep their native keyboard behaviour (Enter/Space activate them)
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes((e.target as HTMLElement).tagName)) return;
      // While a dialog is open, its keys belong to the dialog, not to the card underneath
      if (showWritingPad || showVoiceSettingsModal || isMenuOpen) return;

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (!isFlipped) {
          setIsFlipped(true);
        } else {
          gradeCard(3); // Good
        }
      } else if (e.key === '1' && isFlipped) {
        gradeCard(1);
      } else if (e.key === '2' && isFlipped && !deckConfig.twoButtonGrading) {
        gradeCard(2);
      } else if (e.key === '3' && isFlipped) {
        gradeCard(3);
      } else if (e.key === '4' && isFlipped && !deckConfig.twoButtonGrading) {
        gradeCard(4);
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
  }, [isFlipped, gradeCard, handleUndo, handleSpeak, showWritingPad, showVoiceSettingsModal, isMenuOpen, deckConfig.twoButtonGrading]);

  return (
    <main
      data-grading={deckConfig.twoButtonGrading ? 'two' : 'four'}
      data-answer-buttons={deckConfig.hideAnswerButtons ? 'hidden' : 'visible'}
      className={`card study-session ${
        isLight ? 'card-theme-light' : 'night_mode card-theme-dark'
      } flex flex-col justify-between select-none relative min-h-screen w-full transition-colors duration-300 overflow-x-hidden`}
    >
      <h1 className="sr-only">Sessão de estudo</h1>
      <div className="study-session-status" aria-live="polite" aria-atomic="true">
        <span>{isolatedLevel ?? 'Todos os ativos'}</span>
        <span className="tabular-nums">{reviewedInSession} {reviewedInSession === 1 ? 'revisado' : 'revisados'} · {remainingCount} {remainingCount === 1 ? 'restante' : 'restantes'}</span>
      </div>

      {/* Session progress stays visually subordinate to the card. */}
      <div
        className={`fixed top-0 inset-x-0 z-40 h-1 ${isLight ? 'bg-black/5' : 'bg-white/5'}`}
        role="progressbar"
        aria-label="Progresso da sessão"
        aria-valuenow={progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="study-progress-fill h-full bg-red-600"
          style={{ transform: `scaleX(${progressPercent / 100})` }}
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
          touchAction: usesVerticalSwipes ? 'none' : 'pan-y',
          WebkitTouchCallout: 'none',
        }}
        onContextMenu={gestureMap.longPress !== 'none' ? (e) => e.preventDefault() : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onLostPointerCapture={handlePointerCancel}
      >
        {dragLabel && (
          <div
            aria-hidden="true"
            className={`study-gesture-cue absolute top-2 left-1/2 -translate-x-1/2 z-10 px-4 py-2 rounded-full text-sm font-bold ${dragTone}`}
            style={{ opacity: Math.min(1, (dragDistance - 30) / 35) }}
          >
            {dragLabel}
          </div>
        )}
        {currentCard ? (
          <div
            key={currentCard.id}
            ref={cardWrapperRef}
            className="study-tactile-card w-full"
            data-dragging={drag ? 'true' : undefined}
            aria-busy={isGrading}
            style={{
              // Resistance bounds travel but the gesture's raw distance still decides its action.
              transform: reducedMotion ? undefined : `translate3d(${160 * Math.tanh((drag?.x ?? 0) / 180)}px, ${100 * Math.tanh((drag?.y ?? 0) / 140)}px, 0) rotate(${Math.max(-7, Math.min(7, (drag?.x ?? 0) / 35))}deg)`,
              transition: reducedMotion || drag ? 'none' : 'transform 0.42s cubic-bezier(0.16, 1, 0.3, 1)',
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
                    className="min-h-11 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition-all cursor-pointer shadow-md"
                  >
                    Estudar Todos os Níveis
                  </button>
                )}
                <button
                  type="button"
                  onClick={onExit}
                  className={`min-h-11 px-5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer shadow-md ${
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
      {currentCard && <footer className="study-answer-footer w-full max-w-2xl mx-auto px-4 py-4 flex flex-col items-center gap-3 z-20">
        {/* Action Controls with fixed min-height to guarantee zero layout flicker */}
        <div className="w-full min-h-[68px] flex items-stretch">
          {deckConfig.hideAnswerButtons ? (
            <p className="study-gesture-hint w-full flex items-center justify-center gap-2 text-sm">
              {gestureHints.length === 0
                ? isFlipped
                  ? 'Nenhum gesto avalia o cartão. Ajuste os gestos nas configurações.'
                  : 'Nenhum gesto mostra a resposta. Ajuste os gestos nas configurações.'
                : reviewedInSession > 0
                ? null
                : gestureHints.join(' · ')}
            </p>
          ) : !isFlipped ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!exitingRef.current) setIsFlipped(true);
              }}
              disabled={!currentCard || isGrading}
              className={`study-reveal w-full h-full py-4 px-6 rounded-2xl font-bold text-base shadow-xl transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border active:scale-[0.99] backdrop-blur-xl ${
                isLight
                  ? 'bg-white/85 hover:bg-white text-ink border-white/95'
                  : 'bg-white/15 hover:bg-white/25 text-white border-white/20'
              }`}
            >
              <span>Mostrar Resposta</span>
              <kbd className="study-shortcut">Espaço</kbd>
            </button>
          ) : (
            <div
              className={`study-grades grid ${deckConfig.twoButtonGrading ? 'grid-cols-2' : 'grid-cols-4'} gap-2 w-full h-full`}
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
                  gradeCard(1);
                }}
                disabled={isGrading}
                data-grade="1"
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all cursor-pointer active:scale-95 border backdrop-blur-xl shadow-md ${
                  isLight
                    ? 'bg-red-50 hover:bg-red-100 text-red-950 border-red-300'
                    : 'bg-red-600/35 hover:bg-red-600/50 text-white border-red-500/40'
                }`}
              >
                <span className="study-grade-label">Novamente</span>
                <span className="study-grade-interval">
                  {predictions ? predictions[1].text : '< 10m'}
                </span>
                <kbd className="study-shortcut">1</kbd>
              </button>

              {/* Rating 2: Hard */}
              {!deckConfig.twoButtonGrading && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  gradeCard(2);
                }}
                disabled={isGrading}
                data-grade="2"
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all cursor-pointer active:scale-95 border backdrop-blur-xl shadow-md ${
                  isLight
                    ? 'bg-amber-50 hover:bg-amber-100 text-amber-950 border-amber-300'
                    : 'bg-amber-600/35 hover:bg-amber-600/50 text-white border-amber-500/40'
                }`}
              >
                <span className="study-grade-label">Difícil</span>
                <span className="study-grade-interval">
                  {predictions ? predictions[2].text : '1d'}
                </span>
                <kbd className="study-shortcut">2</kbd>
              </button>
              )}

              {/* Rating 3: Good */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  gradeCard(3);
                }}
                disabled={isGrading}
                data-grade="3"
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all cursor-pointer active:scale-95 border backdrop-blur-xl shadow-md ring-1 ${
                  isLight
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-950 border-emerald-400 ring-emerald-400/40'
                    : 'bg-emerald-600/35 hover:bg-emerald-600/50 text-white border-emerald-500/40 ring-emerald-400/30'
                }`}
              >
                <span className="study-grade-label">Bom</span>
                <span className="study-grade-interval">
                  {predictions ? predictions[3].text : '3d'}
                </span>
                <kbd className="study-shortcut">Espaço / 3</kbd>
              </button>

              {/* Rating 4: Easy */}
              {!deckConfig.twoButtonGrading && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  gradeCard(4);
                }}
                disabled={isGrading}
                data-grade="4"
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all cursor-pointer active:scale-95 border backdrop-blur-xl shadow-md ${
                  isLight
                    ? 'bg-blue-50 hover:bg-blue-100 text-blue-950 border-blue-300'
                    : 'bg-blue-600/35 hover:bg-blue-600/50 text-white border-blue-500/40'
                }`}
              >
                <span className="study-grade-label">Fácil</span>
                <span className="study-grade-interval">
                  {predictions ? predictions[4].text : '5d'}
                </span>
                <kbd className="study-shortcut">4</kbd>
              </button>
              )}
            </div>
          )}
        </div>
      </footer>}

      {/* Bottom bar: back, queue counts, undo and the session menu */}
      <nav
        ref={navRef}
        aria-label="Sessão"
        className="sheet relative z-30 w-full !rounded-none border-t border-[var(--separator)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="max-w-2xl mx-auto px-2 h-16 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onExit}
              onMouseDown={keepCardFocus}
              aria-label="Voltar aos Decks"
              className={`size-11 flex items-center justify-center rounded-full transition-colors cursor-pointer ${
                isLight ? 'hover:bg-black/5' : 'hover:bg-white/10'
              }`}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 px-2 text-base font-semibold tabular-nums" role="group" aria-label="Fila de cartões">
              <span className={`text-blue-900 dark:text-blue-400 ${currentCard?.state === 0 ? 'underline underline-offset-4' : ''}`} title="Novos">{newCount}<span className="sr-only"> novos</span></span>
              <span className={`text-red-900 dark:text-red-400 ${currentCard && (currentCard.state === 1 || currentCard.state === 3) ? 'underline underline-offset-4' : ''}`} title="Aprendendo">{learningCount}<span className="sr-only"> aprendendo</span></span>
              <span className={`text-emerald-900 dark:text-emerald-400 ${currentCard?.state === 2 ? 'underline underline-offset-4' : ''}`} title="Revisão">{reviewCount}<span className="sr-only"> para revisão</span></span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleUndo}
              onMouseDown={keepCardFocus}
              disabled={!canUndo || isGrading}
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
              onMouseDown={keepCardFocus}
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

        {/* Portalled to the body: inside the glass bar, the menu could not blur the card behind it */}
        {isMenuOpen && createPortal(
          <div className={isLight ? 'card-theme-light text-ink' : 'night_mode card-theme-dark text-white'}>
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
              style={{ bottom: navRef.current ? window.innerHeight - navRef.current.getBoundingClientRect().top + 8 : 72 }}
              className="study-session-menu sheet sheet-menu animate-in fade-in zoom-in-95 duration-150 origin-bottom-right fixed right-2 z-50 w-64 max-h-[70vh] overflow-y-auto !rounded-2xl p-1.5"
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
                    {hint && <span className="text-xs opacity-80">{hint}</span>}
                  </button>
                ))}

              <div className={`my-1.5 border-t ${isLight ? 'border-black/5' : 'border-white/10'}`} />
              <div className="px-3 py-1 text-xs font-semibold">Nível</div>
              {loadingLevel && (
                <p role="status" className="px-3 py-2 text-sm">Carregando {loadingLevel}…</p>
              )}
              {levelLoadError && (
                <p role="alert" className="px-3 py-2 text-sm">Não foi possível carregar <span className="whitespace-nowrap">{levelLoadError}</span>. Tente novamente.</p>
              )}
              {[null, ...ALL_HSK_LEVELS].map((lvl) => {
                const isSelected = isolatedLevel === lvl;
                return (
                  <button
                    key={lvl ?? 'all'}
                    type="button"
                    onClick={() => handleSwitchLevel(lvl)}
                    disabled={loadingLevel !== null}
                    aria-pressed={isSelected}
                    className={`w-full min-h-11 disabled:opacity-50 disabled:cursor-wait flex items-center justify-between px-3 rounded-xl text-sm transition-colors cursor-pointer ${
                      isLight ? 'hover:bg-black/5' : 'hover:bg-white/10'
                    }`}
                  >
                    <span>{lvl ?? 'Todos os ativos'}</span>
                    {isSelected && <Check className="w-4 h-4 text-red-500" />}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
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
            <Suspense fallback={<ViewLoading variant="pad" />}>
              <HanziWritingCanvas
                hanzi={currentCard.hanzi}
                pinyin={currentCard.pinyin}
                meaning={currentCard.ptbr}
                theme={theme}
                onClose={() => setShowWritingPad(false)}
              />
            </Suspense>
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
            className="sheet w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 sm:p-7 animate-in zoom-in-95 duration-200"
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
