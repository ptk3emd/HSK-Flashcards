import React from 'react';

/**
 * Loading placeholders shaped like the view that is on its way, so the layout does not
 * jump when the real content arrives. The sweep and theme come from `.skeleton` in index.css.
 */

const Bar: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton ${className}`} />
);

const Sheet: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`sheet ${className}`}>{children}</div>
);

/** Ledger rows: an index mark, a label pair and a right-aligned figure. */
const Rows: React.FC<{ count: number; index?: boolean }> = ({ count, index = true }) => (
  <div className="ledger">
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="flex items-center gap-4 px-5 py-3.5">
        {index && <Bar className="h-7 w-8 shrink-0" />}
        <div className="flex-1 space-y-2">
          <Bar className="h-3.5 w-1/3" />
          <Bar className="h-3 w-1/2" />
        </div>
        <Bar className="h-5 w-10" />
      </div>
    ))}
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
    <div className="w-full max-w-2xl mx-auto space-y-4">
      <Sheet className="p-6 sm:p-7 space-y-4">
        <Bar className="h-4 w-16" />
        <Bar className="h-14 w-24" />
        <Bar className="h-3.5 w-48" />
        <Bar className="h-14 w-full rounded-2xl" />
      </Sheet>
      <Sheet className="overflow-hidden">
        <Rows count={7} />
      </Sheet>
    </div>
  </Loading>
);

export const StatsSkeleton: React.FC = () => (
  <Loading label="Carregando estatísticas">
    <div className="w-full max-w-3xl mx-auto space-y-4">
      <div className="flex items-end justify-between px-1">
        <Bar className="h-7 w-36" />
        <Bar className="h-10 w-48 rounded-xl" />
      </div>
      <Sheet className="overflow-hidden">
        <Rows count={4} index={false} />
      </Sheet>
      <Sheet className="p-5 sm:p-6">
        <Bar className="h-5 w-24 mb-5" />
        <Bar className="h-48" />
      </Sheet>
    </div>
  </Loading>
);

export const BrowserSkeleton: React.FC = () => (
  <Loading label="Carregando dicionário">
    <div className="w-full max-w-3xl mx-auto space-y-4">
      <Bar className="h-7 w-36 mx-1" />
      <Sheet className="p-4 sm:p-5 space-y-3">
        <Bar className="h-11 rounded-xl" />
        <div className="flex gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Bar key={i} className="h-8 w-16 rounded-lg" />
          ))}
        </div>
      </Sheet>
      <Sheet className="overflow-hidden">
        <Rows count={6} />
      </Sheet>
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
