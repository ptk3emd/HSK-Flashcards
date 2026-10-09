import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { Card } from '../types/card';
import { Match, Point, Polyline, prepareGlyphs, recognize } from '../lib/handwriting';

interface HanziDrawSearchProps {
  cards: Card[];
  theme: 'dark' | 'light';
  onPick: (hanzi: string) => void;
  onClose: () => void;
}

/** Drawing surface in a 1000-unit square, so pointer maths stays independent of size */
const BOARD = 1000;

/** Recognises a character drawn on the pad and lists the matching deck cards. */
export const HanziDrawSearch: React.FC<HanziDrawSearchProps> = ({ cards, theme, onPick, onClose }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [strokes, setStrokes] = useState<Polyline[]>([]);
  const [current, setCurrent] = useState<Polyline | null>(null);
  // The stroke in progress lives in a ref so pointerup sees every point, including
  // moves React has not rendered yet. Only the first finger down draws.
  const strokeRef = useRef<Point[] | null>(null);
  const pointerRef = useRef<number | null>(null);
  const [glyphIndex, setGlyphIndex] = useState<Record<string, string> | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const isLight = theme === 'light';

  // The index is ~440 KB, so it is fetched as its own chunk the first time the pad opens
  useEffect(() => {
    let active = true;
    import('../data/glyphIndex.json')
      .then((mod) => {
        if (active) setGlyphIndex(mod.default as Record<string, string>);
      })
      .catch(() => {
        if (active) setLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // Only single characters that are in the loaded cards can be offered as results
  const cardByHanzi = useMemo(() => {
    const map = new Map<string, Card>();
    for (const card of cards) {
      if (card.hanzi.length === 1 && !map.has(card.hanzi)) map.set(card.hanzi, card);
    }
    return map;
  }, [cards]);

  // Decoded once per deck, not on every stroke
  const glyphs = useMemo(() => {
    if (!glyphIndex) return null;
    const subset: Record<string, string> = {};
    for (const hanzi of cardByHanzi.keys()) {
      const bitmap = glyphIndex[hanzi];
      if (bitmap) subset[hanzi] = bitmap;
    }
    return prepareGlyphs(subset);
  }, [glyphIndex, cardByHanzi]);

  const matches: Match[] = useMemo(
    () => (glyphs && strokes.length > 0 ? recognize(strokes, glyphs, 5) : []),
    [glyphs, strokes]
  );

  const toBoard = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * BOARD,
      y: ((e.clientY - rect.top) / rect.height) * BOARD,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pointerRef.current !== null) return;
    pointerRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    strokeRef.current = [toBoard(e)];
    setCurrent(strokeRef.current);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerId !== pointerRef.current || !strokeRef.current) return;
    strokeRef.current = [...strokeRef.current, toBoard(e)];
    setCurrent(strokeRef.current);
  };

  const finishStroke = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerId !== pointerRef.current) return;
    const stroke = strokeRef.current;
    pointerRef.current = null;
    strokeRef.current = null;
    if (stroke && stroke.length > 0) setStrokes((prev) => [...prev, stroke]);
    setCurrent(null);
  };

  const clear = () => {
    pointerRef.current = null;
    strokeRef.current = null;
    setStrokes([]);
    setCurrent(null);
  };

  const ink = isLight ? '#141416' : '#ffffff';
  const gridLine = isLight ? 'rgba(216,118,121,0.4)' : 'rgba(255,59,48,0.3)';
  const drawn = current ? [...strokes, current] : strokes;

  let status = '';
  if (loadFailed) status = 'Reconhecimento indisponível. Verifique a conexão e tente de novo.';
  else if (!glyphIndex) status = 'Carregando reconhecimento...';
  else if (strokes.length === 0) status = 'Desenhe o caractere no quadro.';
  else if (matches.length === 0) status = 'Nenhum caractere do baralho corresponde.';
  const announcement = status || `${matches.length} ${matches.length === 1 ? 'resultado' : 'resultados'}. Mais provável: ${matches[0].hanzi}`;

  return (
    <div
      className={`rounded-2xl border p-3 flex flex-col gap-3 animate-in fade-in duration-200 ${
        isLight ? 'bg-white/80 border-black/10' : 'bg-black/30 border-white/10'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold opacity-80">Desenhe o caractere</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={clear}
            disabled={strokes.length === 0}
            aria-label="Limpar desenho"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-xl opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar desenho"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-xl opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-stretch">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${BOARD} ${BOARD}`}
          role="img"
          aria-label="Quadro para desenhar o caractere"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          className={`touch-none select-none cursor-crosshair w-full sm:w-56 aspect-square max-w-[280px] mx-auto sm:mx-0 rounded-xl border ${
            isLight ? 'bg-[#fcfbf8] border-black/10' : 'bg-[#14080a] border-white/15'
          }`}
        >
          <g stroke={gridLine} strokeWidth="2" strokeDasharray="10 10" fill="none" aria-hidden="true">
            <line x1="0" y1="0" x2={BOARD} y2={BOARD} />
            <line x1={BOARD} y1="0" x2="0" y2={BOARD} />
            <line x1={BOARD / 2} y1="0" x2={BOARD / 2} y2={BOARD} />
            <line x1="0" y1={BOARD / 2} x2={BOARD} y2={BOARD / 2} />
          </g>
          {drawn.map((stroke, i) => (
            <polyline
              key={i}
              points={stroke.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
              fill="none"
              stroke={ink}
              strokeWidth="64"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>

        {/* Announced separately so screen readers hear a short summary, not every result */}
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          {!glyphIndex && !loadFailed ? (
            // Result rows take shape while the recogniser loads
            <div aria-hidden="true" className="flex flex-col gap-1.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-11 rounded-xl" />
              ))}
            </div>
          ) : matches.length === 0 ? (
            <p className="text-xs opacity-60 py-2">{status}</p>
          ) : (
            matches.map((m, i) => {
              const card = cardByHanzi.get(m.hanzi);
              if (!card) return null;
              return (
                <button
                  key={m.hanzi}
                  type="button"
                  onClick={() => onPick(m.hanzi)}
                  className={`min-h-11 w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left cursor-pointer transition-all ${
                    i === 0
                      ? isLight
                        ? 'bg-red-600/10 hover:bg-red-600/15'
                        : 'bg-red-600/20 hover:bg-red-600/30'
                      : isLight
                      ? 'bg-black/5 hover:bg-black/10'
                      : 'bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <span className="font-serif text-2xl font-bold leading-none w-8 text-center shrink-0">{m.hanzi}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold">
                      {card.pinyin} <span className="opacity-60 font-normal">{card.level}</span>
                    </span>
                    <span className="block text-[11px] opacity-70 truncate">{card.ptbr}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
