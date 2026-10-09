import React from 'react';
import { DeckConfig } from '../types/card';
import { canHideSystemBar } from './useSystemBarHidden';

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
  const isLight = theme === 'light';
  const fullscreenSupported = canHideSystemBar();

  const options: { key: ToggleKey; label: string; hint: string; disabled?: boolean }[] = [
    {
      key: 'hideSystemBar',
      label: 'Ocultar barra do sistema',
      hint: fullscreenSupported
        ? 'Tela cheia: esconde as barras do navegador e do sistema.'
        : 'Este navegador não permite tela cheia (iPhone).',
      disabled: !fullscreenSupported,
    },
    {
      key: 'hideAnswerButtons',
      label: 'Ocultar botões de resposta',
      hint: 'Toque duas vezes para ver a resposta. Deslize para a direita para Bom e para a esquerda para Novamente.',
    },
    {
      key: 'twoButtonGrading',
      label: 'Só Novamente e Bom',
      hint: 'Desativa Difícil e Fácil.',
    },
  ];

  return (
    <div className="space-y-3">
      {options.map(({ key, label, hint, disabled }) => (
        <label
          key={key}
          className={`flex items-start justify-between gap-4 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <span>
            <span className="block text-xs font-semibold">{label}</span>
            <span className={`block text-[11px] mt-0.5 leading-relaxed ${isLight ? 'text-black/60' : 'text-white/55'}`}>
              {hint}
            </span>
          </span>
          <input
            type="checkbox"
            checked={deckConfig[key] && !disabled}
            disabled={disabled}
            onChange={(e) => onUpdateDeckConfig({ ...deckConfig, [key]: e.target.checked })}
            className="mt-0.5 w-5 h-5 shrink-0 accent-red-500 cursor-pointer disabled:cursor-not-allowed"
          />
        </label>
      ))}
    </div>
  );
};
