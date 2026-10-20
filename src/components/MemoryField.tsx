import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '../types/card';
import { calculateRetrievability } from '../lib/fsrs';
import { COURSE } from '../lib/course';

interface MemoryFieldProps {
  cards: Card[];
  targetRetention: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_AHEAD = 60;
const HEIGHT = 240;
const PAD = { left: 40, right: 14, top: 14, bottom: 28 };
const TICK_DAYS = [0, 1, 3, 7, 14, 30, 60, 90, 180, 365, 730];
const AHEAD_PRESETS = [0, 7, 30, 60];

type Hover = { index: number; x: number; y: number } | null;

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Every studied word as a point on its own FSRS forgetting curve: x is the time since its
 * last review, y its recall chance right now. Moving "daqui a N dias" slides each point down
 * its own curve, so the field shows which words drop below the target if nothing is reviewed.
 * Drawn on a canvas, so the full vocabulary moves at frame rate.
 */
export const MemoryField: React.FC<MemoryFieldProps> = ({ cards, targetRetention }) => {
  const [ahead, setAhead] = useState(0);
  const [hover, setHover] = useState<Hover>(null);
  const [width, setWidth] = useState(560);

  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Studied words, in flat arrays for the draw loop
  const field = useMemo(() => {
    const now = Date.now();
    const list = cards.filter((c) => c.reps > 0 && c.stability > 0 && c.last_review && !c.suspended);
    const elapsed = new Float32Array(list.length);
    const stability = new Float32Array(list.length);
    let maxElapsed = 0;
    list.forEach((c, i) => {
      const t = Math.max(0, (now - new Date(c.last_review as string).getTime()) / DAY_MS);
      elapsed[i] = Number.isFinite(t) ? t : 0;
      stability[i] = c.stability;
      if (elapsed[i] > maxElapsed) maxElapsed = elapsed[i];
    });
    const avgS = list.length > 0 ? list.reduce((a, c) => a + c.stability, 0) / list.length : 0;
    // The axis covers the farthest point at the farthest look-ahead, so it never rescales mid-drag
    const span = maxElapsed + MAX_AHEAD;
    const maxDay = TICK_DAYS.find((d) => d >= span) ?? 730;
    // Recall sits high for most words, so the scale opens below the target and words that sink
    // further rest on its floor instead of the field squeezing into a thin top band
    let minNow = 1;
    for (let i = 0; i < list.length; i++) {
      minNow = Math.min(minNow, calculateRetrievability(elapsed[i], stability[i]));
    }
    const floor = Math.max(0, Math.floor(Math.min(targetRetention - 0.3, minNow - 0.05) * 10) / 10);
    return { list, elapsed, stability, avgS, maxDay, floor };
  }, [cards, targetRetention]);

  const count = field.list.length;

  const xOf = (t: number) =>
    PAD.left + (Math.log1p(Math.min(t, field.maxDay)) / Math.log1p(field.maxDay)) * (width - PAD.left - PAD.right);
  const yOf = (r: number) =>
    PAD.top + ((1 - Math.max(r, field.floor)) / (1 - field.floor)) * (HEIGHT - PAD.top - PAD.bottom);

  // Readout at the chosen look-ahead
  const readout = useMemo(() => {
    let below = 0;
    let sum = 0;
    for (let i = 0; i < count; i++) {
      const r = calculateRetrievability(field.elapsed[i] + ahead, field.stability[i]);
      sum += r;
      if (r < targetRetention) below++;
    }
    return { below, mean: count > 0 ? sum / count : 0 };
  }, [field, count, ahead, targetRetention]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w > 0) setWidth(Math.max(280, w));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Animation state lives outside React so a drag never re-renders per frame
  const anim = useRef({ progress: reducedMotion() ? 1 : 0, intro: reducedMotion() ? 1 : 0, shown: 0, target: 0, raf: 0, last: 0 });
  const drawRef = useRef<() => void>(() => undefined);

  drawRef.current = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== HEIGHT * dpr) {
      canvas.width = Math.round(width * dpr);
      canvas.height = HEIGHT * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, HEIGHT);

    const css = getComputedStyle(canvas);
    const grid = css.getPropertyValue('--chart-grid').trim() || '#e5e7eb';
    const label = css.getPropertyValue('--chart-label').trim() || '#4b5563';
    const curve = css.getPropertyValue('--chart-curve').trim() || '#ef4444';
    const target = css.getPropertyValue('--chart-target').trim() || '#059669';
    const ink = css.getPropertyValue('--text-fg').trim() || '#111113';
    const ring = css.getPropertyValue('--chart-point-ring').trim() || '#ffffff';

