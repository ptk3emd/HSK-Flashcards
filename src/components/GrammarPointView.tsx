import React from 'react';
import { ArrowLeft, Check, Volume2 } from 'lucide-react';
import { GrammarPoint } from '../types/card';
import { speakChinese } from '../lib/speech';

interface GrammarPointViewProps {
  point: GrammarPoint;
  level: string;
  category: string;
  studied: boolean;
  onStudy: () => void;
  onBack: () => void;
}

/** One grammar point: what it means, how it is built, examples with audio, and a study mark. */
export const GrammarPointView: React.FC<GrammarPointViewProps> = ({ point, level, category, studied, onStudy, onBack }) => {
  const listen = (text: string) => speakChinese(text, { rate: 0.8 });

  return (
    <article className="sheet p-5 sm:p-7 space-y-6" aria-labelledby="grammar-title">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 px-2 flex items-center gap-1.5 text-sm font-medium ink-secondary hover:text-[var(--text-fg)] cursor-pointer"
        >
          <ArrowLeft aria-hidden="true" className="w-4 h-4" />
          Gramática
        </button>
        <span className="text-xs ink-tertiary">{level}</span>
      </div>

      <header className="space-y-1.5">
        <p className="text-xs uppercase tracking-[0.14em] ink-tertiary">{category}</p>
        <h2 id="grammar-title" lang="zh-CN" className="hanzi-index text-xl font-semibold">{point.text}</h2>
      </header>

      <p className="text-sm leading-relaxed">{point.explanation}</p>

      {point.structure && (
        <div className="rounded-xl glass-field p-4 space-y-1">
          <p className="text-xs font-medium ink-tertiary">Estrutura</p>
          <p lang="zh-CN" className="hanzi-index text-sm">{point.structure}</p>
        </div>
      )}

      <section aria-labelledby="grammar-examples" className="space-y-4 border-t border-[var(--separator)] pt-5">
        <h3 id="grammar-examples" className="text-sm font-semibold">Exemplos</h3>
        <ol className="space-y-5 list-none p-0 m-0">
          {point.examples.map((example, ei) => {
            const text = example.tokens.map((t) => t.hanzi).join('');
            return (
              <li key={ei} className="flex gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <p lang="zh-CN" className="hanzi-index flex flex-wrap items-end gap-x-1 text-2xl leading-[2.4] font-medium">
                    {example.tokens.map((t, ti) =>
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
                  <p className="text-sm ink-secondary">{example.ptbr}</p>
                </div>
                <button
                  type="button"
                  onClick={() => listen(text)}
                  aria-label={`Ouvir o exemplo ${ei + 1}`}
                  className="size-11 shrink-0 rounded-xl flex items-center justify-center ink-secondary hover:text-[var(--text-fg)] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer"
                >
                  <Volume2 aria-hidden="true" className="w-[18px] h-[18px]" />
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      {studied ? (
        <p role="status" className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
          <Check aria-hidden="true" className="w-4 h-4" />
          Ponto estudado
        </p>
      ) : (
        <button
          type="button"
          onClick={onStudy}
          className="w-full min-h-12 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-sm cursor-pointer"
        >
          Marcar como estudado
        </button>
      )}
    </article>
  );
};
