import React from 'react';

/**
 * Loading placeholders shaped like the view that is on its way, so the layout does not
 * jump when the real content arrives. The sweep and theme come from `.skeleton` in index.css.
 */

const Bar: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton ${className}`} />
);

const Panel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div
    className={`rounded-3xl p-6 sm:p-7 border bg-white/80 border-black/5 dark:bg-white/[0.04] dark:border-white/10 ${className}`}
  >
    {children}
  </div>
);

/** Announces the wait once; the shapes themselves are hidden from assistive tech. */
const Loading: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div role="status" aria-busy="true" className="w-full animate-in fade-in duration-200">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true">{children}</div>
  </div>
);

export const DecksSkeleton: React.FC = () => (
  <Loading label="Carregando baralhos">
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <Panel>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="space-y-2">
            <Bar className="h-8 w-40" />
            <Bar className="h-4 w-56" />
          </div>
          <Bar className="h-12 w-full sm:w-40 rounded-2xl" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-6 pt-5">
          {[0, 1, 2, 3].map((i) => (
            <Bar key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
      </Panel>
      {/* Level cards keep their own glass surface, so the placeholders sit on it, not on the stripes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="p-4 rounded-2xl border space-y-3 bg-white/80 border-black/5 dark:bg-white/[0.03] dark:border-white/10"
          >
            <Bar className="h-5 w-24" />
            <Bar className="h-3 w-36" />
            <div className="flex items-center justify-between gap-3 pt-2">
              <Bar className="h-3 w-1/2" />
              <Bar className="h-9 w-24 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  </Loading>
);

export const StatsSkeleton: React.FC = () => (
  <Loading label="Carregando estatísticas">
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <Panel>
        <div className="flex items-center gap-4">
          <Bar className="h-12 w-12 rounded-2xl" />
          <div className="space-y-2">
            <Bar className="h-7 w-48" />
            <Bar className="h-4 w-64 max-w-[60vw]" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mt-6">
          {[0, 1, 2, 3].map((i) => (
            <Bar key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </Panel>
      <Panel>
        <Bar className="h-6 w-56 mb-5" />
        <Bar className="h-52 rounded-2xl" />
      </Panel>
    </div>
  </Loading>
);

export const BrowserSkeleton: React.FC = () => (
  <Loading label="Carregando dicionário">
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <Panel>
        <Bar className="h-11 rounded-2xl" />
        <div className="flex gap-2 mt-3">
          {[0, 1, 2, 3].map((i) => (
            <Bar key={i} className="h-8 w-20 rounded-xl" />
          ))}
        </div>
      </Panel>
      <Panel className="space-y-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <Bar className="h-12 w-12 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Bar className="h-4 w-1/3" />
              <Bar className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </Panel>
    </div>
  </Loading>
);

export const PadSkeleton: React.FC = () => (
  <Loading label="Carregando lousa de escrita">
    <div className="w-full max-w-md mx-auto p-3 rounded-3xl border bg-white/95 border-white dark:bg-neutral-900/95 dark:border-white/15">
      <Bar className="h-8 w-40 mb-3" />
      <Bar className="aspect-square w-full rounded-3xl" />
      <Bar className="h-9 w-full mt-3 rounded-xl" />
    </div>
  </Loading>
);

const VARIANTS = {
  decks: DecksSkeleton,
  stats: StatsSkeleton,
  browser: BrowserSkeleton,
  pad: PadSkeleton,
} as const;

/** Suspense fallback for a code-split view. */
export const ViewLoading: React.FC<{ variant?: keyof typeof VARIANTS }> = ({ variant = 'decks' }) => {
  const Shape = VARIANTS[variant];
  return <Shape />;
};

export { Bar as SkeletonBar };
