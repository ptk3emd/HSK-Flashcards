import React from 'react';

/** The wordmark row shared by the account screens. */
export const BrandHeader: React.FC = () => (
  <div className="flex items-center gap-2.5 px-1">
    <svg aria-hidden="true" viewBox="0 0 120 120" className="size-7 shrink-0">
      <rect width="120" height="120" rx="8" fill="#B3261E" />
      <path d="M22 98 V80 H42 V62 H62 V44 H98 V98 Z" fill="#F4EEE3" />
    </svg>
    <span className="hanzi-index text-xl font-semibold">Lóutī</span>
    <span className="text-[11px] uppercase tracking-[0.2em] ink-tertiary">Mandarim</span>
  </div>
);
