import React from 'react';
import { X, Settings2, Sliders, Brain, Volume2 } from 'lucide-react';
import { DeckConfig, FSRSOptions } from '../types/card';
import { AudioVoiceSettings } from './AudioVoiceSettings';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  deckConfig: DeckConfig;
  onUpdateDeckConfig: (config: DeckConfig) => void;
  fsrsOptions: FSRSOptions;
  onUpdateFSRSOptions: (options: FSRSOptions) => void;
  theme?: 'dark' | 'light';
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  deckConfig,
  onUpdateDeckConfig,
  fsrsOptions,
  onUpdateFSRSOptions,
  theme = 'dark',
}) => {
  if (!isOpen) return null;

  const isLight = theme === 'light';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border shadow-2xl transition-all p-5 sm:p-7 ${
          isLight
            ? 'bg-white/95 border-white shadow-red-500/10 text-[#111113]'
            : 'bg-[#180a0c]/95 border-white/15 text-white'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-black/10 dark:border-white/10 mb-6">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                isLight ? 'bg-red-500/15 text-red-600' : 'bg-red-500/25 text-red-400'
              }`}
            >
              <Settings2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Configurações</h2>
              <p className={`text-xs ${isLight ? 'text-black/60' : 'text-white/50'}`}>
                Voz do navegador e repetição espaçada
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl transition-all cursor-pointer ${
              isLight
                ? 'hover:bg-black/5 text-black/70'
                : 'hover:bg-white/10 text-white/70'
            }`}
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section 1: Voz Nativa do Navegador */}
        <div
          className={`p-5 rounded-3xl border mb-6 ${
            isLight
              ? 'bg-rose-50/40 border-rose-100'
              : 'bg-white/5 border-white/10'
          }`}
        >
          <AudioVoiceSettings
            deckConfig={deckConfig}
            onUpdateDeckConfig={onUpdateDeckConfig}
            theme={theme}
          />
        </div>

        {/* Section 2: Repetição Espaçada */}
        <div
          className={`p-5 rounded-3xl border space-y-4 mb-6 ${
            isLight
              ? 'bg-white border-black/10 shadow-xs'
              : 'bg-white/5 border-white/10'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                isLight ? 'bg-blue-50 text-blue-600' : 'bg-blue-500/20 text-blue-400'
              }`}
            >
              <Brain className="w-4 h-4" />
            </div>
            <div>
              <h3 className={`text-sm font-bold ${isLight ? 'text-black' : 'text-white'}`}>
                Repetição Espaçada
              </h3>
              <p className={`text-xs ${isLight ? 'text-black/60' : 'text-white/50'}`}>
                Ajuste os intervalos de estudo e metas diárias
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <div className="flex justify-between text-xs font-semibold">
              <span>Retenção desejada:</span>
              <span className="text-red-500 font-bold">
                {Math.round(fsrsOptions.request_retention * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.80"
              max="0.97"
              step="0.01"
              value={fsrsOptions.request_retention}
              onChange={(e) =>
                onUpdateFSRSOptions({
                  ...fsrsOptions,
                  request_retention: parseFloat(e.target.value),
                })
              }
              className="w-full accent-red-500 cursor-pointer"
            />
            <p className={`text-[11px] leading-relaxed ${isLight ? 'text-black/60' : 'text-white/50'}`}>
              90% é o valor ótimo padrão. Quanto maior, mais frequentes serão as repetições para garantir fixação máxima.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-black/5 dark:border-white/10">
            <div>
              <label className={`block text-xs font-semibold mb-1 ${isLight ? 'text-black/80' : 'text-white/80'}`}>
                Novos Cartões / Dia:
              </label>
              <input
                type="number"
                min="5"
                max="100"
                value={deckConfig.dailyNewLimit}
                onChange={(e) =>
                  onUpdateDeckConfig({
                    ...deckConfig,
                    dailyNewLimit: parseInt(e.target.value, 10) || 20,
                  })
                }
                className={`w-full px-3 py-1.5 rounded-xl text-xs border outline-none font-semibold ${
                  isLight
                    ? 'bg-white border-black/15 text-black'
                    : 'bg-black/40 border-white/15 text-white'
                }`}
              />
            </div>

            <div>
              <label className={`block text-xs font-semibold mb-1 ${isLight ? 'text-black/80' : 'text-white/80'}`}>
                Máximo de Revisões / Dia:
              </label>
              <input
                type="number"
                min="20"
                max="500"
                value={deckConfig.dailyReviewLimit}
                onChange={(e) =>
                  onUpdateDeckConfig({
                    ...deckConfig,
                    dailyReviewLimit: parseInt(e.target.value, 10) || 100,
                  })
                }
                className={`w-full px-3 py-1.5 rounded-xl text-xs border outline-none font-semibold ${
                  isLight
                    ? 'bg-white border-black/15 text-black'
                    : 'bg-black/40 border-white/15 text-white'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs sm:text-sm shadow-md transition-all cursor-pointer active:scale-95"
          >
            Concluir & Salvar
          </button>
        </div>
      </div>
    </div>
  );
};
