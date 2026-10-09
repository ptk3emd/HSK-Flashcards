import React, { useRef, useState, useEffect } from 'react';
import HanziWriter from 'hanzi-writer';
import { RotateCcw, Eye, EyeOff, Volume2, PenTool, X, Layers, Check } from 'lucide-react';
import { speakChinese } from '../lib/speech';
import { StrokeOrderDiagram } from './StrokeOrderDiagram';

interface HanziWritingCanvasProps {
  hanzi: string;
  pinyin?: string;
  meaning?: string;
  theme: 'dark' | 'light';
  embedded?: boolean;
  onClose?: () => void;
}

type Feedback =
  | { kind: 'idle' }
  | { kind: 'correct' }
  | { kind: 'backwards' }
  | { kind: 'wrong' }
  | { kind: 'done'; mistakes: number }
  | { kind: 'error' };

const BOARD_PADDING = 16;

/** Pause after a finished character before moving to the next one in the word. */
const NEXT_CHAR_DELAY_MS = 900;

/**
 * Guided writing: each stroke the user draws is checked for order and direction.
 * A correct stroke is replaced by the clean stroke from the character data, so the
 * character builds up neatly however rough the input. A wrong stroke is rejected and
 * the expected stroke is animated on the grid; the quiz waits on it until it is drawn right.
 */
