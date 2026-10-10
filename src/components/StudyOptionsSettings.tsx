import React from 'react';
import { DeckConfig } from '../types/card';
import { canHideSystemBar } from './useSystemBarHidden';
import { GestureSettings } from './GestureSettings';

interface StudyOptionsSettingsProps {
  deckConfig: DeckConfig;
  onUpdateDeckConfig: (config: DeckConfig) => void;
  theme: 'dark' | 'light';
}

type ToggleKey = 'hideSystemBar' | 'hideAnswerButtons' | 'twoButtonGrading';

export const StudyOptionsSettings: React.FC<StudyOptionsSettingsProps> = ({
  deckConfig,
  onUpdateDeckConfig,
  theme,
}) => {
  const fullscreenSupported = canHideSystemBar();

  const options: { key: ToggleKey; label: string; hint: string; disabled?: boolean }[] = [
    {
      key: 'hideSystemBar',
      label: 'Ocultar barra do sistema',
      hint: fullscreenSupported
        ? 'Tela cheia no estudo'
        : 'Indisponível neste navegador',
      disabled: !fullscreenSupported,
    },
    {
      key: 'hideAnswerButtons',
      label: 'Ocultar botões de resposta',
      hint: 'Responder só com gestos',
    },
    {
      key: 'twoButtonGrading',
      label: 'Só Novamente e Bom',
      hint: 'Sem Difícil e Fácil',
    },
  ];

  return (
    <div>
      <div className="ledger border-t border-[var(--separator)]">
        {options.map(({ key, label, hint, disabled }) => (
          <label
            key={key}
            className={`flex items-center justify-between gap-4 py-3 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className="min-w-0">
              <span className="block text-sm">{label}</span>
              <span className="block text-xs ink-tertiary">{hint}</span>
            </span>
            <input
              type="checkbox"
              checked={deckConfig[key] && !disabled}
              disabled={disabled}
              onChange={(e) => onUpdateDeckConfig({ ...deckConfig, [key]: e.target.checked })}
              className="w-5 h-5 shrink-0 accent-red-600 cursor-pointer disabled:cursor-not-allowed"
            />
          </label>
        ))}
      </div>
      <div className="pt-4 border-t border-[var(--separator)]">
        <GestureSettings deckConfig={deckConfig} onUpdateDeckConfig={onUpdateDeckConfig} theme={theme} />
      </div>
    </div>
  );
};
