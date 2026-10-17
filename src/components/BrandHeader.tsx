import React from 'react';
import { COURSE } from '../lib/course';

/**
 * The seal mark of the active course. Lóutī: a lacquer-red seal with a staircase cut in paper.
 * Palier: the same seal in French blue, the stairs broken by a wide landing (le palier) with a
 * red edge, so the tricolour shows without drawing a flag.
 */
export const BrandMark: React.FC<{ className?: string }> = ({ className = 'size-7' }) =>
  COURSE.id === 'it' ? (
    <svg aria-hidden="true" viewBox="0 0 120 120" className={`${className} shrink-0`}>
      <rect width="120" height="120" rx="8" fill="#2E5E3E" />
      <path d="M22 98 V84 H36 V70 H50 V56 H64 V42 H98 V98 Z" fill="#F3EFE4" />
      <rect x="22" y="22" width="12" height="12" fill="#B08D57" />
    </svg>
  ) : COURSE.id === 'fr' ? (
    <svg aria-hidden="true" viewBox="0 0 120 120" className={`${className} shrink-0`}>
      <rect width="120" height="120" rx="8" fill="#24479E" />
      <path d="M22 98 V82 H38 V64 H76 V48 H90 V30 H98 V98 Z" fill="#F6F1E7" />
      <rect x="38" y="58" width="38" height="6" fill="#D7263D" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 120 120" className={`${className} shrink-0`}>
      <rect width="120" height="120" rx="8" fill="#B3261E" />
      <path d="M22 98 V80 H42 V62 H62 V44 H98 V98 Z" fill="#F4EEE3" />
    </svg>
  );

/** The wordmark row shared by the account screens. */
export const BrandHeader: React.FC = () => (
  <div className="flex items-center gap-2.5 px-1">
    <BrandMark />
    <span className="hanzi-index text-xl font-semibold">{COURSE.brand}</span>
    <span className="text-[11px] uppercase tracking-[0.2em] ink-tertiary">{COURSE.brandSub}</span>
  </div>
);
