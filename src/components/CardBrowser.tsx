import React, { useState, useMemo } from 'react';
import { Card, CardState, DeckConfig } from '../types/card';
import { speakChinese } from '../lib/speech';
import { ALL_HSK_LEVELS, loadNativeLevelCards } from '../data/defaultDecks';
import { Search, Volume2, Eye, RotateCcw, Loader2, PenTool, X, Layers } from 'lucide-react';
import { MandarinCardView } from './MandarinCardView';
import { HanziWritingCanvas } from './HanziWritingCanvas';
import { StrokeOrderDiagram } from './StrokeOrderDiagram';

interface CardBrowserProps {
  cards: Card[];
  theme: 'dark' | 'light';
  speechSpeed?: number;
  deckConfig?: DeckConfig;
  onUpdateCard: (updatedCard: Card) => void;
  onAddCards: (newCards: Card[]) => void;
}

export const CardBrowser: React.FC<CardBrowserProps> = ({
  cards,
  theme,
  speechSpeed = 0.85,
  deckConfig,
  onUpdateCard,
  onAddCards,
}) => {
  const [search, setSearch] = useState('');
  const [searchTarget, setSearchTarget] = useState<'all' | 'hanzi' | 'pinyin' | 'meaning'>('all');
  const [selectedLevel, setSelectedLevel] = useState<string>('all');
  const [selectedState, setSelectedState] = useState<string>('all');
  const [previewCard, setPreviewCard] = useState<Card | null>(null);
  const [isPreviewFlipped, setIsPreviewFlipped] = useState(false);
  const [isLoadingLevel, setIsLoadingLevel] = useState(false);
  const [writingCard, setWritingCard] = useState<Card | null>(null);
  const [strokeOrderCard, setStrokeOrderCard] = useState<Card | null>(null);

  const isLight = theme === 'light';

  const handleSpeakWord = (text: string) => {
    speakChinese(text, {
      rate: deckConfig?.speechSpeed ?? speechSpeed,
      gender: deckConfig?.speechVoiceGender,
      voiceURI: deckConfig?.speechVoiceURI,
    });
  };

  // Helper function to normalize pinyin accents for lenient search (e.g. nǐhǎo -> nihao)
  const normalizeText = (text: string) => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ü/g, 'u')
      .replace(/v/g, 'u');
  };

  // Check if selected level is already loaded
  const isLevelLoaded = useMemo(() => {
    if (selectedLevel === 'all') return true;
    return cards.some(c => c.level === selectedLevel);
  }, [cards, selectedLevel]);

  const handleLoadSelectedLevel = async () => {
    if (selectedLevel === 'all') return;
    setIsLoadingLevel(true);
    try {
      const nativeCards = await loadNativeLevelCards(selectedLevel);
      onAddCards(nativeCards);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingLevel(false);
    }
  };

  const filteredCards = useMemo(() => {
    const rawQ = search.trim();
    const q = rawQ.toLowerCase();
    const normalizedQ = normalizeText(rawQ);

    return cards.filter((card) => {
      if (selectedLevel !== 'all' && card.level !== selectedLevel) {
        return false;
      }
      if (selectedState !== 'all') {
        const stateNum = parseInt(selectedState, 10);
        if (card.state !== stateNum) return false;
      }
      if (!rawQ) return true;

      const hanziMatch =
        card.hanzi.toLowerCase().includes(q) ||
        (card.traditional ? card.traditional.toLowerCase().includes(q) : false);

      const pinyinMatch =
        card.pinyin.toLowerCase().includes(q) ||
        normalizeText(card.pinyin).includes(normalizedQ);

      const meaningMatch = card.ptbr.toLowerCase().includes(q);

      if (searchTarget === 'hanzi') {
        return hanziMatch;
      }
      if (searchTarget === 'pinyin') {
        return pinyinMatch;
      }
      if (searchTarget === 'meaning') {
        return meaningMatch;
      }
      // 'all'
      return hanziMatch || pinyinMatch || meaningMatch;
    });
  }, [cards, search, searchTarget, selectedLevel, selectedState]);

  const getStateBadge = (state: CardState) => {
    switch (state) {
      case 0:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-500/20 text-blue-600 dark:text-blue-300 font-bold">
            Novo
          </span>
        );
      case 1:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-red-500/20 text-red-600 dark:text-red-300 font-bold">
            Aprendendo
          </span>
        );
      case 2:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 font-bold">
            Revisão
          </span>
        );
      case 3:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-600 dark:text-amber-300 font-bold">
            Reaprendendo
          </span>
        );
    }
  };

  const handleResetCard = (card: Card) => {
    const reset: Card = {
      ...card,
      state: 0,
      due: new Date().toISOString(),
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0,
      last_review: undefined,
    };
    onUpdateCard(reset);
    if (previewCard?.id === card.id) {
      setPreviewCard(reset);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Search and Filters Header */}
      <div
        className={`rounded-3xl p-5 backdrop-blur-xl border transition-all ${
          isLight
            ? 'bg-white/70 border-white/80 shadow-md text-[#111113]'
            : 'bg-white/5 border-white/10 text-white'
        }`}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  searchTarget === 'hanzi'
                    ? 'Pesquisar caractere chinês (ex: 你好, 水)...'
                    : searchTarget === 'pinyin'
                    ? 'Pesquisar pinyin (ex: nihao, nǐ hǎo)...'
                    : searchTarget === 'meaning'
                    ? 'Pesquisar tradução (ex: olá, água)...'
                    : 'Pesquisar chinês, pinyin ou tradução...'
                }
                className={`w-full pl-10 pr-9 py-2.5 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400/50 border transition-all ${
                  isLight
                    ? 'bg-white/90 border-black/10 text-black placeholder-black/40'
                    : 'bg-black/30 border-white/10 text-white placeholder-white/40'
                }`}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Limpar busca"
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 opacity-60 hover:opacity-100 transition-all cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Target Filter Select / Badges */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] opacity-60 font-semibold mr-1 hidden md:inline">
                Filtrar por:
              </span>
              {(
                [
                  { id: 'all', label: 'Tudo' },
                  { id: 'hanzi', label: 'Caractere' },
                  { id: 'pinyin', label: 'Pinyin' },
                  { id: 'meaning', label: 'Tradução' },
                ] as const
              ).map((tab) => {
                const isActive = searchTarget === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSearchTarget(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      isActive
                        ? isLight
                          ? 'bg-black text-white shadow-sm'
                          : 'bg-white text-black shadow-sm'
                        : isLight
                        ? 'bg-black/5 hover:bg-black/10 text-black/70'
                        : 'bg-white/5 hover:bg-white/10 text-white/70'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-black/5 dark:border-white/5">
            <div className="flex items-center gap-2">
              <select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value)}
                aria-label="Filtrar por nível HSK"
                className={`px-3 py-2 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-red-400/50 border cursor-pointer ${
                  isLight
                    ? 'bg-white/90 border-black/10 text-black'
                    : 'bg-black/30 border-white/10 text-white'
                }`}
              >
                <option value="all" className="bg-white dark:bg-neutral-900">Todos os Níveis</option>
                {ALL_HSK_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl} className="bg-white dark:bg-neutral-900">
                    {lvl}
                  </option>
                ))}
              </select>

              <select
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
                aria-label="Filtrar por estado FSRS"
                className={`px-3 py-2 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-red-400/50 border cursor-pointer ${
                  isLight
                    ? 'bg-white/90 border-black/10 text-black'
                    : 'bg-black/30 border-white/10 text-white'
                }`}
              >
                <option value="all" className="bg-white dark:bg-neutral-900">Todos os Estados</option>
                <option value="0" className="bg-white dark:bg-neutral-900">Novos (0)</option>
                <option value="1" className="bg-white dark:bg-neutral-900">Aprendendo (1)</option>
                <option value="2" className="bg-white dark:bg-neutral-900">Revisão (2)</option>
                <option value="3" className="bg-white dark:bg-neutral-900">Reaprendendo (3)</option>
              </select>
            </div>

            <div className="text-xs opacity-60">
              {search && (
                <span>
                  Filtro: {searchTarget === 'hanzi' ? 'Caractere chinês' : searchTarget === 'pinyin' ? 'Pinyin' : searchTarget === 'meaning' ? 'Tradução' : 'Geral'} ({filteredCards.length} {filteredCards.length === 1 ? 'resultado' : 'resultados'})
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Load level banner if level not yet active in memory */}
        {!isLevelLoaded && (
          <div className="mt-3 p-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-between text-xs">
            <span className="font-semibold text-amber-800 dark:text-amber-200">
              O nível {selectedLevel} está disponível nativamente no app mas ainda não foi carregado.
            </span>
            <button
              type="button"
              onClick={handleLoadSelectedLevel}
              disabled={isLoadingLevel}
              className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold cursor-pointer transition-all flex items-center gap-1.5"
            >
              {isLoadingLevel ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : null}
              <span>Carregar {selectedLevel} Nativo</span>
            </button>
          </div>
        )}

        <div className="text-xs opacity-60 flex items-center justify-between mt-3 pt-2 border-t border-black/5 dark:border-white/5">
          <span>Mostrando {filteredCards.length} de {cards.length} vocábulos</span>
          <span>Dicionário Nativo HSK 1 a 9</span>
        </div>
      </div>

      {/* Cards Table */}
      <div
        className={`rounded-3xl overflow-hidden backdrop-blur-xl border transition-all ${
          isLight
            ? 'bg-white/70 border-white/80 shadow-md text-[#111113]'
            : 'bg-white/5 border-white/10 text-white'
        }`}
      >
        <div className="max-h-[600px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead
              className={`font-semibold sticky top-0 backdrop-blur-md z-10 border-b ${
                isLight
                  ? 'bg-white/90 text-black/70 border-black/10'
                  : 'bg-white/10 text-white/70 border-white/10'
              }`}
            >
              <tr>
                <th className="p-3 w-16">Nível</th>
                <th className="p-3">Hanzi</th>
                <th className="p-3">Pinyin</th>
                <th className="p-3">Significado</th>
                <th className="p-3 text-center">Estado</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/5">
              {filteredCards.slice(0, 150).map((card, idx) => (
                <tr
                  key={`${card.id}-${idx}`}
                  className={`transition-colors ${
                    isLight ? 'hover:bg-black/5' : 'hover:bg-white/5'
                  }`}
                >
                  <td className="p-3 font-bold opacity-75">{card.level}</td>
                  <td className="p-3">
                    <span className="font-serif font-black text-lg">
                      {card.hanzi}
                    </span>
                    {card.traditional && card.traditional !== card.hanzi && (
                      <span className="ml-1 text-[11px] opacity-40">
                        ({card.traditional})
                      </span>
                    )}
                  </td>
                  <td className="p-3 font-semibold opacity-90">{card.pinyin}</td>
                  <td
                    className="p-3 max-w-xs truncate opacity-90"
                    dangerouslySetInnerHTML={{ __html: card.ptbr }}
                  />
                  <td className="p-3 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      {getStateBadge(card.state)}
                      {card.state > 0 && (
                        <span className="text-[10px] opacity-50">
                          S:{card.stability.toFixed(1)} D:{card.difficulty.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setStrokeOrderCard(card)}
                        className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                          isLight
                            ? 'bg-red-50 hover:bg-red-100 text-red-600'
                            : 'bg-red-500/15 hover:bg-red-500/25 text-red-400'
                        }`}
                        title="Ver ordem dos traços"
                      >
                        <Layers className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setWritingCard(card)}
                        className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                          isLight
                            ? 'bg-black/5 hover:bg-black/10 text-black'
                            : 'bg-white/10 hover:bg-white/20 text-white'
                        }`}
                        title="Praticar escrita do Hanzi"
                      >
                        <PenTool className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSpeakWord(card.hanzi)}
                        className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                          isLight
                            ? 'bg-black/5 hover:bg-black/10 text-black'
                            : 'bg-white/10 hover:bg-white/20 text-white'
                        }`}
                        title="Ouvir pronúncia"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewCard(card);
                          setIsPreviewFlipped(false);
                        }}
                        className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                          isLight
                            ? 'bg-black/5 hover:bg-black/10 text-black'
                            : 'bg-white/10 hover:bg-white/20 text-white'
                        }`}
                        title="Visualizar Cartão Acrílico"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredCards.length > 150 && (
            <div className="p-3 text-center text-xs opacity-60 border-t border-black/5 dark:border-white/5">
              Exibindo os primeiros 150 vocábulos. Digite na busca acima para filtrar.
            </div>
          )}
        </div>
      </div>

      {/* Card Preview Modal */}
      {previewCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in">
          <div
            className={`w-full max-w-xl rounded-3xl p-6 relative flex flex-col items-center gap-4 shadow-2xl border ${
              isLight
                ? 'bg-white/95 border-white text-[#111113]'
                : 'bg-neutral-900 border-white/20 text-white'
            }`}
          >
            <div className="w-full flex items-center justify-between pb-2 border-b border-black/10 dark:border-white/10">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">{previewCard.level}</span>
                {getStateBadge(previewCard.state)}
              </div>
              <button
                type="button"
                onClick={() => setPreviewCard(null)}
                className="opacity-60 hover:opacity-100 text-sm font-semibold cursor-pointer flex items-center gap-1"
              >
                <X className="w-4 h-4" />
                <span>Fechar</span>
              </button>
            </div>

            {/* Acrylic Card preview */}
            <div
              className="w-full py-4 cursor-pointer"
              onClick={() => setIsPreviewFlipped(!isPreviewFlipped)}
            >
              <MandarinCardView
                card={previewCard}
                isFlipped={isPreviewFlipped}
                onSpeak={() => handleSpeakWord(previewCard.hanzi)}
                onOpenWriting={() => setWritingCard(previewCard)}
                onOpenStrokeOrder={() => setStrokeOrderCard(previewCard)}
              />
            </div>

            <div className="w-full flex items-center justify-between pt-2 border-t border-black/10 dark:border-white/10 text-xs opacity-75">
              <span>Clique no cartão para virar (Frente / Verso)</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStrokeOrderCard(previewCard)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold cursor-pointer transition-all border ${
                    isLight
                      ? 'bg-black/5 hover:bg-black/10 text-[#111113] border-black/10'
                      : 'bg-white/10 hover:bg-white/20 text-white border-white/15'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Ordem dos Traços</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWritingCard(previewCard)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer transition-all shadow-sm"
                >
                  <PenTool className="w-3.5 h-3.5" />
                  <span>Praticar Escrita</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleResetCard(previewCard)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-300 font-bold cursor-pointer transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Resetar Progresso</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stroke Order Diagram Modal */}
      {strokeOrderCard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setStrokeOrderCard(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-sm rounded-3xl p-5 shadow-2xl border animate-in zoom-in-95 duration-200 ${
              isLight
                ? 'bg-white/95 border-white text-[#111113]'
                : 'bg-neutral-900/95 border-white/15 text-white'
            }`}
          >
            <StrokeOrderDiagram
              hanzi={strokeOrderCard.hanzi}
              theme={theme}
              size={210}
              onClose={() => setStrokeOrderCard(null)}
            />
          </div>
        </div>
      )}

      {/* Handwriting Canvas Modal */}
      {writingCard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setWritingCard(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md animate-in zoom-in-95 duration-200"
          >
            <HanziWritingCanvas
              hanzi={writingCard.hanzi}
              pinyin={writingCard.pinyin}
              meaning={writingCard.ptbr}
              theme={theme}
              onClose={() => setWritingCard(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
