import React, { useState, useMemo, useRef, useCallback, lazy, Suspense } from 'react';
import { useDialogFocus } from './useDialogFocus';
import { Card, CardState, DeckConfig } from '../types/card';
import { speakChinese } from '../lib/speech';
import { ALL_HSK_LEVELS, loadNativeLevelCards } from '../data/defaultDecks';
import { Search, Volume2, RotateCcw, Loader2, PenTool, X, Ban, PlayCircle, Save, Lightbulb } from 'lucide-react';
import { isLeech } from '../lib/fsrs';
import { MandarinCardView } from './MandarinCardView';
import { ViewLoading } from './ViewLoading';
import { usePrefetched } from './usePrefetched';
import { HanziDrawSearch } from './HanziDrawSearch';

// The writing pad carries hanzi-writer; it loads on its own and is fetched ahead once this view mounts
const STATE_LABELS: Record<CardState, string> = { 0: 'Novo', 1: 'Aprendendo', 2: 'Revisão', 3: 'Reaprendendo' };

const loadWritingCanvas = () => import('./HanziWritingCanvas').then((m) => m.HanziWritingCanvas);
const HanziWritingCanvasLazy = lazy(() => loadWritingCanvas().then((c) => ({ default: c })));

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
  const [mnemonicDraft, setMnemonicDraft] = useState('');
  const [isDrawSearchOpen, setIsDrawSearchOpen] = useState(false);

  // Only the top-most dialog is active: the writing pad opened from a preview sits above it
  const previewDialogRef = useRef<HTMLDivElement>(null);
  const writingDialogRef = useRef<HTMLDivElement>(null);
  const closePreview = useCallback(() => setPreviewCard(null), []);
  const closeWriting = useCallback(() => setWritingCard(null), []);
  useDialogFocus(previewDialogRef, previewCard !== null && writingCard === null, closePreview);
  useDialogFocus(writingDialogRef, writingCard !== null, closeWriting);

  const isLight = theme === 'light';

  // Fetched as soon as this view mounts, so the pad opens instantly when asked for
  const HanziWritingCanvas = usePrefetched(loadWritingCanvas) ?? HanziWritingCanvasLazy;

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
      if (selectedState === 'leech') {
        if (!isLeech(card)) return false;
      } else if (selectedState === 'suspended') {
        if (!card.suspended) return false;
      } else if (selectedState !== 'all') {
        const stateNum = parseInt(selectedState, 10);
        if (card.state !== stateNum) return false;
      }
      if (!rawQ) return true;

      const hanziMatch =
        card.hanzi.toLowerCase().includes(q) ||
        (card.traditional ? card.traditional.toLowerCase().includes(q) : false);

      const pinyinMatch =
        card.pinyin.toLowerCase().includes(q) ||
        normalizeText(card.pinyin).includes(normalizedQ) ||
        // Syllables are spaced (nǐ hǎo), so "nihao" still matches
        normalizeText(card.pinyin).replace(/[\s'-]+/g, '').includes(normalizedQ.replace(/[\s'-]+/g, ''));

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

  const openPreview = (card: Card) => {
    setPreviewCard(card);
    setMnemonicDraft(card.mnemonic ?? '');
    setIsPreviewFlipped(false);
  };

  const updatePreviewCard = (updated: Card) => {
    onUpdateCard(updated);
    setPreviewCard(updated);
  };

  const handleToggleSuspend = (card: Card) => {
    updatePreviewCard({ ...card, suspended: !card.suspended });
  };

  const handleSaveMnemonic = () => {
    if (!previewCard) return;
    const trimmed = mnemonicDraft.trim();
    updatePreviewCard({ ...previewCard, mnemonic: trimmed || undefined });
    setMnemonicDraft(trimmed);
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
    <div className="w-full max-w-3xl mx-auto space-y-4 animate-in fade-in duration-200">
      <h1 className="font-semibold text-2xl px-1">Dicionário</h1>

      <section aria-label="Busca" className="sheet p-4 sm:p-5 space-y-3">
        {isDrawSearchOpen && (
          <HanziDrawSearch
            cards={cards}
            theme={theme}
            onPick={(hanzi) => {
              setSearch(hanzi);
              setSearchTarget('hanzi');
              setIsDrawSearchOpen(false);
            }}
            onClose={() => setIsDrawSearchOpen(false)}
          />
        )}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search aria-hidden="true" className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ink-tertiary pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Pesquisar"
              placeholder={
                searchTarget === 'hanzi'
                  ? '你好, 水'
                  : searchTarget === 'pinyin'
                  ? 'nihao, nǐ hǎo'
                  : searchTarget === 'meaning'
                  ? 'olá, água'
                  : 'Hanzi, pinyin ou tradução'
              }
              className="w-full min-h-11 pl-10 pr-10 rounded-xl text-sm bg-black/[0.04] dark:bg-white/[0.06] placeholder:text-[var(--text-tertiary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 [&::-webkit-search-cancel-button]:hidden"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Limpar busca"
                className="absolute right-1 top-1/2 -translate-y-1/2 size-9 rounded-lg flex items-center justify-center ink-tertiary hover:text-[var(--text-fg)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsDrawSearchOpen((open) => !open)}
            aria-expanded={isDrawSearchOpen}
            aria-label="Pesquisar desenhando o caractere"
            className={`min-h-11 px-3.5 flex items-center gap-1.5 rounded-xl text-sm font-medium cursor-pointer transition-colors ${
              isDrawSearchOpen
                ? 'bg-red-600 text-white'
                : 'bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/10'
            }`}
          >
            <PenTool aria-hidden="true" className="w-4 h-4" />
            <span className="hidden sm:inline">Desenhar</span>
          </button>
        </div>

        <div className="flex items-center gap-x-4 gap-y-2 flex-wrap text-sm">
          <div role="group" aria-label="Campo da busca" className="flex items-center gap-1">
            {(
              [
                { id: 'all', label: 'Tudo' },
                { id: 'hanzi', label: 'Hanzi' },
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
                  aria-pressed={isActive}
                  className={`min-h-9 px-2.5 rounded-lg font-medium cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-black/[0.07] dark:bg-white/[0.12] text-[var(--text-fg)]'
                      : 'ink-secondary hover:text-[var(--text-fg)]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              aria-label="Filtrar por nível HSK"
              className="min-h-9 px-2 rounded-lg bg-transparent ink-secondary font-medium cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
            >
              <option value="all" className="bg-white dark:bg-neutral-900">Todos os níveis</option>
              {ALL_HSK_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl} className="bg-white dark:bg-neutral-900">
                  {lvl}
                </option>
              ))}
            </select>
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              aria-label="Filtrar por estado"
              className="min-h-9 px-2 rounded-lg bg-transparent ink-secondary font-medium cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
            >
              <option value="all" className="bg-white dark:bg-neutral-900">Todos os estados</option>
              <option value="0" className="bg-white dark:bg-neutral-900">Novos</option>
              <option value="1" className="bg-white dark:bg-neutral-900">Aprendendo</option>
              <option value="2" className="bg-white dark:bg-neutral-900">Revisão</option>
              <option value="3" className="bg-white dark:bg-neutral-900">Reaprendendo</option>
              <option value="leech" className="bg-white dark:bg-neutral-900">Leech</option>
              <option value="suspended" className="bg-white dark:bg-neutral-900">Suspensos</option>
            </select>
          </div>
        </div>

        {!isLevelLoaded && (
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--separator)] text-sm">
            <span className="ink-secondary">{selectedLevel} não baixado</span>
            <button
              type="button"
              onClick={handleLoadSelectedLevel}
              disabled={isLoadingLevel}
              className="min-h-10 px-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
            >
              {isLoadingLevel && <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />}
              <span>Baixar</span>
            </button>
          </div>
        )}
      </section>

      <section aria-label="Vocábulos" className="sheet overflow-hidden">
        <div className="flex items-baseline justify-between px-5 pt-4 pb-2 text-xs ink-tertiary">
          <span>Vocábulos</span>
          <span className="tabular" aria-live="polite">
            {filteredCards.length} de {cards.length}
          </span>
        </div>
        <div
          tabIndex={0}
          role="region"
          aria-label="Lista de vocábulos"
          className="max-h-[65vh] overflow-y-auto overscroll-contain focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 focus-visible:ring-inset"
        >
          {filteredCards.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm ink-secondary">Nenhum vocábulo encontrado</p>
          ) : (
            <ul className="ledger border-t border-[var(--separator)]">
              {filteredCards.slice(0, 150).map((card, idx) => {
                const leech = isLeech(card);
                return (
                  <li
                    key={`${card.id}-${idx}`}
                    className="relative flex items-center gap-4 pl-5 pr-2 py-2.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.04] transition-colors has-[>button:focus-visible]:outline has-[>button:focus-visible]:outline-2 has-[>button:focus-visible]:-outline-offset-2 has-[>button:focus-visible]:outline-red-500"
                  >
                    <button
                      type="button"
                      onClick={() => openPreview(card)}
                      aria-label={`Abrir ${card.hanzi}, ${card.pinyin}`}
                      className="absolute inset-0 cursor-pointer focus:outline-none"
                    />
                    <span lang="zh-CN" className="hanzi-index text-[1.75rem] min-w-[3.5rem] shrink-0 pointer-events-none">
                      {card.hanzi}
                    </span>
                    <div className="min-w-0 flex-1 pointer-events-none">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-medium truncate">{card.pinyin}</span>
                        {card.traditional && card.traditional !== card.hanzi && (
                          <span lang="zh-TW" className="text-xs ink-tertiary shrink-0">{card.traditional}</span>
                        )}
                      </div>
                      <div className="text-sm ink-secondary truncate" dangerouslySetInnerHTML={{ __html: card.ptbr }} />
                    </div>
                    <div className="hidden sm:flex flex-col items-end text-xs ink-tertiary shrink-0 pointer-events-none">
                      <span>{card.level}</span>
                      <span>{STATE_LABELS[card.state]}</span>
                    </div>
                    {(leech || card.suspended) && (
                      <span className="text-xs font-medium shrink-0 pointer-events-none text-amber-700 dark:text-amber-300">
                        {card.suspended ? 'Suspenso' : 'Leech'}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleSpeakWord(card.hanzi)}
                      aria-label={`Ouvir ${card.hanzi}`}
                      className="relative size-11 shrink-0 rounded-xl flex items-center justify-center ink-secondary hover:text-[var(--text-fg)] hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer transition-colors"
                    >
                      <Volume2 aria-hidden="true" className="w-[18px] h-[18px]" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {filteredCards.length > 150 && (
            <p className="px-5 py-3 text-center text-xs ink-tertiary border-t border-[var(--separator)]">
              Primeiros 150. Refine a busca.
            </p>
          )}
        </div>
      </section>

      {/* Card Preview Modal */}
      {previewCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in">
          <div
            ref={previewDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Pré-visualização de ${previewCard.hanzi}`}
            className={`w-full max-w-xl rounded-3xl p-6 relative flex flex-col items-center gap-4 shadow-2xl border ${
              isLight
                ? 'bg-white/95 border-white text-ink'
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
              />
            </div>

            <div className="w-full space-y-2">
              <label className="flex items-center gap-1.5 text-xs font-semibold opacity-80">
                <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                Dica mnemônica
              </label>
              <textarea
                rows={2}
                value={mnemonicDraft}
                onChange={(e) => setMnemonicDraft(e.target.value)}
                placeholder="Escreva uma associação para lembrar o significado"
                className={`w-full px-3 py-2 rounded-xl text-xs border resize-y ${
                  isLight ? 'bg-white border-black/15 text-black' : 'bg-black/40 border-white/15 text-white'
                }`}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveMnemonic}
                  disabled={mnemonicDraft.trim() === (previewCard.mnemonic ?? '')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Salvar dica</span>
                </button>
              </div>
            </div>

            <div className="w-full flex flex-col items-center gap-3 pt-3 border-t border-black/10 dark:border-white/10">
              <span className="text-[11px] opacity-60">Toque no cartão para virar</span>
              <div className="w-full flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleSuspend(previewCard)}
                  className={`min-h-11 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-all border ${
                    isLight
                      ? 'bg-black/5 hover:bg-black/10 text-ink border-black/10'
                      : 'bg-white/10 hover:bg-white/20 text-white border-white/15'
                  }`}
                >
                  {previewCard.suspended ? <PlayCircle className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                  <span>{previewCard.suspended ? 'Reativar' : 'Suspender'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWritingCard(previewCard)}
                  className="min-h-11 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer transition-all shadow-sm"
                >
                  <PenTool className="w-3.5 h-3.5" />
                  <span>Praticar Escrita</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleResetCard(previewCard)}
                  className="min-h-11 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-300 text-xs font-bold cursor-pointer transition-all"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Resetar Progresso</span>
                </button>
              </div>
            </div>
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
            ref={writingDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Praticar escrita do Hanzi"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md animate-in zoom-in-95 duration-200"
          >
            <Suspense fallback={<ViewLoading variant="pad" />}>
              <HanziWritingCanvas
                hanzi={writingCard.hanzi}
                pinyin={writingCard.pinyin}
                meaning={writingCard.ptbr}
                theme={theme}
                onClose={() => setWritingCard(null)}
              />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
};
