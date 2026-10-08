import React, { useEffect, useRef, useState, useMemo } from 'react';
import HanziWriter from 'hanzi-writer';
import {
  Play,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Info,
  ChevronDown,
  ChevronUp,
  X,
  Gauge,
  Layers,
} from 'lucide-react';

interface StrokeOrderDiagramProps {
  hanzi: string;
  theme: 'dark' | 'light';
  size?: number;
  compact?: boolean;
  showRulesTip?: boolean;
  onClose?: () => void;
  autoPlay?: boolean;
}

// Extract only CJK unified ideographs
function extractHanziCharacters(text: string): string[] {
  if (!text) return [];
  // Strip any HTML tags first
  const clean = text.replace(/<[^>]*>/g, '');
  const matches = clean.match(/[\u4e00-\u9fa5\u3400-\u4dbf]/g);
  return matches && matches.length > 0 ? matches : [];
}

const STROKE_RULES = [
  { rule: 'De cima para baixo', example: '三 (sān)', note: 'Traços superiores precedem os inferiores' },
  { rule: 'Da esquerda para a direita', example: '你 (nǐ)', note: 'Radicais e partes à esquerda são desenhados primeiro' },
  { rule: 'Primeiro horizontal, depois vertical', example: '十 (shí)', note: 'O traço horizontal que cruza vem antes da haste' },
  { rule: 'Primeiro diagonal esquerda (撇), depois direita (捺)', example: '人 (rén)', note: 'Traço descendente esquerdo antes do direito' },
  { rule: 'De fora para dentro', example: '月 (yuè)', note: 'Estruturas envoltórias externas precedem o interior' },
  { rule: 'Centro antes dos lados', example: '小 (xiǎo)', note: 'Em caracteres simétricos, o centro tem prioridade' },
  { rule: 'Entrar antes de fechar a moldura', example: '国 (guó), 回 (huí)', note: 'Preencha o conteúdo interno antes de fechar o fundo' },
];

