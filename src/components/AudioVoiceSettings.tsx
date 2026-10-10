import React, { useState, useEffect } from 'react';
import { Volume2, Play } from 'lucide-react';
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
  { label: '0,6', value: 0.6 },
  { label: '0,75', value: 0.75 },
  { label: '0,85', value: 0.85 },
  { label: '1,0', value: 1.0 },
  { label: '1,2', value: 1.2 },
];

export const AudioVoiceSettings: React.FC<AudioVoiceSettingsProps> = ({
  deckConfig,
  onUpdateDeckConfig,
  theme = 'dark',
  compact = false,
}) => {
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

  const segmentGroup = 'flex gap-0.5 p-0.5 rounded-xl bg-black/[0.05] dark:bg-white/[0.07]';
  const segment = (active: boolean) =>
    `min-h-10 px-3 rounded-[10px] text-sm font-medium cursor-pointer transition-colors ${
      active
        ? 'bg-white text-ink shadow-sm dark:bg-white/20 dark:text-white'
        : 'ink-secondary hover:text-[var(--text-fg)]'
    }`;

  return (
    <div>
      <div className="flex items-center justify-between gap-4 pb-3">
        <h2 className="text-base font-semibold">Voz</h2>
        <button
          type="button"
          onClick={handleTestAudio}
          disabled={isPlayingTest}
          className="min-h-10 px-3.5 rounded-xl text-sm font-medium flex items-center gap-1.5 cursor-pointer transition-colors bg-black/[0.05] hover:bg-black/[0.09] dark:bg-white/[0.08] dark:hover:bg-white/[0.14] disabled:opacity-50"
        >
          <Play aria-hidden="true" className={`w-3.5 h-3.5 fill-current ${isPlayingTest ? 'animate-pulse' : ''}`} />
          <span>{isPlayingTest ? 'Tocando' : 'Testar'}</span>
        </button>
      </div>

      <div className="ledger border-t border-[var(--separator)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3">
          <span id="voice-gender" className="text-sm">Timbre</span>
          <div role="group" aria-labelledby="voice-gender" className={segmentGroup}>
            {(
              [
                { id: 'female', label: 'Feminino' },
                { id: 'male', label: 'Masculino' },
                { id: 'auto', label: 'Automático' },
              ] as const
            ).map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => handleGenderChange(g.id)}
                aria-pressed={activeGender === g.id}
                className={segment(activeGender === g.id)}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="py-3 space-y-2">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="voice-speed" className="text-sm">Velocidade</label>
            <span className="tabular text-sm font-semibold">{currentSpeed.toFixed(2).replace('.', ',')}×</span>
          </div>
          <input
            id="voice-speed"
            type="range"
            min="0.5"
            max="1.4"
            step="0.05"
            value={currentSpeed}
            onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
            className="w-full accent-red-600 cursor-pointer"
          />
          <div role="group" aria-label="Velocidades predefinidas" className="flex flex-wrap gap-1">
            {SPEED_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => handleSpeedChange(preset.value)}
                aria-pressed={Math.abs(currentSpeed - preset.value) < 0.02}
                className={segment(Math.abs(currentSpeed - preset.value) < 0.02)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3">
          <label htmlFor="voice-uri" className="text-sm shrink-0">Voz do sistema</label>
          {voices.length > 0 ? (
            <select
              id="voice-uri"
              value={deckConfig.speechVoiceURI || ''}
              onChange={(e) => handleVoiceURIChange(e.target.value)}
              className="sm:max-w-xs w-full min-h-11 px-3 rounded-xl text-sm border cursor-pointer bg-white/60 border-black/10 dark:bg-black/30 dark:border-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
            >
              <option value="">Automática</option>
              {voices.map((v, idx) => {
                const label = getVoiceDisplayLabel(v);
                const voiceVal = v.voiceURI || v.name;
                return (
                  <option key={`voice-opt-${voiceVal}-${v.lang || ''}-${idx}`} value={voiceVal}>
                    {label.title} [{label.langTag}]
                  </option>
                );
              })}
            </select>
          ) : (
            <span id="voice-uri" className="text-sm ink-tertiary">Síntese nativa</span>
          )}
        </div>

        <div className="flex items-center gap-2 py-3">
          <label htmlFor="voice-sample" className="sr-only">Frase de teste</label>
          <input
            id="voice-sample"
            type="text"
            lang="zh-CN"
            value={sampleText}
            onChange={(e) => setSampleText(e.target.value)}
            placeholder="你好！很高兴认识你。"
            className="flex-1 min-w-0 min-h-11 px-3 rounded-xl text-sm border bg-white/60 border-black/10 dark:bg-black/30 dark:border-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
          />
          <button
            type="button"
            onClick={handleTestAudio}
            disabled={isPlayingTest}
            aria-label="Ouvir frase"
            className="size-11 shrink-0 rounded-xl flex items-center justify-center cursor-pointer transition-colors bg-black/[0.05] hover:bg-black/[0.09] dark:bg-white/[0.08] dark:hover:bg-white/[0.14] disabled:opacity-50"
          >
            <Volume2 aria-hidden="true" className="w-[18px] h-[18px]" />
          </button>
        </div>

        <label className="flex items-center justify-between gap-4 py-3 cursor-pointer">
          <span className="text-sm">Tocar ao revelar</span>
          <input
            type="checkbox"
            checked={deckConfig.autoPlayAudio}
            onChange={(e) => onUpdateDeckConfig({ ...deckConfig, autoPlayAudio: e.target.checked })}
            className="w-5 h-5 accent-red-600 cursor-pointer"
          />
        </label>
      </div>
    </div>
  );
};
