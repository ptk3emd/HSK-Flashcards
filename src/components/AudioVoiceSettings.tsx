import React, { useState, useEffect } from 'react';
import { Volume2, Play, Check, Sparkles, User, UserCheck, RefreshCw } from 'lucide-react';
import { DeckConfig, VoiceGenderPreference } from '../types/card';
import {
  speakChinese,
  getBrowserChineseVoices,
  getVoiceDisplayLabel,
  detectVoiceGender,
} from '../lib/speech';

interface AudioVoiceSettingsProps {
  deckConfig: DeckConfig;
  onUpdateDeckConfig: (config: DeckConfig) => void;
  theme?: 'dark' | 'light';
  compact?: boolean;
}

const SPEED_PRESETS = [
  { label: '0.6x Lento', value: 0.6 },
  { label: '0.75x Suave', value: 0.75 },
  { label: '0.85x Ideal', value: 0.85 },
  { label: '1.0x Normal', value: 1.0 },
  { label: '1.2x Nativo', value: 1.2 },
];

export const AudioVoiceSettings: React.FC<AudioVoiceSettingsProps> = ({
  deckConfig,
  onUpdateDeckConfig,
  theme = 'dark',
  compact = false,
}) => {
  const isLight = theme === 'light';
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isPlayingTest, setIsPlayingTest] = useState(false);
  const [sampleText, setSampleText] = useState('你好！很高兴认识你。');

  // Load and subscribe to voices
  useEffect(() => {
    const updateVoices = () => {
      const v = getBrowserChineseVoices();
      setVoices(v);
    };

    updateVoices();

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }

    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  const handleGenderChange = (gender: VoiceGenderPreference) => {
    let nextVoiceURI = deckConfig.speechVoiceURI || '';

    // If changing gender and the currently selected voice doesn't match the new gender, auto-pick a matching voice
    if (gender !== 'auto' && voices.length > 0) {
      const matchingVoice = voices.find((v) => detectVoiceGender(v) === gender);
      if (matchingVoice) {
        nextVoiceURI = matchingVoice.voiceURI;
      }
    }

    onUpdateDeckConfig({
      ...deckConfig,
      speechVoiceGender: gender,
      speechVoiceURI: nextVoiceURI,
    });
  };

  const handleSpeedChange = (speed: number) => {
    onUpdateDeckConfig({
      ...deckConfig,
      speechSpeed: speed,
    });
  };

  const handleVoiceURIChange = (uri: string) => {
    // If selecting a specific voice, automatically infer its gender
    let nextGender = deckConfig.speechVoiceGender;
    if (uri) {
      const found = voices.find((v) => v.voiceURI === uri);
      if (found) {
        const detected = detectVoiceGender(found);
        if (detected !== 'unknown') {
          nextGender = detected;
        }
      }
    }

    onUpdateDeckConfig({
      ...deckConfig,
      speechVoiceURI: uri,
      speechVoiceGender: nextGender,
    });
  };

  const handleTestAudio = () => {
    setIsPlayingTest(true);
    speakChinese(sampleText, {
      rate: deckConfig.speechSpeed,
      gender: deckConfig.speechVoiceGender,
      voiceURI: deckConfig.speechVoiceURI,
    });

    setTimeout(() => {
      setIsPlayingTest(false);
    }, 1800);
  };

  const activeGender = deckConfig.speechVoiceGender || 'auto';
  const currentSpeed = deckConfig.speechSpeed || 0.85;

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-9 h-9 rounded-2xl flex items-center justify-center ${
              isLight ? 'bg-red-500/10 text-red-600' : 'bg-red-500/20 text-red-400'
            }`}
          >
            <Volume2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className={`text-sm sm:text-base font-bold ${isLight ? 'text-black' : 'text-white'}`}>
              Voz Nativa do Navegador (TTS Chinês)
            </h2>
            <p className={`text-xs ${isLight ? 'text-black/60 font-medium' : 'text-white/50'}`}>
              Configuração de gênero e velocidade para cartões, dicionário e escrita
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleTestAudio}
          disabled={isPlayingTest}
          className={`px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 ${
            isLight
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-red-600 hover:bg-red-500 text-white'
          } disabled:opacity-50`}
        >
          <Play className={`w-3.5 h-3.5 fill-current ${isPlayingTest ? 'animate-pulse' : ''}`} />
          <span>{isPlayingTest ? 'Ouvindo...' : 'Testar Voz'}</span>
        </button>
      </div>

      {/* 1. Escolha de Gênero da Voz */}
      <div className="space-y-2.5">
        <label className={`text-xs font-bold flex items-center justify-between ${isLight ? 'text-black/80' : 'text-white/80'}`}>
          <span>Gênero da Voz:</span>
          <span className="text-[11px] font-normal opacity-70">
            {activeGender === 'female'
              ? 'Feminino selecionado'
              : activeGender === 'male'
              ? 'Masculino selecionado'
              : 'Automático / Padrão'}
          </span>
        </label>

        <div className="grid grid-cols-3 gap-2.5">
          {/* Feminino */}
          <button
            type="button"
            onClick={() => handleGenderChange('female')}
            className={`p-3 rounded-2xl border flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeGender === 'female'
                ? isLight
                  ? 'bg-rose-50 border-rose-500 text-rose-700 shadow-sm ring-1 ring-rose-500'
                  : 'bg-rose-500/20 border-rose-400 text-rose-300 shadow-sm ring-1 ring-rose-400'
                : isLight
                ? 'bg-white/80 border-black/10 hover:border-black/25 text-black/75'
                : 'bg-white/5 border-white/10 hover:border-white/20 text-white/70'
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm">
              <User className="w-4 h-4 text-rose-500" />
              <span>Feminino</span>
            </div>
            <span className="text-[10px] opacity-70">Voz feminina / Aguda</span>
          </button>

          {/* Masculino */}
          <button
            type="button"
            onClick={() => handleGenderChange('male')}
            className={`p-3 rounded-2xl border flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeGender === 'male'
                ? isLight
                  ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm ring-1 ring-blue-500'
                  : 'bg-blue-500/20 border-blue-400 text-blue-300 shadow-sm ring-1 ring-blue-400'
                : isLight
                ? 'bg-white/80 border-black/10 hover:border-black/25 text-black/75'
                : 'bg-white/5 border-white/10 hover:border-white/20 text-white/70'
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm">
              <User className="w-4 h-4 text-blue-500" />
              <span>Masculino</span>
            </div>
            <span className="text-[10px] opacity-70">Voz masculina / Grave</span>
          </button>

          {/* Automático / Sistema */}
          <button
            type="button"
            onClick={() => handleGenderChange('auto')}
            className={`p-3 rounded-2xl border flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeGender === 'auto'
                ? isLight
                  ? 'bg-amber-50 border-amber-500 text-amber-800 shadow-sm ring-1 ring-amber-500'
                  : 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-sm ring-1 ring-amber-400'
                : isLight
                ? 'bg-white/80 border-black/10 hover:border-black/25 text-black/75'
                : 'bg-white/5 border-white/10 hover:border-white/20 text-white/70'
            }`}
          >
            <div className="flex items-center gap-1.5 font-bold text-xs sm:text-sm">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Automático</span>
            </div>
            <span className="text-[10px] opacity-70">Padrão do navegador</span>
          </button>
        </div>
      </div>

      {/* 2. Escolha de Velocidade da Voz */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className={`text-xs font-bold ${isLight ? 'text-black/80' : 'text-white/80'}`}>
            Velocidade de Reprodução:
          </label>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs px-2 py-0.5 rounded-lg font-mono font-bold ${
                isLight ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-red-500/20 text-red-300 border border-red-500/30'
              }`}
            >
              {currentSpeed.toFixed(2)}x
            </span>
            <span className={`text-[11px] ${isLight ? 'text-black/60' : 'text-white/50'}`}>
              {currentSpeed <= 0.65
                ? '(Muito Lento)'
                : currentSpeed <= 0.8
                ? '(Suave)'
                : currentSpeed <= 0.95
                ? '(Recomendado)'
                : currentSpeed <= 1.1
                ? '(Normal)'
                : '(Rápido)'}
            </span>
          </div>
        </div>

        {/* Slider */}
        <input
          type="range"
          min="0.5"
          max="1.4"
          step="0.05"
          value={currentSpeed}
          aria-label="Velocidade da voz"
          onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
          className="w-full accent-red-500 cursor-pointer h-2 rounded-lg"
        />

        {/* Presets rápidos */}
        <div className="flex flex-wrap items-center gap-1.5">
          {SPEED_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => handleSpeedChange(preset.value)}
              className={`min-h-11 sm:min-h-0 px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                Math.abs(currentSpeed - preset.value) < 0.02
                  ? isLight
                    ? 'bg-red-600 text-white border-red-600 shadow-xs'
                    : 'bg-red-600 text-white border-red-600 shadow-xs'
                  : isLight
                  ? 'bg-white/80 hover:bg-black/5 text-black/70 border-black/10'
                  : 'bg-white/5 hover:bg-white/10 text-white/70 border-white/10'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Seletor de Voz Específica do Sistema */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className={`text-xs font-bold ${isLight ? 'text-black/80' : 'text-white/80'}`}>
            Voz Específica Instalada no Navegador:
          </label>
          <span className={`text-[11px] ${isLight ? 'text-black/50' : 'text-white/40'}`}>
            {voices.length > 0 ? `${voices.length} vozes em Mandarim encontradas` : 'Síntese nativa do sistema'}
          </span>
        </div>

        {voices.length > 0 ? (
          <div className="relative">
            <select
              value={deckConfig.speechVoiceURI || ''}
              onChange={(e) => handleVoiceURIChange(e.target.value)}
              className={`w-full px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm font-medium border appearance-none transition-colors cursor-pointer focus:ring-2 focus:ring-red-500/50 ${
                isLight
                  ? 'bg-white border-black/15 text-black shadow-xs'
                  : 'bg-black/40 border-white/15 text-white'
              }`}
            >
              <option value="">
                Seleção Inteligente Automática (baseada no gênero: {activeGender === 'female' ? 'Feminino' : activeGender === 'male' ? 'Masculino' : 'Padrão'})
              </option>
              {voices.map((v, idx) => {
                const label = getVoiceDisplayLabel(v);
                const voiceVal = v.voiceURI || v.name;
                const uniqueKey = `voice-opt-${voiceVal}-${v.lang || ''}-${idx}`;
                return (
                  <option key={uniqueKey} value={voiceVal}>
                    {label.genderBadge} • {label.title} [{label.langTag}]
                  </option>
                );
              })}
            </select>
          </div>
        ) : (
          <div
            className={`p-3 rounded-2xl border text-xs leading-relaxed ${
              isLight
                ? 'bg-amber-50/70 border-amber-200/80 text-amber-900'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-200'
            }`}
          >
            <p>
              O navegador está usando o sintetizador nativo de fala do sistema operacional. O Hanzi Anki modula dinamicamente a entonação (pitch/formante) para reproduzir o timbre <strong>feminino</strong> ou <strong>masculino</strong> escolhido.
            </p>
          </div>
        )}
      </div>

      {/* 4. Caixa de Teste Interativa */}
      <div
        className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row items-stretch sm:items-center gap-3 ${
          isLight ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/10'
        }`}
      >
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between text-[11px] font-bold opacity-75">
            <span>Texto de Amostra para Testar:</span>
            <span>Nǐ hǎo! Hěn gāoxìng rènshí nǐ.</span>
          </div>
          <input
            type="text"
            value={sampleText}
            onChange={(e) => setSampleText(e.target.value)}
            placeholder="Digite qualquer frase em Hanzi..."
            className={`w-full px-3 py-1.5 rounded-xl text-xs border transition-all ${
              isLight
                ? 'bg-white border-black/15 text-black'
                : 'bg-black/50 border-white/15 text-white'
            }`}
          />
        </div>

        <button
          type="button"
          onClick={handleTestAudio}
          disabled={isPlayingTest}
          className="self-end sm:self-center px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm active:scale-95 disabled:opacity-50"
        >
          <Volume2 className="w-4 h-4" />
          <span>{isPlayingTest ? 'Reproduzindo...' : 'Ouvir Agora'}</span>
        </button>
      </div>

      {/* 5. Opção de Áudio Automático nos Cartões */}
      <div
        className={`pt-3 border-t flex items-center justify-between ${
          isLight ? 'border-black/10' : 'border-white/10'
        }`}
      >
        <div>
          <div className={`text-xs font-bold ${isLight ? 'text-black' : 'text-white'}`}>
            Pronúncia Automática ao Revelar
          </div>
          <div className={`text-[11px] ${isLight ? 'text-black/60 font-medium' : 'text-white/50'}`}>
            Tocar áudio automaticamente ao virar para o verso do cartão
          </div>
        </div>

        <input
          type="checkbox"
          aria-label="Tocar áudio automaticamente ao virar o cartão"
          checked={deckConfig.autoPlayAudio}
          onChange={(e) =>
            onUpdateDeckConfig({
              ...deckConfig,
              autoPlayAudio: e.target.checked,
            })
          }
          className="w-5 h-5 accent-red-500 rounded-md cursor-pointer"
        />
      </div>
    </div>
  );
};
