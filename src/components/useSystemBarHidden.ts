import { useEffect } from 'react';

/** Whether this browser lets a page go fullscreen (iPhone Safari does not). */
export function canHideSystemBar(): boolean {
  return typeof document !== 'undefined' && Boolean(document.fullscreenEnabled);
}

/**
 * Keeps the app fullscreen while `enabled`, which hides the browser and system bars
 * where the platform allows it. Browsers only grant fullscreen inside a user gesture,
 * so the request runs on the next tap or key press, and again after the user leaves
 * fullscreen with a system gesture. Turning the option off exits fullscreen.
 */
export function useSystemBarHidden(enabled: boolean): void {
  useEffect(() => {
    if (!canHideSystemBar()) return;

    if (!enabled) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      return;
    }

    const request = () => {
      if (document.fullscreenElement) return;
      document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    };

    request(); // Works right away when the option was just switched on by a tap
    window.addEventListener('pointerup', request);
    window.addEventListener('keyup', request);
    return () => {
      window.removeEventListener('pointerup', request);
      window.removeEventListener('keyup', request);
    };
  }, [enabled]);
}
