import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Volume2 } from 'lucide-react';
import { ExamAttempt, ExamItem, ExamPart } from '../types/card';
import { speakChinese } from '../lib/speech';
import { saveExamAttempt } from '../lib/storage';
import { EXAM_SPECS, LearnLevel, buildExam, loadLevelContent, scoreExam } from '../lib/learn';
import { loadNativeLevelCards } from '../data/defaultDecks';

interface MockExamProps {
  level: LearnLevel;
  onExit: () => void;
}

type Stage = 'intro' | 'loading' | 'part' | 'result';

const PART_ORDER: ExamPart[] = ['listening', 'reading'];

const formatTime = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
};

/**
 * A timed mock exam in the level's structure. Each part has its own clock; when it runs out,
 * or the student submits the part, its answers lock and the next part begins.
 */
export const MockExam: React.FC<MockExamProps> = ({ level, onExit }) => {
  const [stage, setStage] = useState<Stage>('intro');
  const [items, setItems] = useState<ExamItem[]>([]);
  const [picks, setPicks] = useState<Record<string, number | null>>({});
  const [partIndex, setPartIndex] = useState(0);
  const [index, setIndex] = useState(0);
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const savedRef = useRef(false);

  const specs = EXAM_SPECS[level];
  const part = PART_ORDER[partIndex];
  // A part is locked once submitted: every earlier part, and all of them when the exam is over
  const isLocked = (p: ExamPart) => stage === 'result' || PART_ORDER.indexOf(p) < partIndex;
  const partItems = useMemo(() => items.filter((i) => i.part === part), [items, part]);
  const current = partItems[index];

  const submitPart = (target: ExamPart) => {
    const next = PART_ORDER.indexOf(target) + 1;
    if (next < PART_ORDER.length) {
      setPartIndex(next);
      setIndex(0);
      setEndsAt(Date.now() + specs[next].minutes * 60_000);
    } else {
      setStage('result');
    }
  };

  // The display ticks twice a second; the submission fires at the deadline itself
  useEffect(() => {
    if (stage !== 'part') return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [stage]);

  useEffect(() => {
    if (stage !== 'part') return;
    const id = window.setTimeout(() => submitPart(part), Math.max(0, endsAt - Date.now()));
    return () => window.clearTimeout(id);
  }, [stage, partIndex, endsAt]);

  const remaining = endsAt - now;

  // Listening items are spoken as they appear
  useEffect(() => {
    if (stage === 'part' && current?.audio) {
      speakChinese(current.audio, { rate: 0.85 });
    }
  }, [stage, current?.id]);

  // Save the result once, when the exam ends
  useEffect(() => {
    if (stage !== 'result' || savedRef.current) return;
    savedRef.current = true;
    const score = scoreExam(items, picks);
    const attempt: ExamAttempt = {
      id: `${level}-${Date.now()}`,
      level,
      finishedAt: new Date().toISOString(),
      correct: { listening: score.listening.correct, reading: score.reading.correct },
      total: { listening: score.listening.total, reading: score.reading.total },
    };
    saveExamAttempt(attempt);
  }, [stage, items, picks, level]);

  const start = async () => {
    setStage('loading');
    setError(null);
    try {
      const [content, cards] = await Promise.all([
        loadLevelContent(level),
        loadNativeLevelCards(level),
      ]);
      const seed = Date.now() % 2147483647;
      setItems(buildExam(level, cards, content, seed));
      setPicks({});
      setPartIndex(0);
      setIndex(0);
      savedRef.current = false;
      const started = Date.now();
      setNow(started);
      setEndsAt(started + specs[0].minutes * 60_000);
      setStage('part');
    } catch (e) {
      console.error('Failed to build the exam', e);
      setError('Não foi possível montar o simulado. Tente de novo.');
      setStage('intro');
    }
  };

  const choose = (item: ExamItem, option: number) => {
    if (isLocked(item.part)) return;
    setPicks((prev) => ({ ...prev, [item.id]: option }));
  };

  if (stage === 'intro' || stage === 'loading') {
    const totalMinutes = specs.reduce((sum, s) => sum + s.minutes, 0);
    const totalQuestions = specs.reduce((sum, s) => sum + s.count, 0);
    return (
      <section className="sheet p-5 sm:p-7 space-y-6" aria-labelledby="exam-title">
        <button type="button" onClick={onExit} className="min-h-11 px-2 flex items-center gap-1.5 text-sm font-medium ink-secondary hover:text-[var(--text-fg)] cursor-pointer">
          <ArrowLeft aria-hidden="true" className="w-4 h-4" />
          Simulados
        </button>
        <header className="space-y-1">
          <h2 id="exam-title" className="text-xl font-semibold">Simulado {level}</h2>
          <p className="text-sm ink-secondary tabular">
            {totalQuestions} questões · {totalMinutes} min
          </p>
        </header>
        <ul className="ledger text-sm">
          {specs.map((s) => (
            <li key={s.part} className="flex justify-between gap-4 py-3">
              <span>{s.label}</span>
              <span className="tabular ink-secondary">{s.count} questões · {s.minutes} min</span>
            </li>
          ))}
        </ul>
        <p className="text-sm ink-secondary">
          Cada parte tem o próprio cronômetro. Ao entregar uma parte, ela fica fechada e não dá para voltar.
        </p>
        {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
        <button
          type="button"
          onClick={start}
          disabled={stage === 'loading'}
          className="w-full min-h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-sm cursor-pointer disabled:opacity-60"
        >
          {stage === 'loading' ? 'Montando a prova...' : 'Começar simulado'}
        </button>
      </section>
    );
  }

  if (stage === 'result') {
    const score = scoreExam(items, picks);
    const wrong = items.filter((i) => picks[i.id] !== i.answer);
    return (
      <section className="sheet p-5 sm:p-7 space-y-6" aria-labelledby="result-title">
        <header className="space-y-1">
          <h2 id="result-title" className="text-xl font-semibold">Resultado · {level}</h2>
        </header>
        <ul className="ledger text-sm">
          {PART_ORDER.map((p) => {
            const spec = specs.find((s) => s.part === p);
            return (
              <li key={p} className="flex justify-between gap-4 py-3">
                <span>{spec?.label}</span>
                <span className="tabular font-semibold">
                  {score[p].correct} de {score[p].total}
                </span>
              </li>
            );
          })}
        </ul>
        {wrong.length > 0 && (
          <section aria-labelledby="wrong-title" className="space-y-3">
            <h3 id="wrong-title" className="text-sm font-semibold">Revisar</h3>
            <ul className="ledger text-sm">
              {wrong.map((item) => (
                <li key={item.id} className="py-3 space-y-1">
                  <p>{item.audio ? `Áudio: ${item.audio}` : item.prompt}</p>
                  <p className="ink-secondary">Resposta: {item.options[item.answer]}</p>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="flex gap-3">
          <button type="button" onClick={start} className="flex-1 min-h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-sm cursor-pointer">
            Refazer
          </button>
          <button type="button" onClick={onExit} className="flex-1 min-h-12 rounded-xl glass-field font-medium text-sm cursor-pointer">
            Voltar
          </button>
        </div>
      </section>
    );
  }

  // stage === 'part'
  const spec = specs[partIndex];
  const locked = isLocked(part);
  const position = partItems.length ? index + 1 : 0;

  return (
    <section className="sheet p-5 sm:p-7 space-y-5" aria-labelledby="part-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="part-title" className="text-base font-semibold">
          {spec.label} · {position} de {partItems.length}
        </h2>
        <span role="timer" aria-live="off" className="tabular text-sm font-semibold">
          {formatTime(remaining)}
        </span>
      </div>

      {current && (
        <div className="space-y-4">
          {current.audio ? (
            <button
              type="button"
              onClick={() => speakChinese(current.audio ?? '', { rate: 0.85 })}
              className="w-full min-h-14 rounded-xl glass-field flex items-center justify-center gap-2 text-sm font-medium cursor-pointer"
            >
              <Volume2 aria-hidden="true" className="w-4 h-4" />
              Ouvir de novo
            </button>
          ) : (
            <p className="text-base font-medium">{current.prompt}</p>
          )}
          {current.audio && <p className="text-sm ink-secondary">{current.prompt}</p>}

          <div role="group" aria-label="Opções" className="grid gap-2">
            {current.options.map((option, oi) => {
              const isPicked = picks[current.id] === oi;
              return (
                <button
                  key={oi}
                  type="button"
                  disabled={locked}
                  onClick={() => choose(current, oi)}
                  aria-pressed={isPicked}
                  className={`min-h-12 px-4 rounded-xl text-left text-sm cursor-pointer glass-field disabled:cursor-default ${
                    isPicked ? '!border-red-600' : ''
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2">
        <button
          type="button"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          aria-label="Questão anterior"
          className="size-11 rounded-xl flex items-center justify-center glass-field disabled:opacity-40 cursor-pointer"
        >
          <ChevronLeft aria-hidden="true" className="w-4 h-4" />
        </button>
        {locked ? (
          <span className="text-sm ink-secondary">Parte entregue</span>
        ) : (
          <button
            type="button"
            onClick={() => submitPart(part)}
            className="min-h-11 px-4 rounded-xl text-sm font-medium bg-red-600 hover:bg-red-700 text-white cursor-pointer"
          >
            {partIndex + 1 < PART_ORDER.length ? 'Entregar parte' : 'Entregar simulado'}
          </button>
        )}
        <button
          type="button"
          onClick={() => setIndex((i) => Math.min(partItems.length - 1, i + 1))}
          disabled={index >= partItems.length - 1}
          aria-label="Próxima questão"
          className="size-11 rounded-xl flex items-center justify-center glass-field disabled:opacity-40 cursor-pointer"
        >
          <ChevronRight aria-hidden="true" className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
};
