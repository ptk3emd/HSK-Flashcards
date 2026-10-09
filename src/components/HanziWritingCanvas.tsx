import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  RotateCcw,
  Trash2,
  Eye,
  EyeOff,
  Volume2,
  PenTool,
  Check,
  X,
  Sparkles,
  Layers,
} from 'lucide-react';
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

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  points: Point[];
  color: string;
  size: number;
}

export const HanziWritingCanvas: React.FC<HanziWritingCanvasProps> = ({
  hanzi,
  pinyin,
  meaning,
  theme,
  embedded = false,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Extract individual Chinese characters (filtering out punctuation and spaces)
  const characters = useMemoCharacters(hanzi);
  const [selectedCharIndex, setSelectedCharIndex] = useState(0);

  const currentChar = characters[selectedCharIndex] || characters[0] || '字';

  // Writing state
  const [viewMode, setViewMode] = useState<'canvas' | 'strokes'>('canvas');
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [showGuide, setShowGuide] = useState(true); // Faint reference outline in grid
  const [gridStyle, setGridStyle] = useState<'mizige' | 'tianzige'>('mizige'); // 米字格 vs 田字格
  const [brushColor, setBrushColor] = useState<string>('#ff3b30'); // Default vibrant red ink
  const [brushSize, setBrushSize] = useState<number>(5);
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 320, height: 320 });

  const isLight = theme === 'light';

  // Colors available for writing brush
  const availableColors = [
    { name: 'Vermelho Imperial', value: '#ff3b30' },
    { name: 'Tinta Nanquim', value: isLight ? '#1a1a1c' : '#ffffff' },
    { name: 'Ouro Dourado', value: '#f59e0b' },
    { name: 'Jade / Esmeralda', value: '#10b981' },
    { name: 'Azul Celestial', value: '#3b82f6' },
  ];

  // Adjust canvas size responsively based on container
  useEffect(() => {
    const updateSize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const available = Math.min(rect.width - 24, 380);
      const size = Math.max(260, Math.min(360, Math.floor(available)));
      setCanvasDimensions({ width: size, height: size });
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // When active character changes, clear user strokes
  useEffect(() => {
    setStrokes([]);
    setCurrentStroke(null);
  }, [currentChar]);

  // Redraw canvas whenever strokes, guide, dimensions or theme change
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvasDimensions;
    const dpr = window.devicePixelRatio || 1;

    // Handle high DPI crispness
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // 1. Draw Grid (米字格 ou 田字格)
    drawCalligraphyGrid(ctx, width, height, gridStyle, isLight);

    // 2. Draw Faint Guide Character if enabled
    if (showGuide && currentChar) {
      drawGuideCharacter(ctx, currentChar, width, height, isLight);
    }

    // 3. Draw User Strokes with ink smoothing
    const allStrokes = currentStroke ? [...strokes, currentStroke] : strokes;
    for (const stroke of allStrokes) {
      if (stroke.points.length < 1) continue;

      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (stroke.points.length === 1) {
        ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.size / 2, 0, Math.PI * 2);
        ctx.fillStyle = stroke.color;
        ctx.fill();
        continue;
      }

      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length - 1; i++) {
        const xc = (stroke.points[i].x + stroke.points[i + 1].x) / 2;
        const yc = (stroke.points[i].y + stroke.points[i + 1].y) / 2;
        ctx.quadraticCurveTo(stroke.points[i].x, stroke.points[i].y, xc, yc);
      }
      const last = stroke.points[stroke.points.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }
  }, [canvasDimensions, gridStyle, isLight, showGuide, currentChar, strokes, currentStroke]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Pointer event handlers (touch, pen, mouse)
  const getCanvasPos = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.setPointerCapture(e.pointerId);
    }
    const pos = getCanvasPos(e);
    setCurrentStroke({
      points: [pos],
      color: brushColor,
      size: brushSize,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!currentStroke) return;
    e.preventDefault();
    const pos = getCanvasPos(e);
    setCurrentStroke((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        points: [...prev.points, pos],
      };
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (currentStroke && currentStroke.points.length > 0) {
      setStrokes((prev) => [...prev, currentStroke]);
    }
    setCurrentStroke(null);
  };

  const handleUndo = () => {
    setStrokes((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setStrokes([]);
    setCurrentStroke(null);
  };

  const handleSpeakCurrent = () => {
    speakChinese(currentChar);
  };

  return (
    <div
      ref={containerRef}
      className={`flex flex-col items-center w-full max-w-md mx-auto ${
        embedded
          ? 'p-3 rounded-3xl backdrop-blur-2xl border transition-all shadow-xl ' +
            (isLight
              ? 'bg-white/85 border-white/95 text-[#111113]'
              : 'bg-black/50 border-white/15 text-white')
          : 'p-4 rounded-3xl backdrop-blur-2xl border transition-all shadow-2xl ' +
            (isLight
              ? 'bg-white/95 border-white text-[#111113]'
              : 'bg-neutral-900/95 border-white/15 text-white')
      }`}
    >
      {/* Header bar with character switcher & close button */}
      <div className="w-full flex items-center justify-between gap-2 mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-red-600/15 text-red-600 dark:text-red-400">
            <PenTool className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-bold tracking-tight">Praticar Escrita Hanzi</h3>
            {meaning && (
              <p className="text-[11px] opacity-60 truncate max-w-[190px]">{meaning}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewMode((prev) => (prev === 'canvas' ? 'strokes' : 'canvas'))}
            className={`p-1.5 rounded-xl transition-all cursor-pointer ${
              viewMode === 'strokes'
                ? 'bg-red-600 text-white shadow-sm'
                : 'opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10'
            }`}
            title={viewMode === 'strokes' ? 'Voltar para o quadro de escrita' : 'Dica de traços (animação)'}
          >
            <Layers className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleSpeakCurrent}
            className="p-1.5 rounded-xl opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer"
            title="Ouvir caractere"
          >
            <Volume2 className="w-4 h-4" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition-all cursor-pointer"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Multi-character Tabs if word contains more than 1 character */}
      {characters.length > 1 && (
        <div className="w-full flex items-center justify-center gap-1.5 mb-3 px-2 py-1.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 overflow-x-auto">
          <span className="text-[10px] font-bold uppercase opacity-50 mr-1 flex-shrink-0">
            Caractere:
          </span>
          {characters.map((char, idx) => {
            const isSelected = idx === selectedCharIndex;
            return (
              <button
                key={`${char}-${idx}`}
                type="button"
                onClick={() => setSelectedCharIndex(idx)}
                className={`px-3 py-1 rounded-xl text-base font-serif font-bold transition-all cursor-pointer flex items-center gap-1 ${
                  isSelected
                    ? 'bg-red-600 text-white shadow-md scale-105'
                    : isLight
                    ? 'bg-white/80 hover:bg-white text-black/80'
                    : 'bg-white/10 hover:bg-white/20 text-white/90'
                }`}
              >
                <span>{char}</span>
                <span className="text-[10px] font-sans opacity-70 font-normal">
                  ({idx + 1}/{characters.length})
                </span>
              </button>
            );
          })}
        </div>
      )}

      {viewMode === 'strokes' ? (
        <div className="w-full flex flex-col items-center animate-in fade-in duration-200">
          <StrokeOrderDiagram
            hanzi={currentChar}
            theme={theme}
            size={Math.min(canvasDimensions.width, 240)}
            showRulesTip={true}
          />
          <button
            type="button"
            onClick={() => setViewMode('canvas')}
            className="mt-3 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs cursor-pointer shadow-sm transition-all"
          >
            Praticar no Quadro de Escrita
          </button>
        </div>
      ) : (
        <>
          {/* Canvas Area with Tian/Mi Zi Ge Grid */}
          <div
            className="relative rounded-3xl overflow-hidden shadow-inner border border-black/10 dark:border-white/15 select-none touch-none"
        style={{
          width: canvasDimensions.width,
          height: canvasDimensions.height,
          backgroundColor: isLight ? '#fcfbf8' : '#14080a',
        }}
      >
        <canvas
          ref={canvasRef}
          width={canvasDimensions.width}
          height={canvasDimensions.height}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="cursor-crosshair block w-full h-full touch-none"
        />

        {/* Faint Pinyin Label inside top-left corner */}
        {pinyin && (
          <div className="absolute top-2.5 left-3 text-xs font-semibold tracking-wider opacity-40 select-none pointer-events-none">
            {pinyin}
          </div>
        )}
      </div>

      {/* Canvas Controls Toolbar */}
      <div className="w-full flex items-center justify-between gap-1.5 mt-3 px-1">
        {/* Undo & Clear */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleUndo}
            disabled={strokes.length === 0}
            className="p-2 rounded-xl border backdrop-blur-md text-xs font-semibold transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 shadow-xs active:scale-95 bg-black/5 dark:bg-white/10 border-black/5 dark:border-white/10"
            title="Desfazer último traço (Ctrl+Z)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="text-[11px] hidden sm:inline">Desfazer</span>
          </button>

          <button
            type="button"
            onClick={handleClear}
            disabled={strokes.length === 0}
            className="p-2 rounded-xl border backdrop-blur-md text-xs font-semibold transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1 shadow-xs active:scale-95 bg-black/5 dark:bg-white/10 border-black/5 dark:border-white/10"
            title="Limpar quadro"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="text-[11px] hidden sm:inline">Limpar</span>
          </button>
        </div>

        {/* Grid & Guide Toggles */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setGridStyle((s) => (s === 'mizige' ? 'tianzige' : 'mizige'))}
            className="px-2.5 py-1.5 rounded-xl border backdrop-blur-md text-xs font-semibold transition-all cursor-pointer shadow-xs active:scale-95 bg-black/5 dark:bg-white/10 border-black/5 dark:border-white/10"
            title="Alternar entre 米字格 (com diagonais) e 田字格 (cruzeta)"
          >
            <span className="text-[11px]">
              {gridStyle === 'mizige' ? '米字格' : '田字格'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setShowGuide((g) => !g)}
            className={`px-2.5 py-1.5 rounded-xl border backdrop-blur-md text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shadow-xs active:scale-95 ${
              showGuide
                ? 'bg-red-600 text-white border-red-500'
                : 'bg-black/5 dark:bg-white/10 border-black/5 dark:border-white/10 opacity-70'
            }`}
            title={showGuide ? 'Ocultar caractere guia (Modo Teste)' : 'Mostrar caractere guia (Modo Prática)'}
          >
            {showGuide ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span className="text-[11px]">{showGuide ? 'Guia Ativo' : 'Teste Cego'}</span>
          </button>
        </div>
      </div>

      {/* Color Palette & Brush Size Selector */}
      <div className="w-full flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-black/5 dark:border-white/10 px-1">
        {/* Colors */}
        <div className="flex items-center gap-1.5">
          {availableColors.map((col) => {
            const isSelected = brushColor === col.value;
            return (
              <button
                key={col.value}
                type="button"
                onClick={() => setBrushColor(col.value)}
                className={`w-6 h-6 rounded-full transition-transform cursor-pointer flex items-center justify-center border ${
                  isSelected ? 'scale-125 ring-2 ring-red-400/80 shadow-md' : 'opacity-80 hover:opacity-100 hover:scale-110'
                }`}
                style={{
                  backgroundColor: col.value,
                  borderColor: isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.25)',
                }}
                title={col.name}
              >
                {isSelected && (
                  <Check
                    className={`w-3.5 h-3.5 stroke-[3] ${
                      col.value === '#ffffff' || col.value === '#f59e0b' ? 'text-black' : 'text-white'
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Brush Size */}
        <div className="flex items-center gap-1 bg-black/5 dark:bg-white/10 p-1 rounded-xl">
          {[3, 5, 8].map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setBrushSize(size)}
              className={`w-6 h-6 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center ${
                brushSize === size
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'opacity-60 hover:opacity-100'
              }`}
              title={`Pincel ${size === 3 ? 'Fino' : size === 5 ? 'Médio' : 'Espesso'}`}
            >
              {size === 3 ? '•' : size === 5 ? '●' : '⬤'}
            </button>
          ))}
        </div>
      </div>

      {/* Helpful instruction hint */}
      <div className="w-full mt-2.5 pt-1.5 text-center text-[11px] opacity-60">
        {showGuide
          ? 'Trace os traços sobre a silhueta ou pratique a proporção do caractere.'
          : 'Modo Teste: escreva de memória e clique em "Guia Ativo" para comparar!'}
      </div>
    </>
  )}
</div>
  );
};

/**
 * Extracts distinct Chinese characters from a word or phrase
 */
function useMemoCharacters(text: string): string[] {
  return React.useMemo(() => {
    if (!text) return ['字'];
    // Filter non-Chinese characters or symbols (keep Chinese hanzi)
    const hanziOnly = text.match(/[\u4e00-\u9fa5]/g);
    if (hanziOnly && hanziOnly.length > 0) {
      return Array.from(new Set(hanziOnly));
    }
    // Fallback: return raw clean chars if no ideographs matched
    const cleaned = text.replace(/\s+/g, '').split('');
    return cleaned.length > 0 ? cleaned : ['字'];
  }, [text]);
}

/**
 * Draws the traditional calligraphy grid:
 * - 田字格: outer square + dashed center cross
 * - 米字格: outer square + dashed center cross + dashed diagonals
 */
function drawCalligraphyGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  style: 'mizige' | 'tianzige',
  isLight: boolean
) {
  const padding = 12;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const cx = width / 2;
  const cy = height / 2;

  // Grid border color
  ctx.strokeStyle = isLight ? 'rgba(216, 118, 121, 0.55)' : 'rgba(255, 59, 48, 0.45)';
  ctx.lineWidth = 2;
  ctx.strokeRect(padding, padding, innerW, innerH);

  // Inner guidelines
  ctx.strokeStyle = isLight ? 'rgba(216, 118, 121, 0.35)' : 'rgba(255, 59, 48, 0.28)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);

  // Center vertical line
  ctx.beginPath();
  ctx.moveTo(cx, padding);
  ctx.lineTo(cx, height - padding);
  ctx.stroke();

  // Center horizontal line
  ctx.beginPath();
  ctx.moveTo(padding, cy);
  ctx.lineTo(width - padding, cy);
  ctx.stroke();

  // Diagonal lines for 米字格
  if (style === 'mizige') {
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(width - padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.stroke();
  }

  ctx.setLineDash([]); // Reset line dash
}

/**
 * Draws the faint reference character centered in the grid
 */
function drawGuideCharacter(
  ctx: CanvasRenderingContext2D,
  char: string,
  width: number,
  height: number,
  isLight: boolean
) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Chinese calligraphy serif font
  const fontSize = Math.floor(width * 0.72);
  ctx.font = `600 ${fontSize}px "Noto Serif SC", "STSong", "Songti SC", serif`;

  // Faint watermark style
  ctx.fillStyle = isLight ? 'rgba(30, 30, 35, 0.14)' : 'rgba(255, 255, 255, 0.18)';
  ctx.fillText(char, width / 2, height / 2 + fontSize * 0.04);

  // Fine stroke outline for extra precision
  ctx.strokeStyle = isLight ? 'rgba(216, 118, 121, 0.35)' : 'rgba(255, 59, 48, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeText(char, width / 2, height / 2 + fontSize * 0.04);

  ctx.restore();
}
