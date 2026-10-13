import React, { useEffect, useRef, useState } from 'react';
import { ExamAttempt, LevelContent, Story } from '../types/card';
import { LEARN_LEVELS, EXAM_SPECS, LearnLevel, loadLevelContent } from '../lib/learn';
import { loadExamAttempts, loadStoriesRead } from '../lib/storage';
import { StoryReader } from './StoryReader';
import { MockExam } from './MockExam';

type Section = 'stories' | 'exams';

/** The Learn tab: short stories with their grammar point, and HSK mock exams. */
export const LearnView: React.FC = () => {
  const [section, setSection] = useState<Section>('stories');
  const [content, setContent] = useState<Partial<Record<LearnLevel, LevelContent>>>({});
  const [contentState, setContentState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [openStory, setOpenStory] = useState<Story | null>(null);
  const [examLevel, setExamLevel] = useState<LearnLevel | null>(null);
  const [read, setRead] = useState<string[]>(() => loadStoriesRead());
  const [attempts, setAttempts] = useState<ExamAttempt[]>(() => loadExamAttempts());

  // Set when the tab unmounts, so a late response never updates an unmounted view
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Stories are only fetched when their section is opened; the exams never need them
  useEffect(() => {
    if (section !== 'stories' || contentState !== 'idle') return;
    setContentState('loading');
    Promise.all(LEARN_LEVELS.map((lvl) => loadLevelContent(lvl).then((c) => [lvl, c] as const)))
      .then((pairs) => {
        if (!mounted.current) return;
        setContent(Object.fromEntries(pairs) as Partial<Record<LearnLevel, LevelContent>>);
        setContentState('ready');
      })
      .catch((e) => {
        console.error('Failed to load the stories', e);
        if (mounted.current) setContentState('error');
      });
  }, [section, contentState]);

  if (openStory) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <StoryReader
          story={openStory}
          onBack={() => setOpenStory(null)}
          onFinished={() => {
            setRead(loadStoriesRead());
            setOpenStory(null);
          }}
        />
      </div>
    );
  }

  if (examLevel) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <MockExam
          level={examLevel}
          onExit={() => {
            setAttempts(loadExamAttempts());
            setExamLevel(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 animate-in fade-in duration-200">
      <h1 className="px-1 text-2xl font-semibold tracking-tight">Aprender</h1>

      <div role="group" aria-label="Seção" className="sheet !rounded-xl p-1 flex gap-0.5 w-fit">
        {(
          [
            { id: 'stories', label: 'Histórias' },
            { id: 'exams', label: 'Simulados' },
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

      {section === 'stories' && contentState !== 'ready' && (
        <section className="sheet p-5 sm:p-6 flex items-center justify-between gap-4">
          <p role={contentState === 'error' ? 'alert' : 'status'} className="text-sm ink-secondary">
            {contentState === 'error' ? 'Não foi possível carregar as histórias.' : 'Carregando histórias...'}
          </p>
          {contentState === 'error' && (
            <button
              type="button"
              onClick={() => setContentState('idle')}
              className="min-h-11 px-4 rounded-xl glass-field text-sm font-medium cursor-pointer shrink-0"
            >
              Tentar de novo
            </button>
          )}
        </section>
      )}

      {section === 'stories' && contentState === 'ready' &&
        LEARN_LEVELS.map((lvl) => {
          const levelContent = content[lvl];
          return (
            <section key={lvl} className="sheet overflow-hidden" aria-labelledby={`stories-${lvl}`}>
              <h2 id={`stories-${lvl}`} className="px-5 pt-5 pb-3 text-base font-semibold">{lvl}</h2>
              {!levelContent ? (
                <p className="px-5 pb-5 text-sm ink-secondary">Carregando...</p>
              ) : (
                <ul className="ledger border-t border-[var(--separator)]">
                  {levelContent.stories.map((story) => {
                    const done = read.includes(story.id);
                    return (
                      <li key={story.id}>
                        <button
                          type="button"
                          onClick={() => setOpenStory(story)}
                          className="w-full min-h-14 px-5 py-3 flex items-center justify-between gap-4 text-left cursor-pointer hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-medium">{story.title}</span>
                            <span className="block text-xs ink-tertiary truncate">{story.grammar}</span>
                          </span>
                          {done && <span className="text-xs ink-secondary shrink-0">Lida</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {levelContent && (
                <details className="group border-t border-[var(--separator)] px-5 py-3">
                  <summary className="min-h-11 flex items-center justify-between cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden">
                    Pontos gramaticais
                    <span className="text-xs ink-tertiary">{levelContent.grammar.reduce((n, g) => n + g.points.length, 0)} itens</span>
                  </summary>
                  <div className="pb-2 space-y-4 text-sm">
                    {levelContent.grammar.map((group) => (
                      <div key={group.category} className="space-y-1">
                        <p className="font-medium">{group.category}</p>
                        <ul className="space-y-1 ink-secondary list-disc pl-5">
                          {group.points.map((point) => (
                            <li key={point}>{point}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </section>
          );
        })}

      {section === 'exams' &&
        LEARN_LEVELS.map((lvl) => {
          const spec = EXAM_SPECS[lvl];
          const questions = spec.reduce((n, s) => n + s.count, 0);
          const minutes = spec.reduce((n, s) => n + s.minutes, 0);
          const own = attempts.filter((a) => a.level === lvl);
          const last = own[0];
          return (
            <section key={lvl} className="sheet p-5 sm:p-6 space-y-4" aria-labelledby={`exam-${lvl}`}>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h2 id={`exam-${lvl}`} className="text-base font-semibold">{lvl}</h2>
                  <p className="text-xs ink-tertiary tabular">{questions} questões · {minutes} min</p>
                </div>
                <button
                  type="button"
                  onClick={() => setExamLevel(lvl)}
                  className="min-h-11 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium cursor-pointer shrink-0"
                >
                  Começar
                </button>
              </div>
              {last && (
                <p className="text-sm ink-secondary tabular">
                  Último: {last.correct.listening + last.correct.reading} de {last.total.listening + last.total.reading} · {own.length} {own.length === 1 ? 'tentativa' : 'tentativas'}
                </p>
              )}
            </section>
          );
        })}
    </div>
  );
};