export const HanziWritingCanvas: React.FC<HanziWritingCanvasProps> = ({
  hanzi,
  pinyin,
  meaning,
  theme,
  embedded = false,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const writerHostRef = useRef<HTMLDivElement>(null);
  const writerRef = useRef<HanziWriter | null>(null);

  const characters = useMemoCharacters(hanzi);
  const [selectedCharIndex, setSelectedCharIndex] = useState(0);
  const currentChar = characters[selectedCharIndex] || characters[0] || '字';

  const [viewMode, setViewMode] = useState<'canvas' | 'strokes'>('canvas');
  const [showGuide, setShowGuide] = useState(true);
  const [gridStyle, setGridStyle] = useState<'mizige' | 'tianzige'>('mizige');
  const [size, setSize] = useState(320);
  const [quizRun, setQuizRun] = useState(0);
  const [totalStrokes, setTotalStrokes] = useState<number | null>(null);
  const [strokesDone, setStrokesDone] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>({ kind: 'idle' });
  const [medians, setMedians] = useState<number[][][]>([]);
  const [hintStroke, setHintStroke] = useState<number | null>(null);

  const isLight = theme === 'light';
  const showGuideRef = useRef(showGuide);
  showGuideRef.current = showGuide;

  useEffect(() => {
    setSelectedCharIndex(0);
  }, [hanzi]);

  useEffect(() => {
    const updateSize = () => {
      if (!containerRef.current) return;
      const available = containerRef.current.getBoundingClientRect().width - 24;
      setSize(Math.max(260, Math.min(360, Math.floor(available))));
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Creates the writer and starts the quiz for the current character
  useEffect(() => {
    const host = writerHostRef.current;
    if (viewMode !== 'canvas' || !host) return;

    host.innerHTML = '';
    setTotalStrokes(null);
    setStrokesDone(0);
    setFeedback({ kind: 'idle' });
    setMedians([]);
    setHintStroke(null);

    let disposed = false;
    let advanceTimer: number | undefined;

    const writer = HanziWriter.create(host, currentChar, {
      width: size,
      height: size,
      padding: BOARD_PADDING,
      showCharacter: false,
      showOutline: showGuideRef.current,
      strokeColor: isLight ? '#1a1a1c' : '#f5f5f4',
      outlineColor: isLight ? 'rgba(26,26,28,0.12)' : 'rgba(255,255,255,0.14)',
      drawingColor: '#ff3b30',
      drawingWidth: 6,
      highlightColor: '#f59e0b',
      highlightCompleteColor: '#10b981',
      strokeHighlightSpeed: 1.2,
      onLoadCharDataSuccess: (data) => {
        if (disposed) return;
        setTotalStrokes(data.strokes.length);
        setMedians(data.medians);
      },
      onLoadCharDataError: () => {
        if (!disposed) setFeedback({ kind: 'error' });
      },
    });
    writerRef.current = writer;

    writer.quiz({
      leniency: 1.25,
      acceptBackwardsStrokes: false,
      showHintAfterMisses: 1,
      markStrokeCorrectAfterMisses: false,
      highlightOnComplete: true,
      onCorrectStroke: (data) => {
        if (disposed) return;
        setStrokesDone(data.strokeNum + 1);
        setHintStroke(null);
        setFeedback({ kind: 'correct' });
      },
      onMistake: (data) => {
        if (disposed) return;
        setHintStroke(data.strokeNum);
        setFeedback({ kind: data.isBackwards ? 'backwards' : 'wrong' });
      },
      onComplete: ({ totalMistakes }) => {
        if (disposed) return;
        setFeedback({ kind: 'done', mistakes: totalMistakes });
        if (selectedCharIndex < characters.length - 1) {
          advanceTimer = window.setTimeout(
            () => setSelectedCharIndex((i) => Math.min(i + 1, characters.length - 1)),
            NEXT_CHAR_DELAY_MS
          );
        }
      },
    });

    return () => {
      disposed = true;
      window.clearTimeout(advanceTimer);
      try {
        writer.cancelQuiz();
      } catch {
        // writer may not have loaded yet
      }
      writerRef.current = null;
      host.innerHTML = '';
    };
  }, [currentChar, size, isLight, viewMode, quizRun, selectedCharIndex, characters.length]);

  const toggleGuide = () => {
    const next = !showGuide;
    setShowGuide(next);
    const writer = writerRef.current;
    if (!writer) return;
    if (next) writer.showOutline();
    else writer.hideOutline();
  };

  const statusText = (() => {
    switch (feedback.kind) {
      case 'correct':
        return 'Correto';
      case 'backwards':
        return 'Direção invertida. Comece no ponto e siga a seta.';
      case 'wrong':
        return 'Traço errado. Desenhe o traço indicado.';
      case 'done':
        return feedback.mistakes === 0
          ? 'Perfeito, sem erros'
          : `Concluído com ${feedback.mistakes} ${feedback.mistakes === 1 ? 'erro' : 'erros'}`;
      case 'error':
        return 'Dados de traços indisponíveis sem conexão.';
      default:
        return showGuide
          ? 'Desenhe o primeiro traço sobre a silhueta.'
          : 'Escreva de memória, um traço de cada vez.';
    }
  })();

  const statusTone =
    feedback.kind === 'backwards' || feedback.kind === 'wrong' || feedback.kind === 'error'
      ? 'text-amber-600 dark:text-amber-400'
      : feedback.kind === 'correct' || feedback.kind === 'done'
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'opacity-60';

  const toolButton =
    'min-h-9 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 active:scale-95 bg-black/5 dark:bg-white/10 border-black/5 dark:border-white/10';

  return (
    <div
      ref={containerRef}
      className={`flex flex-col items-center w-full max-w-md mx-auto p-3 rounded-3xl backdrop-blur-2xl border transition-all ${
        embedded
          ? 'shadow-xl ' + (isLight ? 'bg-white/85 border-white/95 text-ink' : 'bg-black/50 border-white/15 text-white')
          : 'shadow-2xl ' + (isLight ? 'bg-white/95 border-white text-ink' : 'bg-neutral-900/95 border-white/15 text-white')
      }`}
    >
      <div className="w-full flex items-center justify-between gap-2 mb-3 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-xl bg-red-600/15 text-red-600 dark:text-red-400">
            <PenTool className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-bold tracking-tight">Praticar escrita</h2>
            {meaning && <p className="text-[11px] opacity-60 truncate max-w-[190px]">{meaning}</p>}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewMode((prev) => (prev === 'canvas' ? 'strokes' : 'canvas'))}
            aria-pressed={viewMode === 'strokes'}
            className={`p-2 rounded-xl transition-all cursor-pointer ${
              viewMode === 'strokes'
                ? 'bg-red-600 text-white shadow-sm'
                : 'opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10'
            }`}
            title={viewMode === 'strokes' ? 'Voltar para a escrita' : 'Ver ordem dos traços'}
            aria-label={viewMode === 'strokes' ? 'Voltar para a escrita' : 'Ver ordem dos traços'}
          >
            <Layers className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => speakChinese(currentChar)}
            className="p-2 rounded-xl opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer"
            title="Ouvir caractere"
            aria-label="Ouvir caractere"
          >
            <Volume2 className="w-4 h-4" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer"
              title="Fechar"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {characters.length > 1 && (
        <div className="w-full flex items-center justify-center gap-1.5 mb-3 overflow-x-auto">
          {characters.map((char, idx) => {
            const isSelected = idx === selectedCharIndex;
            const isDone = idx < selectedCharIndex;
            return (
              <button
                key={`${char}-${idx}`}
                type="button"
                onClick={() => setSelectedCharIndex(idx)}
                aria-pressed={isSelected}
                className={`min-w-10 px-3 py-1 rounded-xl text-base font-serif font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  isSelected
                    ? 'bg-red-600 text-white shadow-md'
                    : isLight
                    ? 'bg-black/5 hover:bg-black/10 text-black/80'
                    : 'bg-white/10 hover:bg-white/20 text-white/90'
                }`}
              >
                {char}
                {isDone && <Check className="w-3 h-3" aria-label="concluído" />}
              </button>
            );
          })}
        </div>
      )}

      {viewMode === 'strokes' ? (
        <div className="w-full flex flex-col items-center">
          <StrokeOrderDiagram hanzi={currentChar} theme={theme} size={Math.min(size, 240)} showRulesTip={true} />
          <button
            type="button"
            onClick={() => setViewMode('canvas')}
            className="mt-3 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs cursor-pointer shadow-sm transition-all"
          >
            Praticar escrita
          </button>
        </div>
      ) : (
        <>
          <div
            className="relative rounded-3xl overflow-hidden shadow-inner border border-black/10 dark:border-white/15 select-none touch-none"
            style={{ width: size, height: size, backgroundColor: isLight ? '#fcfbf8' : '#14080a' }}
          >
            <CalligraphyGrid size={size} style={gridStyle} isLight={isLight} />
            <div
              ref={writerHostRef}
              className="absolute inset-0 cursor-crosshair touch-none"
              role="img"
              aria-label={`Quadro de escrita de ${currentChar}`}
            />
            {hintStroke !== null && medians[hintStroke] && (
              <StrokeHint key={`${currentChar}-${hintStroke}`} median={medians[hintStroke]} size={size} />
            )}
            {pinyin && (
              <div className="absolute top-4 left-4 text-xs font-semibold tracking-wider opacity-40 pointer-events-none">
                {pinyin}
              </div>
            )}
            {totalStrokes !== null && (
              <div className="absolute top-4 right-4 text-[11px] font-semibold tabular-nums opacity-50 pointer-events-none">
                {strokesDone}/{totalStrokes}
              </div>
            )}
          </div>

          <p className={`w-full mt-2.5 min-h-5 text-center text-xs font-medium ${statusTone}`} role="status" aria-live="polite">
            {statusText}
          </p>

          <div className="w-full flex items-center justify-between gap-1.5 mt-2 px-1">
            <button type="button" onClick={() => setQuizRun((n) => n + 1)} className={toolButton} title="Recomeçar caractere">
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="text-[11px]">Recomeçar</span>
            </button>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setGridStyle((s) => (s === 'mizige' ? 'tianzige' : 'mizige'))}
                className={toolButton}
                title="Alternar entre 米字格 e 田字格"
              >
                <span className="text-[11px]">{gridStyle === 'mizige' ? '米字格' : '田字格'}</span>
              </button>
              <button
                type="button"
                onClick={toggleGuide}
                aria-pressed={showGuide}
                className={`${toolButton} ${showGuide ? '' : 'opacity-70'}`}
                title={showGuide ? 'Ocultar silhueta' : 'Mostrar silhueta'}
              >
                {showGuide ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span className="text-[11px]">{showGuide ? 'Silhueta' : 'De memória'}</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/** Distinct Chinese characters of a word or phrase, in order. */
function useMemoCharacters(text: string): string[] {
  return React.useMemo(() => {
    if (!text) return ['字'];
    const hanziOnly = text.match(/[一-龥㐀-䶿]/g);
    if (hanziOnly && hanziOnly.length > 0) return Array.from(new Set(hanziOnly));
    const cleaned = text.replace(/\s+/g, '').split('');
    return cleaned.length > 0 ? cleaned : ['字'];
  }, [text]);
}

/**
 * The expected stroke drawn over the board until the user gets it right: a start dot,
 * then a line that keeps tracing from start to end with an arrowhead, so both the
 * shape and the direction are visible. Uses hanzi-writer's coordinate system
 * (1024 units, y up, baseline offset of 124).
 */
const StrokeHint: React.FC<{ median: number[][]; size: number }> = ({ median, size }) => {
  const scale = (size - BOARD_PADDING * 2) / 1024;
  const toScreen = ([x, y]: number[]) =>
    [x * scale + BOARD_PADDING, size - BOARD_PADDING - 124 * scale - y * scale] as const;
  const points = median.map(toScreen);
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const [sx, sy] = points[0];
  return (
    <svg className="absolute inset-0 pointer-events-none" width={size} height={size} aria-hidden="true">
      <defs>
        <marker id="stroke-hint-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="#f59e0b" />
        </marker>
      </defs>
      <path d={d} fill="none" stroke="#f59e0b" strokeOpacity="0.25" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d={d}
        className="stroke-hint-trace"
        pathLength={1}
        fill="none"
        stroke="#f59e0b"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        markerEnd="url(#stroke-hint-arrow)"
      />
      <circle cx={sx} cy={sy} r="7" fill="#f59e0b" />
    </svg>
  );
};

/** 田字格: border and dashed center cross. 米字格 adds the dashed diagonals. */
const CalligraphyGrid: React.FC<{ size: number; style: 'mizige' | 'tianzige'; isLight: boolean }> = ({
  size,
  style,
  isLight,
}) => {
  const pad = 12;
  const end = size - pad;
  const mid = size / 2;
  const border = isLight ? 'rgba(216,118,121,0.55)' : 'rgba(255,59,48,0.45)';
  const guide = isLight ? 'rgba(216,118,121,0.35)' : 'rgba(255,59,48,0.28)';
  return (
    <svg className="absolute inset-0 pointer-events-none" width={size} height={size} aria-hidden="true">
      <rect x={pad} y={pad} width={size - pad * 2} height={size - pad * 2} fill="none" stroke={border} strokeWidth="2" />
      <g stroke={guide} strokeWidth="1" strokeDasharray="4 4">
        <line x1={mid} y1={pad} x2={mid} y2={end} />
        <line x1={pad} y1={mid} x2={end} y2={mid} />
        {style === 'mizige' && (
          <>
            <line x1={pad} y1={pad} x2={end} y2={end} />
            <line x1={end} y1={pad} x2={pad} y2={end} />
          </>
        )}
      </g>
    </svg>
  );
};
