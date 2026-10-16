import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, EllipsisVertical, Moon, PauseCircle, PenTool, Settings2, Sun, Undo2, Volume2 } from 'lucide-react';
import { Card, Rating } from '../types/card';
import { ALL_HSK_LEVELS } from '../data/defaultDecks';
import { useDialogFocus } from './useDialogFocus';
import { InlineLoadingSkeleton } from './ViewLoading';

/** Most steps the ladder draws; longer sessions group several cards per step */
const LADDER_MAX_STEPS = 48;

/**
 * Session progress as a staircase (楼梯, the brand): one step per card, rising left to right.
 * A climbed step takes the colour of the grade it got, so the session's history reads at a glance.
 */
const StudyLadder: React.FC<{ grades: Rating[]; total: number; percent: number }> = ({ grades, total, percent }) => {
  if (total === 0) return null;
  const steps = Math.min(total, LADDER_MAX_STEPS);
  const perStep = Math.max(1, total) / steps;
  return (
    <div
      className="study-ladder"
      role="progressbar"
      aria-label="Progresso da sessão"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {Array.from({ length: steps }, (_, i) => {
        // A step is climbed once every card it stands for has been answered; it shows the last grade among them
        const last = Math.ceil((i + 1) * perStep) - 1;
        const grade = last < grades.length ? grades[last] : undefined;
        const isNext = !grade && Math.floor(grades.length / perStep) === i;
        return (
          <span
            key={i}
            className="study-ladder-step"
            data-grade={grade}
            data-next={isNext || undefined}
            style={{ height: `${3 + (11 * i) / Math.max(1, steps - 1)}px` }}
          />
        );
      })}
    </div>
  );
};

// Bar buttons pressed with a finger or mouse do not keep focus. Otherwise the next
// Space or Enter would press that button again (undo twice, reopen the menu)
// instead of revealing or grading the card. Keyboard focus is unaffected.
const keepCardFocus = (e: React.MouseEvent) => e.preventDefault();

interface StudyToolbarProps {
  theme: 'dark' | 'light';
  currentCard: Card | null;
  newCount: number;
  learningCount: number;
  reviewCount: number;
  canUndo: boolean;
  isGrading: boolean;
  isolatedLevel: string | null;
  reviewedInSession: number;
  totalSessionCount: number;
  progressPercent: number;
  sessionGrades: Rating[];
  menuOpen: boolean;
  loadingLevel: string | null;
  levelLoadError: string | null;
  canConfigure: boolean;
  onExit: () => void;
  onUndo: () => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onSelectLevel: (lvl: string | null) => void;
  onOpenWriting: () => void;
  onSpeak: () => void;
  onSuspend: () => void;
  onOpenSettings: () => void;
  onToggleTheme: () => void;
}

/**
 * The session's top utilities: back, queue counts, undo and the menu with session
 * actions and level switching. Purely presentational: the session keeps the queue,
 * loading and menu state, this component only renders and positions them.
 */
