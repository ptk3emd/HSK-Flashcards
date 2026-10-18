import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Eye, Volume2, TriangleAlert } from 'lucide-react';
import { ExamAttempt, ExamItem, ExamPart, ExamSession, Story, StorySentence } from '../types/card';
import { getBrowserChineseVoices, speakChinese } from '../lib/speech';
import { clearExamSession, saveExamAttempt, saveExamSession } from '../lib/storage';
import { EXAM_SPECS, LearnLevel, buildExam, loadLevelContent, readinessBand, scoreExam } from '../lib/learn';

interface MockExamProps {
  level: LearnLevel;
  /** An exam left half done, to pick up where it stopped */
  resume?: ExamSession | null;
  onOpenStory: (story: Story) => void;
  onExit: () => void;
}

type Stage = 'intro' | 'loading' | 'gate' | 'part' | 'result';
type VoiceState = 'unknown' | 'ok' | 'none';

const PART_ORDER: ExamPart[] = ['listening', 'reading'];
const BLANK = '＿';

const formatTime = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
};

/** Chinese lines with the pinyin over each word; a blank token shows as a gap. */
const ChineseText: React.FC<{ sentences: StorySentence[] }> = ({ sentences }) => (
  <div lang="zh-CN" className="space-y-2">
    {sentences.map((sentence, si) => (
      <p key={si} className="hanzi-index flex flex-wrap items-end gap-x-1 text-2xl leading-[2.4] font-medium">
        {sentence.tokens.map((t, ti) =>
          t.hanzi === BLANK ? (
            <span key={ti} aria-label="lacuna" className="inline-block min-w-[2.2rem] border-b-2 border-[var(--text-secondary)] mx-1" />
          ) : t.punct ? (
            <span key={ti} className="pb-1">{t.hanzi}</span>
          ) : (
            <ruby key={ti}>
              {t.hanzi}
              <rt className="font-sans text-[11px] font-normal ink-tertiary">{t.pinyin}</rt>
            </ruby>
          )
        )}
      </p>
    ))}
  </div>
);

/** Whether the browser can speak Chinese; voices load late, so this starts as unknown. */
function useVoiceState(): VoiceState {
  const [state, setState] = useState<VoiceState>('unknown');
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setState('none');
      return;
    }
    const update = () => {
      if (window.speechSynthesis.getVoices().length === 0) return;
      setState(getBrowserChineseVoices().length > 0 ? 'ok' : 'none');
    };
    update();
    window.speechSynthesis.addEventListener('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);
  return state;
}

/**
 * A timed mock exam in the level's structure. Each part has its own clock; when it runs out,
 * or the student submits the part, its answers lock and the next part begins. The exam is
 * saved after every answer, so a reload picks it up again.
 */
