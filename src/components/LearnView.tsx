import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { GrammarPoint, LevelContent, QuizAttempt } from '../types/card';
import { LEARN_LEVELS, LearnLevel, QUIZ_LENGTH, latestAttempt, loadLevelContent } from '../lib/learn';
import { loadGrammarStudied, loadQuizAttempts, markGrammarStudied } from '../lib/storage';
import { GrammarPointView } from './GrammarPointView';
import { GrammarSkeleton } from './ViewLoading';
import { QuizView } from './QuizView';

type Section = 'grammar' | 'quizzes';

interface OpenPoint {
  level: LearnLevel;
  category: string;
  point: GrammarPoint;
}

/** Level selector shared by the grammar list and the practice area. */
const LevelChips: React.FC<{ value: LearnLevel; onChange: (level: LearnLevel) => void }> = ({ value, onChange }) => (
  <div role="group" aria-label="Nível" className="sheet !rounded-xl p-1 flex flex-wrap gap-0.5 w-fit">
    {LEARN_LEVELS.map((lvl) => (
      <button
        key={lvl}
        type="button"
        onClick={() => onChange(lvl)}
        aria-pressed={value === lvl}
        className={`min-h-11 px-3.5 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
          value === lvl ? 'bg-black/[0.07] dark:bg-white/[0.12] text-[var(--text-fg)]' : 'ink-secondary hover:text-[var(--text-fg)]'
        }`}
      >
        {lvl}
      </button>
    ))}
  </div>
);

/** The Learn tab: HSK grammar lessons and multiple-choice practice, level by level. */
export const LearnView: React.FC = () => {
  const [section, setSection] = useState<Section>('grammar');
  const [level, setLevel] = useState<LearnLevel>('HSK 1');
  const [content, setContent] = useState<Partial<Record<LearnLevel, LevelContent>>>({});
  const [contentState, setContentState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [openPoint, setOpenPoint] = useState<OpenPoint | null>(null);
  const [quizLevel, setQuizLevel] = useState<LearnLevel | null>(null);
  const [studied, setStudied] = useState<string[]>(() => loadGrammarStudied());
  const [attempts, setAttempts] = useState<QuizAttempt[]>(() => loadQuizAttempts());

  // Set when the tab unmounts, so a late response never updates an unmounted view
  const mounted = useRef(true);
  const started = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // All six levels are fetched when the tab opens; a level arriving later never blocks another
  useEffect(() => {
    if (started.current || contentState !== 'idle') return;
    started.current = true;
    setContentState('loading');
    Promise.all(
      LEARN_LEVELS.map((lvl) =>
        loadLevelContent(lvl).then((c) => {
          if (mounted.current) setContent((prev) => ({ ...prev, [lvl]: c }));
        })
      )
    )
      .then(() => {
        if (mounted.current) setContentState('ready');
      })
      .catch((e) => {
        console.error('Failed to load the grammar', e);
        if (mounted.current) setContentState('error');
      });
  }, [contentState]);

  if (openPoint) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <GrammarPointView
          point={openPoint.point}
          level={openPoint.level}
          category={openPoint.category}
          studied={studied.includes(openPoint.point.id)}
          onStudy={() => {
            markGrammarStudied(openPoint.point.id);
            setStudied(loadGrammarStudied());
          }}
          onBack={() => setOpenPoint(null)}
        />
      </div>
    );
  }

  const quizContent = quizLevel ? content[quizLevel] : undefined;
  if (quizLevel && quizContent) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <QuizView
          level={quizLevel}
          content={quizContent}
          onExit={() => {
            setAttempts(loadQuizAttempts());
            setQuizLevel(null);
          }}
        />
      </div>
    );
  }

  const levelContent = content[level];
  const points = levelContent ? levelContent.grammar.flatMap((g) => g.points) : [];
  const studiedCount = points.filter((p) => studied.includes(p.id)).length;
  const own = attempts.filter((a) => a.level === level);
  const last = latestAttempt(attempts, level);
  const roundSize = levelContent ? Math.min(levelContent.exercises.length, QUIZ_LENGTH) : 0;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 animate-in fade-in duration-200">
      <h1 className="px-1 text-2xl font-semibold tracking-tight">Aprender</h1>

      <div role="group" aria-label="Seção" className="sheet !rounded-xl p-1 flex gap-0.5 w-fit">
        {(
          [
            { id: 'grammar', label: 'Gramática' },
            { id: 'quizzes', label: 'Exercícios' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSection(tab.id)}
            aria-pressed={section === tab.id}
            className={`min-h-11 px-4 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
              section === tab.id ? 'bg-black/[0.07] dark:bg-white/[0.12] text-[var(--text-fg)]' : 'ink-secondary hover:text-[var(--text-fg)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <LevelChips value={level} onChange={setLevel} />

      {contentState === 'loading' && <GrammarSkeleton />}
      {contentState === 'error' && (
        <section className="sheet p-5 sm:p-6 flex items-center justify-between gap-4">
          <p role="alert" className="text-sm ink-secondary">
            Não foi possível carregar a gramática.
          </p>
          <button
            type="button"
            onClick={() => {
              started.current = false;
              setContent({});
              setContentState('idle');
            }}
            className="min-h-11 px-4 rounded-xl glass-field text-sm font-medium cursor-pointer shrink-0"
          >
            Tentar de novo
          </button>
        </section>
      )}

      {contentState === 'ready' && section === 'grammar' && levelContent && (
        <section className="sheet overflow-hidden" aria-labelledby={`grammar-${level}`}>
          <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-4">
            <h2 id={`grammar-${level}`} className="text-base font-semibold">{level}</h2>
            <p className="text-xs ink-tertiary tabular">{studiedCount} de {points.length} estudados</p>
          </div>
          {levelContent.grammar.map((group) => (
            <div key={group.category} className="border-t border-[var(--separator)]">
              <h3 className="px-5 pt-4 pb-1 text-xs font-medium uppercase tracking-[0.12em] ink-tertiary">{group.category}</h3>
              <ul className="ledger">
                {group.points.map((point) => (
                  <li key={point.id}>
                    <button
                      type="button"
                      onClick={() => setOpenPoint({ level, category: group.category, point })}
                      className="w-full min-h-14 px-5 py-3 flex items-center justify-between gap-4 text-left cursor-pointer hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                    >
                      <span lang="zh-CN" className="hanzi-index text-sm font-medium leading-normal">{point.text}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        {studied.includes(point.id) && (
                          <Check aria-label="Estudado" className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
                        )}
                        <ChevronRight aria-hidden="true" className="w-4 h-4 ink-tertiary" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {contentState === 'ready' && section === 'quizzes' && levelContent && (
        <section className="sheet p-5 sm:p-6 space-y-4" aria-labelledby={`quiz-${level}`}>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h2 id={`quiz-${level}`} className="text-base font-semibold">{level}</h2>
              <p className="text-xs ink-tertiary tabular">{roundSize} questões por rodada · {points.length} pontos de gramática</p>
            </div>
            <button
              type="button"
              onClick={() => setQuizLevel(level)}
              className="min-h-11 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium cursor-pointer shrink-0"
            >
              Praticar
            </button>
          </div>
          {last && (
            <p className="text-sm ink-secondary tabular">
              Última: {last.correct} de {last.total} · {own.length} {own.length === 1 ? 'rodada' : 'rodadas'}
            </p>
          )}
        </section>
      )}
    </div>
  );
};
