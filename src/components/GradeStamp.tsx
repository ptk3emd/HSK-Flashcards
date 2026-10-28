import React from 'react';
import { Rating } from '../types/card';
import { COURSE } from '../lib/course';

const WORDS = {
  fr: { 1: 'Encore', 2: 'Difficile', 3: 'Bien', 4: 'Facile' },
  it: { 1: 'Ancora', 2: 'Difficile', 3: 'Bene', 4: 'Facile' },
} as const;

/** Localized lacquer/wax seal; the scene anchor keeps it visible during a swipe. */
export function GradeStamp({ rating, progress = 1, confirmed = false }: {
  rating: Rating; progress?: number; confirmed?: boolean;
}) {
  const chinese = COURSE.id === 'zh';
  const word = chinese ? '' : WORDS[COURSE.id as 'fr' | 'it'][rating];
  return (
    <div className="study-stamp-anchor" aria-hidden="true">
      <div className="study-impact-stamp" data-grade={rating} data-confirmed={confirmed || undefined}
        style={{ '--stamp-progress': progress } as React.CSSProperties}>
        <svg className="study-stamp-ink" viewBox="0 0 180 180" lang={COURSE.lang}>
          {chinese ? <>
            <rect x="6" y="6" width="168" height="168" rx="15" fill="currentColor" />
            <path d="M29 18H151Q162 18 162 29V151Q162 162 151 162H29Q18 162 18 151V29Q18 18 29 18Z" fill="none" stroke="#f4eee3" strokeWidth="3" />
            <path d="M26 49V26H49M131 26H154V49M154 131V154H131M49 154H26V131" fill="none" stroke="#f4eee3" strokeWidth="1" opacity=".65" />
          </> : <>
            <circle cx="90" cy="90" r="84" fill="currentColor" />
            <circle cx="90" cy="90" r="74" fill="none" stroke="#f4eee3" strokeWidth="2.5" />
            <circle cx="90" cy="90" r="68" fill="none" stroke="#f4eee3" strokeWidth=".8" opacity=".6" />
          </>}
          <text x="90" y={chinese ? 96 : 83} dominantBaseline="middle" textAnchor="middle"
            fill="#f4eee3" fontFamily="var(--font-hanzi)" fontWeight="600"
            fontStyle={chinese ? 'normal' : 'italic'} fontSize={chinese ? 110 : 83}>{COURSE.sealMarks[rating]}</text>
          {!chinese && <text x="90" y="131" textAnchor="middle" fill="#f4eee3"
            fontFamily="var(--font-hanzi)" fontSize="19" fontStyle="italic">{word}</text>}
          <path d="M28 14h21m65 152h18M12 117v9" stroke="#f4eee3" strokeWidth="1" opacity=".35" />
        </svg>
      </div>
    </div>
  );
}