export const StudyToolbar: React.FC<StudyToolbarProps> = ({
  theme,
  currentCard,
  newCount,
  learningCount,
  reviewCount,
  canUndo,
  isGrading,
  isolatedLevel,
  reviewedInSession,
  totalSessionCount,
  progressPercent,
  sessionGrades,
  menuOpen,
  loadingLevel,
  levelLoadError,
  canConfigure,
  onExit,
  onUndo,
  onToggleMenu,
  onCloseMenu,
  onSelectLevel,
  onOpenWriting,
  onSpeak,
  onSuspend,
  onOpenSettings,
  onToggleTheme,
}) => {
  const isLight = theme === 'light';
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 64, right: 12, maxHeight: 400 });
  useLayoutEffect(() => {
    if (!menuOpen) return;
    const positionMenu = () => {
      const trigger = menuTriggerRef.current?.getBoundingClientRect();
      if (!trigger) return;
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0;
      const height = viewport?.height ?? window.innerHeight;
      const bottomEdge = top + height;
      // Keep the menu inside the visible viewport even after scrolling or resizing.
      const menuTop = Math.max(top + 12, Math.min(trigger.bottom + 8, bottomEdge - Math.min(160, height - 24)));
      setMenuPosition({
        top: menuTop,
        right: Math.max(12, window.innerWidth - trigger.right),
        maxHeight: Math.max(0, bottomEdge - menuTop - 12),
      });
    };
    positionMenu();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    window.visualViewport?.addEventListener('resize', positionMenu);
    window.visualViewport?.addEventListener('scroll', positionMenu);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
      window.visualViewport?.removeEventListener('resize', positionMenu);
      window.visualViewport?.removeEventListener('scroll', positionMenu);
    };
  }, [menuOpen]);
  useDialogFocus(menuRef, menuOpen, onCloseMenu);

  const menuItems = [
    { icon: PenTool, label: 'Praticar escrita', hint: 'W', onClick: onOpenWriting, show: !!currentCard },
    { icon: Volume2, label: 'Ouvir pronúncia', hint: 'R', onClick: onSpeak, show: !!currentCard },
    { icon: PauseCircle, label: 'Suspender cartão', hint: '', onClick: onSuspend, show: !!currentCard },
    { icon: Settings2, label: 'Configurações da sessão', hint: '', onClick: onOpenSettings, show: canConfigure },
    { icon: isLight ? Moon : Sun, label: isLight ? 'Tema escuro' : 'Tema claro', hint: '', onClick: onToggleTheme, show: true },
  ];

  return (
    <nav
      aria-label="Sessão"
      className="study-toolbar relative z-30 w-full"
    >
      <div className="study-utilities mx-auto h-16 flex items-center justify-between">
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
            onClick={onUndo}
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
            ref={menuTriggerRef}
            onClick={onToggleMenu}
            onMouseDown={keepCardFocus}
            aria-label="Mais opções"
            aria-expanded={menuOpen}
            className={`size-11 flex items-center justify-center rounded-full transition-colors cursor-pointer ${
              isLight ? 'hover:bg-black/5' : 'hover:bg-white/10'
            }`}
          >
            <EllipsisVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Portalled to the body: inside the glass bar, the menu could not blur the card behind it */}
      {menuOpen && createPortal(
        <div className={isLight ? 'card-theme-light text-ink' : 'night_mode card-theme-dark text-white'}>
          <button
            type="button"
            aria-label="Fechar menu"
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={onCloseMenu}
          />
          <div
            ref={menuRef}
            role="dialog"
            aria-modal="true"
            aria-label="Mais opções"
            style={menuPosition}
            className="study-session-menu sheet sheet-menu animate-in fade-in zoom-in-95 duration-150 origin-top-right fixed z-50 w-64 flex flex-col overflow-hidden !rounded-2xl p-1.5"
          >
            {loadingLevel && (
              <div className="shrink-0 px-3 py-2"><InlineLoadingSkeleton label={`Carregando ${loadingLevel}…`} /></div>
            )}
            {levelLoadError && (
              <p role="alert" className="shrink-0 px-3 py-2 text-sm">Não foi possível carregar <span className="whitespace-nowrap">{levelLoadError}</span>. Tente novamente.</p>
            )}
            <div className="study-menu-scroll">
              <header className="study-session-status">
                <span>{isolatedLevel ?? 'Todos os ativos'}</span>
                <span className="tabular-nums" aria-live="polite" aria-atomic="true">
                  {totalSessionCount > 0 && (
                    <>
                      {reviewedInSession}
                      <span className="study-status-of"> de {totalSessionCount}</span>
                      <span className="sr-only"> revisados</span>
                    </>
                  )}
                </span>
                <StudyLadder grades={sessionGrades} total={totalSessionCount} percent={progressPercent} />
              </header>
              {menuItems
                .filter((item) => item.show)
                .map(({ icon: Icon, label, hint, onClick }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      onCloseMenu();
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
              {[null, ...ALL_HSK_LEVELS].map((lvl) => {
                const isSelected = isolatedLevel === lvl;
                return (
                  <button
                    key={lvl ?? 'all'}
                    type="button"
                    onClick={() => onSelectLevel(lvl)}
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
          </div>
        </div>,
        document.body
      )}
    </nav>
  );
};
