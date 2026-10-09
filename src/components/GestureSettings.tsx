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
  const isLight = theme === 'light';
  const gestures = deckConfig.gestures;
  const isDefault = GESTURES.every(({ id }) => gestures[id] === DEFAULT_GESTURES[id]);
  const { canReveal, canGrade } = gestureCoverage(gestures, deckConfig.twoButtonGrading);

  const setGesture = (gesture: StudyGesture, action: StudyAction) =>
    onUpdateDeckConfig({ ...deckConfig, gestures: { ...gestures, [gesture]: action } });

  const warning =
    deckConfig.hideAnswerButtons && (!canReveal || !canGrade)
      ? !canReveal
        ? 'Com os botões de resposta ocultos, defina um gesto para mostrar a resposta.'
        : 'Com os botões de resposta ocultos, defina um gesto para avaliar o cartão.'
      : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold">Gestos no cartão</h3>
        <button
          type="button"
          onClick={() => onUpdateDeckConfig({ ...deckConfig, gestures: { ...DEFAULT_GESTURES } })}
          disabled={isDefault}
          className={`min-h-9 flex items-center gap-1.5 px-3 rounded-xl text-[11px] font-semibold cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            isLight ? 'bg-black/5 hover:bg-black/10' : 'bg-white/10 hover:bg-white/15'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Restaurar padrão
        </button>
      </div>

      <ul className={`rounded-2xl border divide-y ${isLight ? 'border-black/10 divide-black/5' : 'border-white/10 divide-white/5'}`}>
        {GESTURES.map(({ id, label }) => {
          const Icon = GESTURE_ICONS[id];
          const selectId = `gesture-${id}`;
          return (
            <li key={id} className="flex items-center justify-between gap-3 px-3 py-2">
              <label htmlFor={selectId} className="flex-1 flex items-center gap-2.5 min-w-0 text-xs font-medium leading-snug cursor-pointer">
                <Icon className="w-4 h-4 shrink-0 opacity-60" aria-hidden="true" />
                <span>{label}</span>
              </label>
              <select
                id={selectId}
                value={gestures[id]}
                onChange={(e) => setGesture(id, e.target.value as StudyAction)}
                className={`min-h-9 w-40 shrink-0 px-2.5 rounded-xl text-xs border cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 ${
                  isLight ? 'bg-white border-black/15 text-black' : 'bg-black/40 border-white/15 text-white'
                } ${gestures[id] === 'none' ? 'opacity-60' : ''}`}
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
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300" role="status">
          <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          {warning}
        </p>
      )}
    </div>
  );
};
