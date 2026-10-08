/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Card, DeckConfig, FSRSOptions } from './types/card';
import {
  loadCards,
  saveCards,
  loadDeckConfig,
  saveDeckConfig,
  loadFSRSOptions,
  saveFSRSOptions,
  getStoredTheme,
  saveStoredTheme,
} from './lib/storage';
import { StudySession } from './components/StudySession';
import { DeckDashboard } from './components/DeckDashboard';
import { CardBrowser } from './components/CardBrowser';
import { StatsView } from './components/StatsView';
import { AudioVoiceSettings } from './components/AudioVoiceSettings';
import {
  Layers,
  Search,
  BarChart3,
  Moon,
  Sun,
  Settings2,
  Sparkles,
} from 'lucide-react';

export default function App() {
  const [cards, setCards] = useState<Card[]>([]);
  const [deckConfig, setDeckConfig] = useState<DeckConfig>(loadDeckConfig());
  const [fsrsOptions, setFSRSOptions] = useState<FSRSOptions>(loadFSRSOptions());
  const [theme, setTheme] = useState<'dark' | 'light'>(getStoredTheme());
  const [activeTab, setActiveTab] = useState<'study' | 'decks' | 'browser' | 'stats' | 'settings'>('decks');
  const [isolatedStudyLevel, setIsolatedStudyLevel] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load cards on initial mount
  useEffect(() => {
    const initialCards = loadCards();
    setCards(initialCards);
    setIsLoaded(true);
  }, []);

  const handleUpdateCards = (updatedCards: Card[]) => {
    setCards(updatedCards);
    saveCards(updatedCards);
  };

  const handleAddCards = (newCards: Card[]) => {
    const existingIds = new Set(cards.map(c => c.id));
    const toAdd = newCards.filter(c => !existingIds.has(c.id));
    const merged = [...cards, ...toAdd];
    handleUpdateCards(merged);
  };

  const handleUpdateDeckConfig = (config: DeckConfig) => {
    setDeckConfig(config);
    saveDeckConfig(config);
  };

  const handleUpdateFSRSOptions = (options: FSRSOptions) => {
    setFSRSOptions(options);
    saveFSRSOptions(options);
  };

  const handleToggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    saveStoredTheme(nextTheme);
  };

  const handleStartStudy = (isolatedLevel?: string | null) => {
    setIsolatedStudyLevel(isolatedLevel || null);
    setActiveTab('study');
  };

  const handleUpdateSingleCard = (updated: Card) => {
    const nextCards = cards.map(c => (c.id === updated.id ? updated : c));
    handleUpdateCards(nextCards);
  };

  const isLight = theme === 'light';

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#160608] text-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500" />
      </div>
    );
  }

  // Full-screen focused study mode
  if (activeTab === 'study') {
    return (
      <StudySession
        cards={cards}
        deckConfig={deckConfig}
        fsrsOptions={fsrsOptions}
        theme={theme}
        isolatedLevel={isolatedStudyLevel}
        onSelectIsolatedLevel={setIsolatedStudyLevel}
        onAddCards={handleAddCards}
        onToggleTheme={handleToggleTheme}
        onUpdateCards={handleUpdateCards}
        onUpdateDeckConfig={handleUpdateDeckConfig}
        onExit={() => setActiveTab('decks')}
      />
    );
  }

  return (
    <div
      className={`min-h-screen w-full transition-colors duration-300 font-sans ${
        isLight
          ? 'card-theme-light text-[#111113]'
          : 'night_mode card-theme-dark bg-[#160608] text-white'
      }`}
    >
      {/* Main Content Area without Topbar */}
      <main className="max-w-5xl mx-auto px-4 pt-6 pb-28 sm:pb-28">
        {activeTab === 'decks' && (
          <DeckDashboard
            cards={cards}
            deckConfig={deckConfig}
            theme={theme}
            onUpdateDeckConfig={handleUpdateDeckConfig}
            onStartStudy={handleStartStudy}
            onAddCards={handleAddCards}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === 'browser' && (
          <CardBrowser
            cards={cards}
            theme={theme}
            deckConfig={deckConfig}
            speechSpeed={deckConfig.speechSpeed}
            onUpdateCard={handleUpdateSingleCard}
            onAddCards={handleAddCards}
          />
        )}

        {activeTab === 'stats' && (
          <StatsView
            cards={cards}
            theme={theme}
            fsrsOptions={fsrsOptions}
            deckConfig={deckConfig}
          />
        )}

        {activeTab === 'settings' && (
          <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-200">
            {/* Header */}
            <div
              className={`rounded-3xl p-6 sm:p-7 backdrop-blur-xl border transition-all ${
                isLight
                  ? 'bg-white/80 border-black/5 shadow-sm text-[#111113]'
                  : 'bg-white/[0.04] border-white/10 text-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-extrabold tracking-tight">Configurações</h1>
                  <p className={`text-xs mt-1 ${isLight ? 'text-black/60' : 'text-white/60'}`}>
                    Voz, repetição espaçada e aparência
                  </p>
                </div>

                {/* Theme Toggle Button in Settings */}
                <button
                  type="button"
                  onClick={handleToggleTheme}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl border text-xs font-bold transition-all cursor-pointer ${
                    isLight
                      ? 'bg-black/5 hover:bg-black/10 border-black/10 text-black'
                      : 'bg-white/10 hover:bg-white/15 border-white/10 text-white'
                  }`}
                  title="Alternar tema"
                >
                  {isLight ? (
                    <>
                      <Moon className="w-4 h-4 text-slate-800" />
                      <span>Modo Escuro</span>
                    </>
                  ) : (
                    <>
                      <Sun className="w-4 h-4 text-amber-300" />
                      <span>Modo Claro</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* 1. Voz Nativa do Navegador */}
            <div
              className={`rounded-3xl p-6 sm:p-7 backdrop-blur-xl border transition-all ${
                isLight
                  ? 'bg-white/80 border-black/5 shadow-sm text-[#111113]'
                  : 'bg-white/[0.04] border-white/10 text-white'
              }`}
            >
              <AudioVoiceSettings
                deckConfig={deckConfig}
                onUpdateDeckConfig={handleUpdateDeckConfig}
                theme={theme}
              />
            </div>

            {/* 2. Repetição Espaçada */}
            <div
              className={`rounded-3xl p-6 sm:p-7 backdrop-blur-xl border space-y-5 transition-all ${
                isLight
                  ? 'bg-white/80 border-black/5 shadow-sm text-[#111113]'
                  : 'bg-white/[0.04] border-white/10 text-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold">Repetição Espaçada</h2>
                  <p className={`text-xs mt-0.5 ${isLight ? 'text-black/60' : 'text-white/60'}`}>
                    Intervalos de revisão e metas diárias
                  </p>
                </div>
              </div>

              {/* Slider de Retenção */}
              <div className="space-y-2">
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
                    handleUpdateFSRSOptions({
                      ...fsrsOptions,
                      request_retention: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-red-500 cursor-pointer"
                />
                <p className={`text-[11px] ${isLight ? 'text-black/50' : 'text-white/50'}`}>
                  Padrão 90%. Controla a probabilidade desejada de lembrar a palavra no momento da revisão.
                </p>
              </div>

              {/* Limites Diários */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-black/5 dark:border-white/10">
                <div>
                  <label className={`block text-xs font-semibold mb-1 ${isLight ? 'text-black/80' : 'text-white/80'}`}>
                    Novos cartões / dia:
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="100"
                    value={deckConfig.dailyNewLimit}
                    onChange={(e) =>
                      handleUpdateDeckConfig({
                        ...deckConfig,
                        dailyNewLimit: parseInt(e.target.value, 10) || 20,
                      })
                    }
                    className={`w-full px-3 py-2 rounded-xl text-xs border outline-none font-semibold ${
                      isLight
                        ? 'bg-black/[0.03] border-black/15 text-black'
                        : 'bg-black/40 border-white/15 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-xs font-semibold mb-1 ${isLight ? 'text-black/80' : 'text-white/80'}`}>
                    Máximo de revisões / dia:
                  </label>
                  <input
                    type="number"
                    min="20"
                    max="500"
                    value={deckConfig.dailyReviewLimit}
                    onChange={(e) =>
                      handleUpdateDeckConfig({
                        ...deckConfig,
                        dailyReviewLimit: parseInt(e.target.value, 10) || 100,
                      })
                    }
                    className={`w-full px-3 py-2 rounded-xl text-xs border outline-none font-semibold ${
                      isLight
                        ? 'bg-black/[0.03] border-black/15 text-black'
                        : 'bg-black/40 border-white/15 text-white'
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Minimalist Floating Navigation Dock */}
      <nav
        className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-40 backdrop-blur-2xl border px-2 sm:px-3 py-2 rounded-2xl shadow-xl flex items-center gap-1 sm:gap-2 transition-all ${
          isLight
            ? 'bg-white/90 border-black/10 shadow-black/5 text-[#111113]'
            : 'bg-[#180a0c]/90 border-white/15 shadow-black/40 text-white'
        }`}
      >
        <button
          type="button"
          onClick={() => setActiveTab('decks')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'decks'
              ? 'bg-red-600 text-white shadow-sm'
              : isLight
              ? 'text-black/70 hover:text-black hover:bg-black/5'
              : 'text-white/70 hover:text-white hover:bg-white/5'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span className="hidden sm:inline">Decks</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('browser')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'browser'
              ? 'bg-red-600 text-white shadow-sm'
              : isLight
              ? 'text-black/70 hover:text-black hover:bg-black/5'
              : 'text-white/70 hover:text-white hover:bg-white/5'
          }`}
        >
          <Search className="w-4 h-4" />
          <span className="hidden sm:inline">Dicionário</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('stats')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'stats'
              ? 'bg-red-600 text-white shadow-sm'
              : isLight
              ? 'text-black/70 hover:text-black hover:bg-black/5'
              : 'text-white/70 hover:text-white hover:bg-white/5'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span className="hidden sm:inline">Estatísticas</span>
        </button>

        <div className="w-[1px] h-4 bg-black/10 dark:bg-white/10 mx-0.5" />

        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'settings'
              ? 'bg-red-600 text-white shadow-sm'
              : isLight
              ? 'text-black/70 hover:text-black hover:bg-black/5'
              : 'text-white/70 hover:text-white hover:bg-white/5'
          }`}
        >
          <Settings2 className="w-4 h-4" />
          <span className="hidden sm:inline">Configurações</span>
        </button>
      </nav>
    </div>
  );
}
