import React, { useEffect, useState, useRef } from 'react';
import { Card } from '../types/card';
import { Volume2, PenTool, AlertTriangle, Lightbulb } from 'lucide-react';
import { isLeech } from '../lib/fsrs';

interface MandarinCardViewProps {
  card: Card;
  isFlipped: boolean;
  onSpeak?: () => void;
  onOpenWriting?: () => void;
}

export const MandarinCardView: React.FC<MandarinCardViewProps> = ({
  card,
  isFlipped,
  onSpeak,
  onOpenWriting,
}) => {
  const [pinyinHidden, setPinyinHidden] = useState(true);
  const hanziRef = useRef<HTMLDivElement>(null);

  // Clean characters for length calculation
  const cleanHanzi = (card.hanzi || '').replace(/\s+/g, '');
  const isLong = cleanHanzi.length > 5;

  // Compute dynamic characters per line to prevent awkward wrapping
  const charsPerLine = Math.max(cleanHanzi.length, 3);

  const leech = isLeech(card);

  // When card.id changes, reset front delayed reveal
  useEffect(() => {
    if (!isFlipped) {
      setPinyinHidden(true);
      const timer = setTimeout(() => {
        requestAnimationFrame(() => {
          setPinyinHidden(false);
        });
      }, 50);
      return () => clearTimeout(timer);
    } else {
      setPinyinHidden(false);
    }
  }, [card.id]);

  // When flipping to answer, reveal pinyin immediately without delay
  useEffect(() => {
    if (isFlipped) {
      setPinyinHidden(false);
    }
  }, [isFlipped]);

  return (
    <div
      className="study-card-container w-full flex flex-col items-center select-none relative"
      style={{
        perspective: '1000px',
        WebkitPerspective: '1000px',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
      }}
    >
      <div
        className={`mandarin-scene ${isFlipped ? 'back-scene' : 'front-scene'}`}
        style={{
          // @ts-expect-error CSS custom variable
          '--chars-per-line': charsPerLine > 8 ? 8 : charsPerLine,
        }}
      >
        {/* Main Acrylic Card (PERSISTENT DOM - ZERO FLICKER / NO REMOUNT) */}
        <div className="mandarin-card relative">
          {leech && (
            <span
              className="absolute top-3.5 left-3.5 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-700 dark:text-amber-300"
              title={`Leech: ${card.lapses} erros`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Leech</span>
            </span>
          )}

          <div className="absolute top-3.5 right-3.5 flex items-center gap-1 z-10">
            {onOpenWriting && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenWriting();
                }}
                className="p-2 rounded-full opacity-60 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-all cursor-pointer"
                title="Praticar escrita do Hanzi (W)"
                aria-label="Praticar escrita do Hanzi"
              >
                <PenTool className="w-4 h-4 text-current" />
              </button>
            )}

            {onSpeak && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSpeak();
                }}
                className="p-2 rounded-full opacity-60 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-all cursor-pointer"
                title="Ouvir pronúncia em Mandarim"
                aria-label="Ouvir pronúncia em Mandarim"
              >
                <Volume2 className="w-4 h-4 text-current" />
              </button>
            )}
          </div>

          <div className="card-label">Hanzi</div>

          <div
            id="hanzi-text"
            ref={hanziRef}
            className={`hanzi ${isLong ? 'is-long' : ''}`}
            dangerouslySetInnerHTML={{ __html: card.hanzi }}
          />

          {card.pinyin && (
            <div
              id={!isFlipped ? 'pinying-delayed' : undefined}
              className={`pinying ${!isFlipped && pinyinHidden ? 'hidden' : ''}`}
              dangerouslySetInnerHTML={{ __html: card.pinyin }}
            />
          )}
        </div>

        <hr id="answer" />

        {/* Back Dock: Always mounted in GPU compositor tree, toggles with hardware accelerated translate & opacity */}
        <div
          className={`mandarin-dock ${isFlipped ? 'dock-visible' : 'dock-hidden'}`}
          aria-hidden={!isFlipped}
        >
          <div
            className="ptbr"
            dangerouslySetInnerHTML={{ __html: card.ptbr || 'Significado em Português' }}
          />
        </div>

        {/* Mnemonic hint sits below the meaning pill. It keeps its space on the front so the card does not shift on flip */}
        {card.mnemonic && (
          <div
            aria-hidden={!isFlipped}
            className={`flex items-start gap-2.5 px-5 py-3.5 rounded-3xl text-left text-sm whitespace-pre-line transition-opacity duration-300 ${
              isFlipped ? 'opacity-90' : 'opacity-0 invisible'
            }`}
            style={{
              width: 'var(--avail-card-width)',
              maxWidth: '100%',
              boxSizing: 'border-box',
              background: 'var(--glass-pill)',
              boxShadow: 'var(--glass-highlight)',
            }}
          >
            <Lightbulb className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
            <span>{card.mnemonic}</span>
          </div>
        )}
      </div>
    </div>
  );
};
