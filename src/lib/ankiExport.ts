import type { Card, ReviewLog } from '../types/card';
import { ALL_HSK_LEVELS, loadNativeLevelCards } from '../data/defaultDecks';

/** Saved versions win by stable ID, including edits, suspension and FSRS state. */
export function mergeExportCards(nativeCards: Card[], userCards: Card[]): Card[] {
  const cards = new Map(nativeCards.map(card => [card.id, card]));
  for (const card of userCards) cards.set(card.id, card);
  return [...cards.values()];
}

export async function loadExportCards(userCards: Card[]): Promise<Card[]> {
  const levels = await Promise.all(ALL_HSK_LEVELS.map(loadNativeLevelCards));
  return mergeExportCards(levels.flat(), userCards);
}

const html = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\r?\n/g, '<br>');
const csv = (value: string) => `"${value.replace(/"/g, '""')}"`;
const tag = (value: string) => value.trim().replace(/\s+/g, '_');

/** Anki 2.1.54+ file headers; first two columns map to a Basic note's front/back.
 * A hidden stable identifier distinguishes homographs without claiming an Anki GUID.
 * Metadata is archival: CSV cannot install scheduling or review history in Anki.
 */
export function buildAnkiCsv(cards: Card[], logs: ReviewLog[]): string {
  const logsByCard = new Map<string, ReviewLog[]>();
  for (const log of logs) {
    const list = logsByCard.get(log.cardId) ?? [];
    list.push(log);
    logsByCard.set(log.cardId, list);
  }
  const rows = cards.map(card => {
    const front = `<div lang="zh-CN">${html(card.hanzi)}</div><span hidden data-hsk-id="${html(card.id)}">${html(card.id)}</span>`;
    const back = [card.pinyin, card.ptbr, card.mnemonic].filter(Boolean).map(value => `<div>${html(value!)}</div>`).join('<br>');
    const tags = ['HSK_Flashcards', tag(card.level), ...(card.tags ?? []).map(tag), ...(card.suspended ? ['suspenso_no_app'] : [])].filter(Boolean).join(' ');
    return [front, back, tags, `HSK::${card.level}`, card.id,
      html(JSON.stringify({ card, reviews: logsByCard.get(card.id) ?? [] }))].map(csv).join(',');
  });
  return ['#separator:Comma', '#html:true', '#tags column:3', '#deck column:4',
    '#columns:Frente,Verso,Tags,Baralho,ID,DadosUsuario', ...rows].join('\r\n') + '\r\n';
}

/** Explicit app-owned keys only; fail rather than silently export unreadable user data. */
export function readUserBackup(storage: Pick<Storage, 'getItem'>): Record<string, unknown> {
  const keys = ['hanzi_anki_cards_v2', 'hanzi_anki_settings_v2', 'hanzi_anki_fsrs_v2',
    'hanzi_anki_review_logs_v2', 'hanzi_anki_theme_v2', 'hanzi_anki_content_version',
    'hanzi_anki_exam_attempts_v1', 'hanzi_anki_stories_read_v1', 'hanzi_anki_exam_session_v1'];
  return Object.fromEntries(keys.flatMap(key => {
    const value = storage.getItem(key);
    if (value === null) return [];
    return [[key, value]];
  }));
}