    const { intro, shown } = anim.current;
    const bottom = HEIGHT - PAD.bottom;
    const font = '600 12px -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
    ctx.font = font;
    ctx.lineWidth = 1;

    // Grid and axis labels
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    const steps = Math.round((1 - field.floor) * 10);
    const every = steps > 5 ? 2 : 1;
    const rows = Array.from({ length: steps + 1 }, (_, i) => i).filter((i) => i % every === 0 || i === steps);
    for (const i of rows) {
      const r = 1 - i / 10;
      const y = Math.round(yOf(r)) + 0.5;
      ctx.strokeStyle = grid;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(width - PAD.right, y);
      ctx.stroke();
      ctx.fillStyle = label;
      ctx.fillText(`${i === steps && field.floor > 0 ? '≤' : ''}${Math.round(r * 100)}%`, PAD.left - 6, y);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    let lastX = -Infinity;
    for (const d of TICK_DAYS) {
      if (d > field.maxDay) break;
      const x = xOf(d);
      if (x - lastX < 30) continue;
      lastX = x;
      ctx.fillStyle = label;
      ctx.fillText(`${d}d`, x, bottom + 18);
    }

    // Average-stability curve as the reference the points scatter around
    if (field.avgS > 0) {
      ctx.strokeStyle = curve;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i <= 80; i++) {
        const t = Math.expm1((i / 80) * Math.log1p(field.maxDay));
        const x = xOf(t);
        const r = calculateRetrievability(t, field.avgS);
        if (i === 0) ctx.moveTo(x, yOf(r));
        else ctx.lineTo(x, yOf(r));
        if (r <= field.floor) break;
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Target line
    const ty = Math.round(yOf(targetRetention)) + 0.5;
    ctx.strokeStyle = target;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD.left, ty);
    ctx.lineTo(width - PAD.right, ty);
    ctx.stroke();
    ctx.setLineDash([]);

    // Points: one path per colour keeps thousands of words inside one frame
    const radius = count > 3000 ? 1.6 : count > 600 ? 2.1 : 2.6;
    const held = new Path2D();
    const fading = new Path2D();
    for (let i = 0; i < count; i++) {
      const t = field.elapsed[i] * intro + shown;
      const r = calculateRetrievability(t, field.stability[i]);
      const x = xOf(t);
      const y = yOf(r);
      const path = r < targetRetention ? fading : held;
      path.moveTo(x + radius, y);
      path.arc(x, y, radius, 0, Math.PI * 2);
    }
    ctx.globalAlpha = count > 3000 ? 0.4 : 0.55;
    ctx.fillStyle = ink;
    ctx.fill(held);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = curve;
    ctx.fill(fading);
    ctx.globalAlpha = 1;

    if (hover && hover.index < count) {
      const t = field.elapsed[hover.index] * intro + shown;
      const r = calculateRetrievability(t, field.stability[hover.index]);
      ctx.beginPath();
      ctx.arc(xOf(t), yOf(r), 6, 0, Math.PI * 2);
      ctx.fillStyle = r < targetRetention ? curve : ink;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = ring;
      ctx.stroke();
    }
  };

