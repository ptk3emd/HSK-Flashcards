import { Card } from '../types/card';
import type { CourseId } from './courseId';
import { isNativeCardId } from './vocabulary';

/**
 * Brings a saved deck in line with the course's vocabulary in Supabase:
 * - a word still in the list keeps its schedule and takes the new text;
 * - a word that left the list is dropped only if it was never studied;
 * - words added to the list are appended untouched.
 */
export interface VocabularyMerge {
  cards: Card[];
  changed: boolean;
}

function hasHistory(card: Card): boolean {
  return card.reps > 0 || card.state !== 0 || !!card.suspended || !!card.mnemonic;
}

function sameText(a: Card, b: Card): boolean {
  return (
    a.hanzi === b.hanzi &&
    a.traditional === b.traditional &&
    a.pinyin === b.pinyin &&
    a.ptbr === b.ptbr &&
    a.level === b.level &&
    a.pos === b.pos &&
    (a.tags ?? []).join('\u0000') === (b.tags ?? []).join('\u0000')
  );
}

export function reconcileCardVocabulary(
  cards: Card[],
  remoteByLevel: ReadonlyMap<string, readonly Card[]>,
  course: CourseId
): VocabularyMerge {
  if (remoteByLevel.size === 0) return { cards, changed: false };

  const remoteById = new Map<string, Card>();
  for (const levelCards of remoteByLevel.values()) {
    for (const card of levelCards) remoteById.set(card.id, card);
  }
  const remoteLevels = new Set(remoteByLevel.keys());
  const kept: Card[] = [];
  const seen = new Set<string>();
  let changed = false;

  for (const card of cards) {
    if (seen.has(card.id)) {
      changed = true;
      continue;
    }
    seen.add(card.id);

    if (!isNativeCardId(card.id, course)) {
      kept.push(card);
      continue;
    }

    const remote = remoteById.get(card.id);
    if (remote) {
      const updated: Card = {
        ...card,
        hanzi: remote.hanzi,
        traditional: remote.traditional,
        pinyin: remote.pinyin,
        ptbr: remote.ptbr,
        level: remote.level,
        pos: remote.pos,
        tags: remote.tags,
      };
      if (!sameText(card, updated)) changed = true;
      kept.push(updated);
      continue;
    }

    // The level was downloaded from the remote list and no longer has this word
    if (remoteLevels.has(card.level)) {
      if (hasHistory(card)) kept.push(card);
      else changed = true;
      continue;
    }

    kept.push(card);
  }

  for (const levelCards of remoteByLevel.values()) {
    for (const card of levelCards) {
      if (seen.has(card.id)) continue;
      seen.add(card.id);
      kept.push(card);
      changed = true;
    }
  }

  return { cards: changed ? kept : cards, changed };
}
