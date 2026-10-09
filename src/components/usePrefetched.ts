import { ComponentType, useEffect, useState } from 'react';

/**
 * Loads a code-split component ahead of use and returns it once it is ready (null before).
 * Rendering the loaded component directly avoids React.lazy's first-render suspend, which
 * React 19 holds for about 300 ms before revealing the content even when the code is cached.
 * Callers keep a lazy() fallback for the moment before this resolves.
 */
export function usePrefetched<P extends object>(
  load: () => Promise<ComponentType<P>>,
  when: 'mount' | 'idle' = 'mount'
): ComponentType<P> | null {
  const [component, setComponent] = useState<ComponentType<P> | null>(null);

  useEffect(() => {
    let active = true;
    let idleHandle: number | undefined;
    const run = () => {
      load()
        .then((loaded) => {
          if (active) setComponent(() => loaded);
        })
        .catch(() => {
          // The lazy fallback loads it again on demand
        });
    };
    if (when === 'idle') {
      idleHandle = window.requestIdleCallback
        ? window.requestIdleCallback(run)
        : window.setTimeout(run, 1500);
    } else {
      run();
    }
    return () => {
      active = false;
      if (idleHandle !== undefined) {
        if (window.cancelIdleCallback) window.cancelIdleCallback(idleHandle);
        else window.clearTimeout(idleHandle);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return component;
}
