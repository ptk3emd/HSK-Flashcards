import React, { useEffect, useState, useRef } from 'react';
import { Card } from '../types/card';
import { Volume2, PenTool } from 'lucide-react';

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
      </div>
    </div>
  );
};