export const MockExam: React.FC<MockExamProps> = ({ level, resume, onOpenStory, onExit }) => {
  const [stage, setStage] = useState<Stage>(resume ? 'part' : 'intro');
  const [items, setItems] = useState<ExamItem[]>(resume?.items ?? []);
  const [picks, setPicks] = useState<Record<string, number | null>>(resume?.picks ?? {});
  const [assisted, setAssisted] = useState<string[]>(resume?.assisted ?? []);
  const [partIndex, setPartIndex] = useState(resume?.partIndex ?? 0);
  const [index, setIndex] = useState(0);
  const [endsAt, setEndsAt] = useState(resume?.endsAt ?? 0);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  // The level's stories, so a wrong answer can point to the story that teaches it
  const [stories, setStories] = useState<Story[]>([]);
  const savedRef = useRef(false);
  const spokenRef = useRef<string | null>(null);
  const voice = useVoiceState();

  useEffect(() => {
    if (!resume) return;
    loadLevelContent(level).then((c) => setStories(c.stories)).catch(() => undefined);
    // only when resuming; a fresh exam loads its content in start()
  }, []);
  const speechBroken = voice === 'none';

  const specs = EXAM_SPECS[level];
  const part = PART_ORDER[partIndex];
  // A part is locked once submitted: every earlier part, and all of them when the exam is over
  const isLocked = (p: ExamPart) => stage === 'result' || PART_ORDER.indexOf(p) < partIndex;
  const partItems = useMemo(() => items.filter((i) => i.part === part), [items, part]);
  const current = partItems[index];

  const submitPart = (target: ExamPart) => {
    if (stage !== 'part' || target !== PART_ORDER[partIndex]) return;
    const next = PART_ORDER.indexOf(target) + 1;
    if (next < PART_ORDER.length) {
      const started = Date.now();
      setPartIndex(next);
      setIndex(0);
      setNow(started);
      setEndsAt(started + specs[next].minutes * 60_000);
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

  // Timers pause while the phone is locked: on return, a part past its deadline is submitted at once
  useEffect(() => {
    if (stage !== 'part') return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      setNow(Date.now());
      if (Date.now() >= endsAt) submitPart(part);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [stage, partIndex, endsAt]);

  // Leaving the page mid-exam asks first; the exam is also saved, so it can be resumed
  useEffect(() => {
    if (stage !== 'part') return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [stage]);

  // Save progress after every answer
  useEffect(() => {
    if (stage !== 'part' || items.length === 0) return;
    saveExamSession({ level, items, picks, assisted, partIndex, endsAt });
  }, [stage, items, picks, assisted, partIndex, endsAt, level]);

  // Listening items are spoken as they appear (the first one is spoken by the start button, a tap)
  useEffect(() => {
    if (stage !== 'part' || !current?.audio || speechBroken) return;
    if (spokenRef.current === current.id) return;
    spokenRef.current = current.id;
    speakChinese(current.audio, { rate: 0.85 });
  }, [stage, current?.id, speechBroken]);

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
      assisted: assisted.length,
    };
    saveExamAttempt(attempt);
    clearExamSession();
  }, [stage, items, picks, level, assisted]);

  const start = async () => {
    setStage('loading');
    setError(null);
    try {
      const content = await loadLevelContent(level);
      setStories(content.stories);
      const seed = Date.now() % 2147483647;
      clearExamSession();
      setItems(buildExam(level, content, seed));
      setPicks({});
      setAssisted([]);
      setPartIndex(0);
      setIndex(0);
      setEndsAt(0);
      savedRef.current = false;
      spokenRef.current = null;
      setStage('gate');
    } catch (e) {
      console.error('Failed to build the exam', e);
      setError('Não foi possível montar o simulado. Tente de novo.');
      setStage('intro');
    }
  };

  // The tap that starts the listening clock also speaks the first item, which iOS needs
  const beginListening = () => {
    const started = Date.now();
    const first = items.find((i) => i.part === 'listening');
    if (first?.audio && !speechBroken) {
      spokenRef.current = first.id;
      speakChinese(first.audio, { rate: 0.85 });
    }
    setNow(started);
    setEndsAt(started + specs[0].minutes * 60_000);
    setStage('part');
  };

  const choose = (item: ExamItem, option: number) => {
    if (isLocked(item.part)) return;
    setPicks((prev) => ({ ...prev, [item.id]: option }));
  };

  const showText = (item: ExamItem) => {
    setAssisted((prev) => (prev.includes(item.id) ? prev : [...prev, item.id]));
  };

  const backButton = (
    <button type="button" onClick={onExit} className="min-h-11 px-2 flex items-center gap-1.5 text-sm font-medium ink-secondary hover:text-[var(--text-fg)] cursor-pointer">
      <ArrowLeft aria-hidden="true" className="w-4 h-4" />
      Simulados
    </button>
  );

  const voiceWarning = speechBroken && (
    <p role="alert" className="flex gap-2 text-sm text-amber-800 dark:text-amber-200">
      <TriangleAlert aria-hidden="true" className="w-4 h-4 mt-0.5 shrink-0" />
      Este aparelho não tem voz em chinês. Na audição, use "Mostrar texto" para ler a frase.
    </p>
  );

  if (stage === 'intro' || stage === 'loading') {
    const totalMinutes = specs.reduce((sum, s) => sum + s.minutes, 0);
    const totalQuestions = specs.reduce((sum, s) => sum + s.count, 0);
    return (
      <section className="sheet p-5 sm:p-7 space-y-6" aria-labelledby="exam-title">
        {backButton}
        <header className="space-y-1">
          <h2 id="exam-title" className="text-xl font-semibold">Simulado {level}</h2>
          <p className="text-sm ink-secondary tabular">{totalQuestions} questões · {totalMinutes} min</p>
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
          Cada parte tem o próprio cronômetro. Ao entregar uma parte, ela fica fechada e não dá para voltar. Se você sair no meio, o simulado fica salvo para continuar.
        </p>
        {voiceWarning}
        {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
        <button type="button" onClick={start} disabled={stage === 'loading'} className="w-full min-h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-sm cursor-pointer disabled:opacity-60">
          {stage === 'loading' ? 'Montando a prova...' : 'Começar simulado'}
        </button>
      </section>
    );
  }

  if (stage === 'gate') {
    return (
      <section className="sheet p-5 sm:p-7 space-y-6" aria-labelledby="gate-title">
        <h2 id="gate-title" className="text-xl font-semibold">Audição · {level}</h2>
        <p className="text-sm ink-secondary">
          Você vai ouvir {specs[0].count} frases e escolher a tradução de cada uma. O cronômetro de {specs[0].minutes} minutos começa quando você tocar no botão.
        </p>
        {voiceWarning}
        <button type="button" onClick={beginListening} className="w-full min-h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-sm cursor-pointer">
          Começar audição
        </button>
      </section>
    );
  }

  if (stage === 'result') {
    const score = scoreExam(items, picks);
    const totalCorrect = score.listening.correct + score.reading.correct;
    const total = score.listening.total + score.reading.total;
    const band = readinessBand(totalCorrect, total);
    const wrong = items.filter((i) => picks[i.id] !== i.answer);
    const storyFor = (grammar?: string) => {
      const head = grammar?.trim().split(/\s+/)[0];
      return head ? stories.find((s) => s.grammar.trim().split(/\s+/)[0] === head) : undefined;
    };
    return (
      <section className="sheet p-5 sm:p-7 space-y-6" aria-labelledby="result-title">
        <header className="space-y-1">
          <h2 id="result-title" className="text-xl font-semibold">Resultado · {level}</h2>
          <p className="text-base font-medium">{band.label}</p>
          <p className="text-xs ink-tertiary">{band.note}</p>
        </header>
        <ul className="ledger text-sm">
          {PART_ORDER.map((p) => (
            <li key={p} className="flex justify-between gap-4 py-3">
              <span>{specs.find((s) => s.part === p)?.label}</span>
              <span className="tabular font-semibold">{score[p].correct} de {score[p].total}</span>
            </li>
          ))}
          <li className="flex justify-between gap-4 py-3">
            <span>Total</span>
            <span className="tabular font-semibold">{totalCorrect} de {total}</span>
          </li>
        </ul>
        {assisted.length > 0 && (
          <p className="text-sm ink-secondary">Em {assisted.length} questões da audição você usou o texto.</p>
        )}
        {wrong.length > 0 && (
          <section aria-labelledby="wrong-title" className="space-y-3">
            <h3 id="wrong-title" className="text-sm font-semibold">Revisar</h3>
            <ul className="ledger text-sm">
              {wrong.map((item) => {
                const story = storyFor(item.grammar);
                const picked = picks[item.id];
                return (
                  <li key={item.id} className="py-4 space-y-2">
                    {item.text && <ChineseText sentences={item.text} />}
                    <p className="font-medium">{item.prompt}</p>
                    <p className="ink-secondary">
                      Você: {picked == null ? 'sem resposta' : <span className={item.kind === 'cloze' ? 'hanzi-index' : undefined}>{item.options[picked]}</span>}
                    </p>
                    <p>Certa: <span className={item.kind === 'cloze' ? 'hanzi-index' : undefined}>{item.options[item.answer]}</span></p>
                    {item.text?.[0]?.ptbr && item.kind === 'cloze' && <p className="ink-secondary">{item.text[0].ptbr}</p>}
                    {item.explain && <p className="ink-secondary">{item.explain}</p>}
                    {item.grammar && <p className="text-xs ink-tertiary">Ponto: <span className="hanzi-index leading-normal">{item.grammar}</span></p>}
                    {story && (
                      <button type="button" onClick={() => onOpenStory(story)} className="min-h-11 px-3 rounded-xl glass-field text-sm font-medium cursor-pointer">
                        Ver história: {story.titlePt}
                      </button>
                    )}
                  </li>
                );
              })}
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
  const remaining = endsAt - now;
  const showingText = !!current && (current.kind !== 'listen' || assisted.includes(current.id));

  return (
    <section className="sheet p-5 sm:p-7 space-y-5" aria-labelledby="part-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="part-title" className="text-base font-semibold">
          {spec.label} · {position} de {partItems.length}
        </h2>
        <span role="timer" aria-live="off" className="tabular text-sm font-semibold">{formatTime(remaining)}</span>
      </div>

      {current && (
        <div className="space-y-4">
          {current.kind === 'listen' && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => current.audio && speakChinese(current.audio, { rate: 0.85 })}
                disabled={speechBroken}
                className="flex-1 min-h-14 rounded-xl glass-field flex items-center justify-center gap-2 text-sm font-medium cursor-pointer disabled:opacity-50"
              >
                <Volume2 aria-hidden="true" className="w-4 h-4" />
                Ouvir de novo
              </button>
              {!showingText && (
                <button
                  type="button"
                  onClick={() => showText(current)}
                  className="min-h-14 px-4 rounded-xl glass-field flex items-center gap-2 text-sm font-medium cursor-pointer"
                >
                  <Eye aria-hidden="true" className="w-4 h-4" />
                  Mostrar texto
                </button>
              )}
            </div>
          )}
          {current.kind === 'listen' && speechBroken && voiceWarning}
          {showingText && current.text && (
            <ChineseText sentences={current.text.map((s) => (current.kind === 'listen' ? s : { ...s, ptbr: '' }))} />
          )}
          <p className="text-base font-medium">{current.prompt}</p>

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
                  lang={current.kind === 'cloze' ? 'zh-CN' : undefined}
                  className={`min-h-12 px-4 rounded-xl text-left cursor-pointer glass-field disabled:cursor-default ${
                    current.kind === 'cloze' ? 'hanzi-index text-lg' : 'text-sm'
                  } ${isPicked ? '!border-red-600' : ''}`}
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
