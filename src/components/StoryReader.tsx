import React, { useState } from 'react';
import { ArrowLeft, Volume2, CheckCircle2, XCircle } from 'lucide-react';
import { Card, Story } from '../types/card';
import { loadNativeLevelCards } from '../data/defaultDecks';
import { speakChinese } from '../lib/speech';
import { markStoryRead } from '../lib/storage';

interface StoryReaderProps {
  story: Story;
  /** The student's deck, to tell which words of the story are missing from it */
  cards: Card[];
  onAddCards: (cards: Card[]) => void;
  onBack: () => void;
  onFinished: () => void;
}

/** One short story with its grammar point: Chinese with pinyin, the Portuguese beside it, then questions. */
export const StoryReader: React.FC<StoryReaderProps> = ({ story, cards, onAddCards, onBack, onFinished }) => {
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [adding, setAdding] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  // Words of the story the deck does not have, which happens when the story's level was never downloaded
  const deckWords = new Set(cards.flatMap((c) => c.hanzi.split('|')));
  const storyWords = Array.from(new Set(story.sentences.flatMap((s) => s.tokens.filter((t) => !t.punct).map((t) => t.hanzi))));
  const missing = storyWords.filter((w) => !deckWords.has(w));

  const addLevel = async () => {
    setAdding('busy');
    try {
      onAddCards(await loadNativeLevelCards(story.level));
      setAdding('done');
    } catch (e) {
      console.error('Failed to add the level', e);
      setAdding('error');
    }
  };
  const answered = Object.keys(picks).length === story.questions.length;

  const choose = (qIndex: number, option: number) => {
    if (picks[qIndex] !== undefined) return;
    setPicks({ ...picks, [qIndex]: option });
  };

  const finish = () => {
    markStoryRead(story.id);
    onFinished();
  };

  const listen = (text: string) => speakChinese(text, { rate: 0.8 });

  return (
    <article className="sheet p-5 sm:p-7 space-y-6" aria-labelledby="story-title">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 px-2 flex items-center gap-1.5 text-sm font-medium ink-secondary hover:text-[var(--text-fg)] cursor-pointer"
        >
          <ArrowLeft aria-hidden="true" className="w-4 h-4" />
          Histórias
        </button>
        <span className="text-xs ink-tertiary">{story.level}</span>
      </div>

      <header className="space-y-1.5">
        <p className="hanzi-index text-xs uppercase tracking-[0.14em] ink-tertiary">{story.grammar}</p>
        <h2 id="story-title" lang="zh-CN" className="hanzi-index text-xl font-semibold">{story.title}</h2>
        <p className="text-sm ink-secondary">{story.titlePt}</p>
      </header>

      {missing.length > 0 && adding !== 'done' && (
        <div className="rounded-xl glass-field p-4 space-y-3 text-sm">
          <p>
            {missing.length} {missing.length === 1 ? 'palavra desta história não está' : 'palavras desta história não estão'} no seu baralho.
          </p>
          <button
            type="button"
            onClick={addLevel}
            disabled={adding === 'busy'}
            className="min-h-11 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium cursor-pointer disabled:opacity-60"
          >
            {adding === 'busy' ? 'Adicionando...' : `Adicionar o ${story.level} ao baralho`}
          </button>
          {adding === 'error' && <p role="alert" className="text-red-700 dark:text-red-300">Não foi possível adicionar. Tente de novo.</p>}
        </div>
      )}
      {adding === 'done' && (
        <p role="status" className="text-sm ink-secondary">{story.level} adicionado ao baralho. Ative o nível em Decks para estudar as palavras.</p>
      )}

      <ol className="space-y-5 list-none p-0 m-0">
        {story.sentences.map((sentence, si) => {
          const text = sentence.tokens.map((t) => t.hanzi).join('');
          return (
            <li key={si} className="flex gap-3">
              <div className="flex-1 min-w-0 space-y-1">
                <p lang="zh-CN" className="hanzi-index flex flex-wrap items-end gap-x-1 text-2xl leading-[2.4] font-medium">
                  {sentence.tokens.map((t, ti) =>
                    t.punct ? (
                      <span key={ti} className="pb-1">{t.hanzi}</span>
                    ) : (
                      <ruby key={ti}>
                        {t.hanzi}
                        <rt className="font-sans text-[11px] font-normal ink-tertiary">{t.pinyin}</rt>
                      </ruby>
                    )
                  )}
                </p>
                <p className="text-sm ink-secondary">{sentence.ptbr}</p>
              </div>
              <button
                type="button"
                onClick={() => listen(text)}
                aria-label={`Ouvir a frase ${si + 1}`}
                className="size-11 shrink-0 rounded-xl flex items-center justify-center ink-secondary hover:text-[var(--text-fg)] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer"
              >
                <Volume2 aria-hidden="true" className="w-[18px] h-[18px]" />
              </button>
            </li>
          );
        })}
      </ol>

      <section aria-labelledby="story-questions" className="space-y-4 pt-2 border-t border-[var(--separator)]">
        <h3 id="story-questions" className="pt-4 text-sm font-semibold">Perguntas sobre a história</h3>
        {story.questions.map((q, qi) => {
          const picked = picks[qi];
          return (
            <fieldset key={qi} className="space-y-2">
              <legend className="text-sm font-medium pb-1">{q.prompt}</legend>
              <div className="grid gap-2">
                {q.options.map((option, oi) => {
                  const isPicked = picked === oi;
                  const isRight = picked !== undefined && oi === q.answer;
                  const isWrong = isPicked && oi !== q.answer;
                  return (
                    <button
                      key={oi}
                      type="button"
                      onClick={() => choose(qi, oi)}
                      aria-pressed={isPicked}
                      className={`min-h-11 px-4 rounded-xl text-left text-sm flex items-center justify-between gap-3 cursor-pointer glass-field ${
                        isRight ? '!border-emerald-600' : isWrong ? '!border-red-600' : ''
                      }`}
                    >
                      <span>{option}</span>
                      {isRight && <CheckCircle2 aria-label="Resposta certa" className="w-4 h-4 text-emerald-700 dark:text-emerald-300 shrink-0" />}
                      {isWrong && <XCircle aria-label="Resposta errada" className="w-4 h-4 text-red-700 dark:text-red-300 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </section>

      {answered && (
        <button
          type="button"
          onClick={finish}
          className="w-full min-h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-sm cursor-pointer"
        >
          Concluir história
        </button>
      )}
    </article>
  );
};
