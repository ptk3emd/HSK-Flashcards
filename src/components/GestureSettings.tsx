import React from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Hand,
  MousePointerClick,
  Pointer,
  RotateCcw,
  TriangleAlert,
  LucideIcon,
} from 'lucide-react';
import { DeckConfig, StudyAction, StudyGesture } from '../types/card';
import { DEFAULT_GESTURES, GESTURES, STUDY_ACTIONS, gestureCoverage } from '../lib/gestures';

interface GestureSettingsProps {
  deckConfig: DeckConfig;
  onUpdateDeckConfig: (config: DeckConfig) => void;
  theme: 'dark' | 'light';
}

const GESTURE_ICONS: Record<StudyGesture, LucideIcon> = {
  tap: Pointer,
  doubleTap: MousePointerClick,
  longPress: Hand,
  swipeRight: ArrowRight,
  swipeLeft: ArrowLeft,
  swipeUp: ArrowUp,
  swipeDown: ArrowDown,
};

/** Lets the student choose what each gesture on the study card does. */
export const GestureSettings: React.FC<GestureSettingsProps> = ({ deckConfig, onUpdateDeckConfig, theme }) => {
  const gestures = deckConfig.gestures;
  const isDefault = GESTURES.every(({ id }) => gestures[id] === DEFAULT_GESTURES[id]);
  const { canReveal, canGrade } = gestureCoverage(gestures, deckConfig.twoButtonGrading);

  const setGesture = (gesture: StudyGesture, action: StudyAction) =>
    onUpdateDeckConfig({ ...deckConfig, gestures: { ...gestures, [gesture]: action } });

  const warning =
    deckConfig.hideAnswerButtons && (!canReveal || !canGrade)
      ? !canReveal
        ? 'Sem botões: defina um gesto para mostrar a resposta.'
        : 'Sem botões: defina um gesto para avaliar.'
      : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Gestos</h3>
        <button
          type="button"
          onClick={() => onUpdateDeckConfig({ ...deckConfig, gestures: { ...DEFAULT_GESTURES } })}
          disabled={isDefault}
          aria-label="Restaurar padrão"
          className="min-h-10 flex items-center gap-1.5 px-3 rounded-xl text-sm font-medium ink-secondary hover:text-[var(--text-fg)] cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Padrão
        </button>
      </div>

      <ul className="ledger">
        {GESTURES.map(({ id, label }) => {
          const Icon = GESTURE_ICONS[id];
          const selectId = `gesture-${id}`;
          return (
            <li key={id} className="flex items-center justify-between gap-3 py-2">
              <label htmlFor={selectId} className="flex-1 flex items-center gap-2.5 min-w-0 text-sm leading-snug cursor-pointer">
                <Icon className="w-4 h-4 shrink-0 ink-tertiary" aria-hidden="true" />
                <span>{label}</span>
              </label>
              <select
                id={selectId}
                value={gestures[id]}
                onChange={(e) => setGesture(id, e.target.value as StudyAction)}
                className={`min-h-11 w-40 shrink-0 px-2.5 rounded-xl text-sm border cursor-pointer bg-white/60 border-black/10 dark:bg-black/30 dark:border-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 ${
                  gestures[id] === 'none' ? 'ink-tertiary' : ''
                }`}
              >
                {STUDY_ACTIONS.map((action) => {
                  const off = deckConfig.twoButtonGrading && (action.id === 'hard' || action.id === 'easy');
                  return (
                    <option key={action.id} value={action.id} disabled={off && gestures[id] !== action.id}>
                      {off ? `${action.label} (desativado)` : action.label}
                    </option>
                  );
                })}
              </select>
            </li>
          );
        })}
      </ul>

      {warning && (
        <p className="flex items-start gap-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300" role="status">
          <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          {warning}
        </p>
      )}
    </div>
  );
};
