import React from 'react';
import { CourseId, switchCourse } from '../lib/courseId';
import { COURSE } from '../lib/course';

const OPTIONS: { id: CourseId; label: string; lang: string; title: string }[] = [
  { id: 'zh', label: '中文', lang: 'zh-CN', title: 'Mandarim' },
  { id: 'fr', label: 'Fr', lang: 'fr', title: 'Francês' },
  { id: 'it', label: 'It', lang: 'it', title: 'Italiano' },
];

/**
 * Picks the studied language. Each course keeps its own cards, progress and settings; switching
 * reloads the app in the other one.
 */
export const CourseSwitch: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div role="group" aria-label="Idioma de estudo" className={`flex shrink-0 p-0.5 rounded-lg bg-black/5 dark:bg-white/10 ${className}`}>
    {OPTIONS.map((o) => {
      const current = COURSE.id === o.id;
      return (
        <button
          key={o.id}
          type="button"
          lang={o.lang}
          title={o.title}
          aria-label={o.title}
          aria-pressed={current}
          onClick={() => switchCourse(o.id)}
          className={`min-h-9 min-w-11 px-2.5 rounded-md text-sm font-semibold whitespace-nowrap cursor-pointer transition-colors ${
            current ? 'bg-white text-ink shadow-sm' : 'ink-secondary hover:text-[var(--text-fg)]'
          }`}
        >
          {o.label}
        </button>
      );
    })}
  </div>
);