  // One loop that runs only while something is moving: the intro decay, then easing toward
  // the chosen look-ahead. Idle, it stops.
  const kick = () => {
    const a = anim.current;
    if (a.raf) return;
    a.last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(64, now - a.last);
      a.last = now;
      const instant = reducedMotion();
      if (a.progress < 1) a.progress = instant ? 1 : Math.min(1, a.progress + dt / 1400);
      // Cubic ease-out, so words settle into place instead of stopping dead
      a.intro = 1 - Math.pow(1 - a.progress, 3);
      const k = instant ? 1 : 1 - Math.exp(-dt / 110);
      a.shown += (a.target - a.shown) * k;
      if (Math.abs(a.target - a.shown) < 0.01) a.shown = a.target;
      drawRef.current();
      if (a.progress < 1 || a.shown !== a.target) {
        a.raf = requestAnimationFrame(step);
      } else {
        a.raf = 0;
      }
    };
    a.raf = requestAnimationFrame(step);
  };

  // Start the intro only once the field is on screen
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      kick();
      return;
    }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        kick();
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    anim.current.target = ahead;
    kick();
  }, [ahead]);

  // Redraw on size, data, hover or theme change (a theme switch re-renders the screen)
  useEffect(() => {
    if (!anim.current.raf) drawRef.current();
  });
  useEffect(() => () => cancelAnimationFrame(anim.current.raf), []);

  const pick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const py = ((e.clientY - rect.top) / rect.height) * HEIGHT;
    let best = -1;
    let bestD = e.pointerType === 'mouse' ? 14 * 14 : 24 * 24;
    for (let i = 0; i < count; i++) {
      const t = field.elapsed[i] + ahead;
      const dx = xOf(t) - px;
      const dy = yOf(calculateRetrievability(t, field.stability[i])) - py;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) {
      setHover(null);
      return;
    }
    const t = field.elapsed[best] + ahead;
    setHover({ index: best, x: xOf(t), y: yOf(calculateRetrievability(t, field.stability[best])) });
  };

  if (count === 0) {
    return (
      <p className="flex h-[240px] items-center justify-center px-6 text-center text-sm ink-secondary">
        A curva aparece depois da primeira revisão.
      </p>
    );
  }

  const pct = (r: number) => `${Math.round(r * 100)}%`;
  const hoverCard = hover ? field.list[hover.index] : null;
  const hoverR = hover
    ? calculateRetrievability(field.elapsed[hover.index] + ahead, field.stability[hover.index])
    : 0;
  const when = ahead === 0 ? 'Hoje' : `Em ${ahead} d`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ink-secondary">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[var(--text-fg)] opacity-60" aria-hidden="true" />
          acima do alvo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[var(--chart-curve)]" aria-hidden="true" />
          abaixo de {pct(targetRetention)}
        </span>
        <span className="ml-auto tabular">{count} palavras</span>
      </div>

      <div ref={boxRef} className="relative">
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          style={{ width: '100%', height: HEIGHT, touchAction: 'pan-y' }}
          className="block cursor-crosshair"
          onPointerDown={pick}
          onPointerMove={(e) => {
            if (e.pointerType === 'mouse' || e.buttons !== 0) pick(e);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') setHover(null);
          }}
        />
        {hoverCard && hover && (
          <div
            aria-hidden="true"
            className="memory-tip sheet sheet-menu !rounded-lg absolute pointer-events-none px-2.5 py-1.5 text-xs tabular"
            style={{
              left: Math.min(Math.max(hover.x, 70), width - 70),
              top: hover.y < 70 ? hover.y + 14 : hover.y - 12,
              transform: hover.y < 70 ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
            }}
          >
            <span lang={COURSE.lang} className="hanzi-index block text-lg text-[var(--text-fg)]">
              {hoverCard.hanzi}
            </span>
            {COURSE.hasCharacters && hoverCard.pinyin && (
              <span className="block ink-secondary">{hoverCard.pinyin}</span>
            )}
            <span className={`font-semibold ${hoverR < targetRetention ? 'text-red-700 dark:text-red-300' : ''}`}>
              {pct(hoverR)}
            </span>{' '}
            <span className="ink-tertiary">S {String(hoverCard.stability.toFixed(1)).replace('.', ',')} d</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-4">
          <label htmlFor="memory-ahead" className="text-sm font-medium">{when}</label>
          <p aria-live="polite" className="text-sm tabular text-right">
            <span className={`font-semibold ${readout.below > 0 ? 'text-red-700 dark:text-red-300' : ''}`}>
              {readout.below}
            </span>
            <span className="ink-secondary"> abaixo do alvo · média {pct(readout.mean)}</span>
          </p>
        </div>
        <input
          id="memory-ahead"
          type="range"
          min={0}
          max={MAX_AHEAD}
          step={1}
          value={ahead}
          onChange={(e) => setAhead(Number(e.target.value))}
          aria-valuetext={`${when}: ${readout.below} de ${count} palavras abaixo de ${pct(targetRetention)}, retenção média ${pct(readout.mean)}`}
          style={{ '--range-fill': `${(ahead / MAX_AHEAD) * 100}%` } as React.CSSProperties}
          className="w-full accent-red-600 cursor-pointer"
        />
        <div role="group" aria-label="Daqui a" className="flex gap-1">
          {AHEAD_PRESETS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setAhead(d)}
              aria-pressed={ahead === d}
              className={`min-h-11 sm:min-h-9 px-3 rounded-lg text-sm font-medium tabular transition-colors cursor-pointer ${
                ahead === d
                  ? 'bg-black/[0.07] dark:bg-white/[0.12] text-[var(--text-fg)]'
                  : 'ink-secondary hover:text-[var(--text-fg)]'
              }`}
            >
              {d === 0 ? 'Hoje' : `${d} d`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
