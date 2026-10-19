import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { LevelContent } from '../types/card';
import { LearnLevel, prepareQuiz, quizBand, scoreQuiz } from '../lib/learn';
import { saveQuizAttempt } from '../lib/storage';

interface QuizViewProps {
  level: LearnLevel;
  content: LevelContent;
  onExit: () => void;
}

/**
 * Grammar practice of one level: a round of multiple-choice questions with immediate
 * feedback, then a score with the missed questions explained. No timer, no resume;
 * the finished round is saved as an attempt.
 */
export const QuizView: React.FC<QuizViewProps> = ({ level, content, onExit }) => {
  const [items] = useState(() => prepareQuiz(content, Date.now() % 2147483647));
  const [picks, setPicks] = useState<Record<string, number | null>>({});
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);

  if (items.length === 0) {
    return (
      <article className="sheet p-5 sm:p-7 space-y-5">
        <button
          type="button"
          onClick={onExit}
          className="min-h-11 px-2 flex items-center gap-1.5 text-sm font-medium ink-secondary hover:text-[var(--text-fg)] cursor-pointer"
        >
          <ArrowLeft aria-hidden="true" className="w-4 h-4" />
          Exercícios
        </button>
        <p className="text-sm ink-secondary">Este nível ainda não tem exercícios.</p>
      </article>
    );
  }

  const item = items[index];
  const picked = picks[item.id];

  const choose = (option: number) => {
    if (picked !== undefined) return;
    setPicks((p) => ({ ...p, [item.id]: option }));
  };

  const advance = () => {
    if (index + 1 < items.length) {
      setIndex(index + 1);
      return;
    }
    const result = scoreQuiz(items, picks);
    saveQuizAttempt({
      id: `${level}-${Date.now()}`,
      level,
      finishedAt: new Date().toISOString(),
      correct: result.correct,
      total: result.total,
    });
    setFinished(true);
  };

  if (finished) {
    const result = scoreQuiz(items, picks);
    const missed = items.filter((q) => picks[q.id] !== q.answer);
    return (
      <article className="sheet p-5 sm:p-7 space-y-6" aria-labelledby="quiz-result">
        <header className="space-y-1.5">
          <p className="text-xs ink-tertiary">{level}</p>
          <h2 id="quiz-result" className="text-xl font-semibold tabular">{result.correct} de {result.total}</h2>
          <p className="text-sm ink-secondary">{quizBand(result.correct, result.total)}</p>
        </header>

        {missed.length > 0 && (
          <section aria-labelledby="quiz-review" className="space-y-4 border-t border-[var(--separator)] pt-5">
            <h3 id="quiz-review" className="text-sm font-semibold">Revisar as erradas</h3>
            <ul className="space-y-5 list-none p-0 m-0">
              {missed.map((q) => {
                const chosen = picks[q.id];
                return (
                  <li key={q.id} className="space-y-1.5">
                    <p lang="zh-CN" className="hanzi-index text-sm font-medium">{q.prompt}</p>
                    <p className="text-sm ink-secondary">
                      Você: <span lang="zh-CN" className="hanzi-index text-red-700 dark:text-red-300">{chosen != null ? q.options[chosen] : 'sem resposta'}</span>
                      {' · '}
                      Certa: <span lang="zh-CN" className="hanzi-index text-emerald-700 dark:text-emerald-300">{q.options[q.answer]}</span>
                    </p>
                    <p className="text-sm ink-secondary">{q.explain}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <p className="text-xs ink-tertiary">Prática interna deste app, não é uma nota oficial do HSK.</p>

        <button
          type="button"
          onClick={onExit}
          className="w-full min-h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-sm cursor-pointer"
        >
          Concluir
        </button>
      </article>
    );
  }

  return (
    <article className="sheet p-5 sm:p-7 space-y-6" aria-labelledby="quiz-question">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onExit}
          className="min-h-11 px-2 flex items-center gap-1.5 text-sm font-medium ink-secondary hover:text-[var(--text-fg)] cursor-pointer"
        >
          <ArrowLeft aria-hidden="true" className="w-4 h-4" />
          Sair
        </button>
        <span className="text-xs ink-tertiary tabular">{level} · Questão {index + 1} de {items.length}</span>
      </div>

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={items.length}
        aria-valuenow={index + 1}
        aria-label="Progresso da rodada"
        className="h-1.5 rounded-full bg-black/[0.07] dark:bg-white/[0.12] overflow-hidden"
      >
        <div className="h-full bg-red-600 rounded-full transition-[width] duration-200" style={{ width: `${((index + 1) / items.length) * 100}%` }} />
      </div>

      <fieldset className="space-y-3">
        <legend id="quiz-question" lang="zh-CN" className="hanzi-index text-lg font-medium leading-relaxed pb-1">{item.prompt}</legend>
        <div className="grid gap-2">
          {item.options.map((option, oi) => {
            const isPicked = picked === oi;
            const isRight = picked !== undefined && oi === item.answer;
            const isWrong = isPicked && oi !== item.answer;
            return (
              <button
                key={oi}
                type="button"
                onClick={() => choose(oi)}
                aria-pressed={isPicked}
                className={`min-h-11 px-4 rounded-xl text-left text-sm flex items-center justify-between gap-3 cursor-pointer glass-field ${
                  isRight ? '!border-emerald-600' : isWrong ? '!border-red-600' : ''
                }`}
              >
                <span lang="zh-CN" className="hanzi-index">{option}</span>
                {isRight && <CheckCircle2 aria-label="Resposta certa" className="w-4 h-4 text-emerald-700 dark:text-emerald-300 shrink-0" />}
                {isWrong && <XCircle aria-label="Resposta errada" className="w-4 h-4 text-red-700 dark:text-red-300 shrink-0" />}
              </button>
            );
          })}
        </div>
      </fieldset>

      {picked !== undefined && (
        <div className="space-y-4">
          <p className="text-sm ink-secondary">{item.explain}</p>
          <button
            type="button"
            onClick={advance}
            className="w-full min-h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-sm cursor-pointer"
          >
            {index + 1 < items.length ? 'Próxima' : 'Ver resultado'}
          </button>
        </div>
      )}
    </article>
  );
};
