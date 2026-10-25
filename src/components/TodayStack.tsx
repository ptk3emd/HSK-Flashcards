import React, { useRef } from 'react';
import { Card } from '../types/card';
import { COURSE } from '../lib/course';

interface TodayStackProps {
  /** The card the session opens with; it sits on top and becomes the study card */
  nextCard: Card | null;
  learning: number;
  reviews: number;
  fresh: number;
  onStart: () => void;
  disabled: boolean;
}

const MAX_LAYERS = 14;

type Layer = 'learning' | 'review' | 'new';

/**
 * Today's cards as a physical stack of acrylic cards. Its thickness grows with the count
 * (logarithmically, so 5 and 500 both read), and the edge of each card below the top shows
 * what it is: learning, review or new, in the order the session takes them. The top card
 * carries the next word and shares its view-transition-name with the study card, so
 * starting a session lifts it off the stack and opens it full size.
 */
export const TodayStack: React.FC<TodayStackProps> = ({
  nextCard,
  learning,
  reviews,
  fresh,
  onStart,
  disabled,
}) => {
  const tiltRef = useRef<HTMLDivElement>(null);
  const total = learning + reviews + fresh;
  const layerCount =
    total <= 1 ? 0 : Math.min(MAX_LAYERS, Math.max(1, Math.round(3 * Math.log2(total + 1)) - 1));

  // Each layer under the top stands for a share of the queue, taken in study order
  const layers: Layer[] = Array.from({ length: layerCount }, (_, index) => {
    const position = ((index + 1) / (layerCount + 1)) * total;
    if (position < learning) return 'learning';
    if (position < learning + reviews) return 'review';
    return 'new';
  });

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || !tiltRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    tiltRef.current.style.setProperty('--tilt-x', `${(-y * 12).toFixed(2)}deg`);
    tiltRef.current.style.setProperty('--tilt-y', `${(x * 14).toFixed(2)}deg`);
  };

  const handlePointerLeave = () => {
    tiltRef.current?.style.removeProperty('--tilt-x');
    tiltRef.current?.style.removeProperty('--tilt-y');
  };

  const word = nextCard?.hanzi ?? '';
  const size = word.length <= 2 ? 'xl' : word.length <= 4 ? 'lg' : word.length <= 9 ? 'md' : 'sm';

  return (
    <div
      className="today-stack"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      aria-hidden="true"
    >
      <div ref={tiltRef} className="today-stack-tilt">
        {layers
          .map((kind, index) => (
            <span
              key={index}
              className="today-stack-layer"
              data-kind={kind}
              // Alternate a hair of rotation so the pile reads as loose cards, not a block
              style={{ '--depth': index + 1, '--skew': `${index % 2 ? 0.6 : -0.6}deg` } as React.CSSProperties}
            />
          ))
          .reverse()}
        {nextCard ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={onStart}
            disabled={disabled}
            className="today-stack-top"
          >
            <span lang={COURSE.lang} className="today-stack-word" data-size={size}>
              {word}
            </span>
          </button>
        ) : (
          <span className="today-stack-top today-stack-empty">
            <span className="today-stack-seal">完</span>
          </span>
        )}
      </div>
    </div>
  );
};
