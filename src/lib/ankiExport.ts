import type { Card, ReviewLog } from '../types/card';
import { ALL_HSK_LEVELS, loadNativeLevelCards } from '../data/defaultDecks';
import { STORAGE_KEYS } from './storage';

/** Raised when saved data cannot be read back: the fix is local data, never connectivity. */
export class ExportDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportDataError';
  }
}

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

/** One pass for markup and line breaks: a field must never carry a raw newline into the CSV. */
const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '\r': '', '\n': '<br>',
};
const html = (value: string) => value.replace(/[&<>"'\r\n]/g, char => HTML_ESCAPE[char]);
const csv = (value: string) => `"${value.replace(/"/g, '""')}"`;
/** Anki tags cannot hold whitespace; commas would read as separators elsewhere. */
const tag = (value: string) => value.trim().replace(/[\s,;]+/g, '_');

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
  return Object.fromEntries(Object.values(STORAGE_KEYS).flatMap(key => {
    const value = storage.getItem(key);
    if (value === null) return [];
    return [[key, value]];
  }));
}

/**
 * The saved review history, or an empty list when this device never saved any.
 * Throws ExportDataError when a saved value exists but cannot be read as a list of logs.
 */
export function parseReviewLogs(storage: Record<string, unknown>): ReviewLog[] {
  const raw = storage[STORAGE_KEYS.reviewLogs];
  if (raw === undefined) return [];
  if (typeof raw !== 'string') throw new ExportDataError('review history is not a stored string');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ExportDataError('review history is not valid JSON');
  }
  if (!Array.isArray(parsed)) throw new ExportDataError('review history is not a list');
  return parsed as ReviewLog[];
}