export const StrokeOrderDiagram: React.FC<StrokeOrderDiagramProps> = ({
  hanzi,
  theme,
  size = 200,
  compact = false,
  showRulesTip = true,
  onClose,
  autoPlay = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const writerRef = useRef<HanziWriter | null>(null);

  const characters = useMemo(() => extractHanziCharacters(hanzi), [hanzi]);
  const [selectedCharIndex, setSelectedCharIndex] = useState(0);

  const currentChar = characters[selectedCharIndex] || characters[0] || '';

  const [totalStrokes, setTotalStrokes] = useState<number | null>(null);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [speed, setSpeed] = useState<0.5 | 1.0>(1.0);
  const [showRules, setShowRules] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const isLight = theme === 'light';

  // Initialize or update HanziWriter when character, size, speed or theme changes
  useEffect(() => {
    if (!containerRef.current || !currentChar) return;

    // Reset state
    setLoadError(false);
    setIsLoading(true);
    setCurrentStep(0);
    setIsAnimating(false);
    containerRef.current.innerHTML = '';

    const strokeColor = isLight ? '#1c1917' : '#f5f5f4';
    const radicalColor = '#dc2626';
    const outlineColor = isLight ? '#e2e8f0' : '#334155';

    try {
      const writer = HanziWriter.create(containerRef.current, currentChar, {
        width: size,
        height: size,
        padding: 12,
        showOutline: true,
        showCharacter: false,
        strokeAnimationSpeed: speed,
        delayBetweenStrokes: 120,
        strokeColor,
        radicalColor,
        outlineColor,
        onLoadCharDataError: () => {
          setLoadError(true);
          setIsLoading(false);
        },
        onLoadCharDataSuccess: (data) => {
          setIsLoading(false);
          setTotalStrokes(data.strokes ? data.strokes.length : null);
          if (autoPlay) {
            handlePlayAnimation(writer);
          }
        },
      });

      writerRef.current = writer;
    } catch {
      setLoadError(true);
      setIsLoading(false);
    }

    return () => {
      if (writerRef.current) {
        try {
          writerRef.current.pauseAnimation();
        } catch {
          // ignore cleanup error
        }
        writerRef.current = null;
      }
    };
  }, [currentChar, size, speed, isLight]);

  // Handle Play Animation
  const handlePlayAnimation = (instance?: HanziWriter) => {
    const writer = instance || writerRef.current;
    if (!writer) return;

    setIsAnimating(true);
    setCurrentStep(0);
    writer.hideCharacter();
    writer.animateCharacter({
      onComplete: () => {
        setIsAnimating(false);
        if (totalStrokes) {
          setCurrentStep(totalStrokes);
        }
      },
    });
  };

  // Reset character to outline
  const handleReset = () => {
    const writer = writerRef.current;
    if (!writer) return;

    try {
      writer.pauseAnimation();
    } catch {
      // ignore
    }
    setIsAnimating(false);
    setCurrentStep(0);
    writer.hideCharacter();
  };

  // Step-by-step next stroke
  const handleNextStroke = () => {
    const writer = writerRef.current;
    if (!writer || !totalStrokes) return;

    if (currentStep < totalStrokes) {
      const nextStrokeNum = currentStep;
      writer.animateStroke(nextStrokeNum, {
        onComplete: () => {
          setCurrentStep(nextStrokeNum + 1);
        },
      });
    }
  };

  // Step-by-step prev stroke
  const handlePrevStroke = () => {
    const writer = writerRef.current;
    if (!writer || !totalStrokes) return;

    if (currentStep > 1) {
      const targetStep = currentStep - 1;
      writer.hideCharacter();
      for (let i = 0; i < targetStep; i++) {
        writer.animateStroke(i);
      }
      setCurrentStep(targetStep);
    } else {
      handleReset();
    }
  };

  if (!currentChar) {
    return null;
  }

  return (
    <div
      className={`w-full flex flex-col items-center ${
        compact ? 'p-2' : 'p-4'
      }`}
    >
      {/* Top Header if close button exists */}
      {onClose && (
        <div className="w-full flex items-center justify-between pb-3 mb-2 border-b border-black/10 dark:border-white/10">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-lg bg-red-600/10 text-red-600 dark:text-red-400">
              <Layers className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold tracking-tight">Ordem dos Traços</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer transition-all"
            aria-label="Fechar diagrama"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Multi-character selector if vocabulary contains more than 1 character */}
      {characters.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mb-3 p-1 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
          {characters.map((char, index) => {
            const isSelected = index === selectedCharIndex;
            return (
              <button
                key={`${char}-${index}`}
                type="button"
                onClick={() => setSelectedCharIndex(index)}
                className={`px-3 py-1 rounded-xl text-base font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-red-600 text-white shadow-sm'
                    : isLight
                    ? 'text-stone-700 hover:bg-black/5'
                    : 'text-stone-300 hover:bg-white/10'
                }`}
              >
                {char}
              </button>
            );
          })}
        </div>
      )}

      {/* Grid + HanziWriter Canvas Container */}
      <div className="relative flex items-center justify-center rounded-2xl overflow-hidden border border-black/10 dark:border-white/15 bg-white/50 dark:bg-black/40 shadow-inner">
        {/* Calligraphy Grid Background (米字格) */}
        <svg
          className="absolute inset-0 pointer-events-none opacity-40 dark:opacity-30"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
        >
          {/* Border */}
          <rect
            x="1"
            y="1"
            width={size - 2}
            height={size - 2}
            fill="none"
            stroke={isLight ? '#cbd5e1' : '#475569'}
            strokeWidth="1.5"
          />
          {/* Dashed Horizontal */}
          <line
            x1="0"
            y1={size / 2}
            x2={size}
            y2={size / 2}
            stroke={isLight ? '#e2e8f0' : '#334155'}
            strokeWidth="1"
            strokeDasharray="4 4"
          />
          {/* Dashed Vertical */}
          <line
            x1={size / 2}
            y1="0"
            x2={size / 2}
            y2={size}
            stroke={isLight ? '#e2e8f0' : '#334155'}
            strokeWidth="1"
            strokeDasharray="4 4"
          />
          {/* Dashed Diagonals */}
          <line
            x1="0"
            y1="0"
            x2={size}
            y2={size}
            stroke={isLight ? '#f1f5f9' : '#1e293b'}
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          <line
            x1={size}
            y1="0"
            x2="0"
            y2={size}
            stroke={isLight ? '#f1f5f9' : '#1e293b'}
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        </svg>

        {/* Fallback if data fails or is offline */}
        {loadError && (
          <div
            className="flex flex-col items-center justify-center text-center p-4 z-10"
            style={{ width: size, height: size }}
          >
            <span className="text-5xl font-black">{currentChar}</span>
            <span className="text-[11px] opacity-60 mt-2">Dica offline disponível</span>
          </div>
        )}

        {/* HanziWriter mount target */}
        <div
          ref={containerRef}
          style={{ width: size, height: size }}
          className={`flex items-center justify-center relative z-10 transition-opacity duration-200 ${
            isLoading ? 'opacity-40' : 'opacity-100'
          }`}
        />
      </div>

      {/* Stroke Counter & Controls */}
      <div className="w-full mt-3 flex flex-col items-center gap-2">
        {/* Stroke progress tag */}
        <div className="flex items-center justify-between w-full max-w-[260px] text-xs font-semibold px-1">
          <span className="opacity-70">
            {totalStrokes ? `${totalStrokes} traços no total` : 'Carregando traços...'}
          </span>
          {totalStrokes && currentStep > 0 && (
            <span className="text-red-600 dark:text-red-400 font-bold">
              Traço {currentStep} de {totalStrokes}
            </span>
          )}
        </div>

        {/* Action Buttons Toolbar */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
          {/* Step Prev */}
          <button
            type="button"
            onClick={handlePrevStroke}
            disabled={!totalStrokes || currentStep <= 0}
            className="p-2 rounded-xl opacity-80 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all"
            title="Traço anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Animate all / Play */}
          <button
            type="button"
            onClick={() => handlePlayAnimation()}
            disabled={isAnimating}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs cursor-pointer shadow-sm transition-all disabled:opacity-50"
            title="Animar todos os traços"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Animar</span>
          </button>

          {/* Step Next */}
          <button
            type="button"
            onClick={handleNextStroke}
            disabled={!totalStrokes || (totalStrokes > 0 && currentStep >= totalStrokes)}
            className="p-2 rounded-xl opacity-80 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all"
            title="Próximo traço"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Reset button */}
          <button
            type="button"
            onClick={handleReset}
            className="p-2 rounded-xl opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer transition-all"
            title="Limpar / Reiniciar"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Speed Toggle */}
          <button
            type="button"
            onClick={() => setSpeed((prev) => (prev === 1.0 ? 0.5 : 1.0))}
            className="flex items-center gap-0.5 px-2 py-1.5 rounded-xl text-xs font-bold opacity-80 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer transition-all"
            title={speed === 1.0 ? 'Velocidade normal (1.0x). Clique para velocidade lenta (0.5x)' : 'Velocidade lenta (0.5x). Clique para velocidade normal'}
          >
            <Gauge className="w-3.5 h-3.5" />
            <span>{speed}x</span>
          </button>
        </div>
      </div>

      {/* Collapsible Stroke Order Rules Educational Section */}
      {showRulesTip && (
        <div className="w-full mt-3">
          <button
            type="button"
            onClick={() => setShowRules((prev) => !prev)}
            className="w-full flex items-center justify-between p-2 rounded-xl text-xs font-semibold opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-all"
          >
            <div className="flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
              <span>Regras Básicas de Traçado (Bǐshùn)</span>
            </div>
            {showRules ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showRules && (
            <div className="mt-2 p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs space-y-2 animate-in fade-in duration-200">
              {STROKE_RULES.map((item, idx) => (
                <div key={idx} className="flex flex-col gap-0.5 border-b border-black/5 dark:border-white/5 pb-1.5 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between font-bold">
                    <span>{idx + 1}. {item.rule}</span>
                    <span className="text-red-600 dark:text-red-400">{item.example}</span>
                  </div>
                  <p className="text-[11px] opacity-70">{item.note}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
