import { GestureMap, StudyAction, StudyGesture } from '../types/card';

export const GESTURES: { id: StudyGesture; label: string }[] = [
  { id: 'tap', label: 'Toque' },
  { id: 'doubleTap', label: 'Toque duplo' },
  { id: 'longPress', label: 'Toque longo' },
  { id: 'swipeRight', label: 'Deslizar para a direita' },
  { id: 'swipeLeft', label: 'Deslizar para a esquerda' },
  { id: 'swipeUp', label: 'Deslizar para cima' },
  { id: 'swipeDown', label: 'Deslizar para baixo' },
];

export const STUDY_ACTIONS: { id: StudyAction; label: string }[] = [
  { id: 'none', label: 'Nenhuma' },
  { id: 'reveal', label: 'Mostrar resposta' },
  { id: 'revealOrGood', label: 'Mostrar resposta, depois Bom' },
  { id: 'again', label: 'Novamente' },
  { id: 'hard', label: 'Difícil' },
  { id: 'good', label: 'Bom' },
  { id: 'easy', label: 'Fácil' },
  { id: 'undo', label: 'Desfazer' },
  { id: 'speak', label: 'Ouvir pronúncia' },
  { id: 'writing', label: 'Praticar escrita' },
  { id: 'suspend', label: 'Suspender cartão' },
  { id: 'menu', label: 'Abrir menu' },
];

export const DEFAULT_GESTURES: GestureMap = {
  tap: 'none',
  doubleTap: 'reveal',
  longPress: 'none',
  swipeRight: 'good',
  swipeLeft: 'again',
  swipeUp: 'none',
  swipeDown: 'none',
};

const ACTION_IDS = new Set<string>(STUDY_ACTIONS.map((a) => a.id));

/** Coerces a stored gesture map, falling back to the default for any missing or unknown entry. */
export function sanitizeGestures(raw: unknown): GestureMap {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const result = { ...DEFAULT_GESTURES };
  for (const { id } of GESTURES) {
    const value = source[id];
    if (typeof value === 'string' && ACTION_IDS.has(value)) result[id] = value as StudyAction;
  }
  return result;
}

export function actionLabel(action: StudyAction): string {
  return STUDY_ACTIONS.find((a) => a.id === action)?.label ?? '';
}

export function gestureLabel(gesture: StudyGesture): string {
  return GESTURES.find((g) => g.id === gesture)?.label ?? '';
}

export const GRADE_ACTIONS: StudyAction[] = ['again', 'hard', 'good', 'easy'];

/** Whether an action does something on the current side of the card. */
export function isActionAvailable(
  action: StudyAction,
  ctx: { isFlipped: boolean; twoButtonGrading: boolean; canUndo: boolean }
): boolean {
  switch (action) {
    case 'none':
      return false;
    case 'reveal':
      return !ctx.isFlipped;
    case 'revealOrGood':
    case 'speak':
    case 'writing':
    case 'suspend':
    case 'menu':
      return true;
    case 'again':
    case 'good':
      return ctx.isFlipped;
    case 'hard':
    case 'easy':
      return ctx.isFlipped && !ctx.twoButtonGrading;
    case 'undo':
      return ctx.canUndo;
  }
}

/** What the action does on this side of the card, for drag labels and hints. */
export function effectiveActionLabel(action: StudyAction, isFlipped: boolean): string {
  if (action === 'revealOrGood') return isFlipped ? 'Bom' : 'Mostrar resposta';
  return actionLabel(action);
}

/** Whether the map can reveal an answer and grade it without the answer buttons. */
export function gestureCoverage(map: GestureMap, twoButtonGrading: boolean) {
  const actions = Object.values(map);
  const canReveal = actions.some((a) => a === 'reveal' || a === 'revealOrGood');
  const canGrade = actions.some(
    (a) => a === 'again' || a === 'good' || a === 'revealOrGood' || (!twoButtonGrading && (a === 'hard' || a === 'easy'))
  );
  return { canReveal, canGrade };
}
