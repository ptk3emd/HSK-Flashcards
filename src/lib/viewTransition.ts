import { flushSync } from 'react-dom';

/**
 * Runs a state change inside a same-document View Transition, so elements that share a
 * view-transition-name (the next card on the deck stack and the study card) morph between
 * screens. Without support, or with reduced motion, the change simply applies.
 */
export function withViewTransition(update: () => void): void {
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce || typeof document === 'undefined' || typeof document.startViewTransition !== 'function') {
    update();
    return;
  }
  document.startViewTransition(() => {
    flushSync(update);
  });
}
