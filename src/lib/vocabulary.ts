import type { SupabaseClient } from '@supabase/supabase-js';
import { Card } from '../types/card';
import { ACTIVE_COURSE, CourseId } from './courseId';
import { getSupabase, isCloudEnabled } from './supabaseClient';

/**
 * The vocabulary lives in Supabase (hsk_cards, fr_cards, it_cards) so the deck always
 * follows the list edited there. The bundled JSON is only the fallback: no key at build
 * time, offline, or a course table with no words yet.
 */
export type VocabularySource = 'remote' | 'bundled';

interface VocabularyTable {
  table: string;
  prefix: string;
}

const TABLES: Record<CourseId, VocabularyTable> = {
  zh: { table: 'hsk_cards', prefix: 'S' },
  fr: { table: 'fr_cards', prefix: 'F' },
  it: { table: 'it_cards', prefix: 'I' },
};

const NATIVE_ID: Record<CourseId, RegExp> = {
  zh: /^S-\d{5}$/,
  fr: /^F-\d{5}$/,
  it: /^I-\d{5}$/,
};

interface VocabularyRow {
  id?: unknown;
  hanzi?: unknown;
  traditional?: unknown;
  pinyin?: unknown;
  word?: unknown;
  ptbr?: unknown;
  level?: unknown;
  pos?: unknown;
  tags?: unknown;
}

const PAGE = 1000;

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function tagList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : [];
}

/** A card id that belongs to the course's official list, such as S-00001 or F-01800. */
export function isNativeCardId(id: string, course: CourseId = ACTIVE_COURSE): boolean {
  return NATIVE_ID[course].test(id);
}

/** Turns one vocabulary row into an untouched card; null when the row is not usable. */
export function mapVocabularyRow(
  row: VocabularyRow,
  course: CourseId = ACTIVE_COURSE,
  now: Date = new Date()
): Card | null {
  const { id, ptbr, level } = row;
  if (!nonEmpty(id) || !nonEmpty(ptbr) || !nonEmpty(level)) return null;
  if (!isNativeCardId(id, course)) return null;

  const word = course === 'zh' ? row.hanzi : row.word;
  if (!nonEmpty(word)) return null;
  if (course === 'zh' && !nonEmpty(row.pinyin)) return null;

  return {
    id,
    hanzi: word,
    traditional: nonEmpty(row.traditional) ? row.traditional : undefined,
    pinyin: course === 'zh' && nonEmpty(row.pinyin) ? row.pinyin : '',
    ptbr,
    level,
    pos: nonEmpty(row.pos) ? row.pos : undefined,
    tags: tagList(row.tags),
    state: 0,
    due: now.toISOString(),
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
  };
}

/** Reads one level in pages: PostgREST never returns more than 1000 rows per request. */
async function fetchLevel(
  level: string,
  course: CourseId,
  supabase: SupabaseClient
): Promise<Card[]> {
  const now = new Date();
  const cards: Card[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(TABLES[course].table)
      .select('*')
      .eq('level', level)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as VocabularyRow[];
    for (const row of rows) {
      const card = mapVocabularyRow(row, course, now);
      if (card) cards.push(card);
    }
    if (rows.length < PAGE) return cards;
  }
}

const availability = new Map<CourseId, Promise<boolean>>();

/** Whether the course table has any words at all; an empty table falls back to the bundle. */
function tableHasWords(course: CourseId, supabase: SupabaseClient): Promise<boolean> {
  const cached = availability.get(course);
  if (cached) return cached;
  const request = (async () => {
    const { count, error } = await supabase
      .from(TABLES[course].table)
      .select('id', { count: 'exact', head: true });
    if (error) throw error;
    return (count ?? 0) > 0;
  })().catch((error: unknown) => {
    availability.delete(course);
    throw error;
  });
  availability.set(course, request);
  return request;
}

const levelRequests = new Map<string, Promise<Card[] | null>>();

/**
 * The active course's words for one level, straight from Supabase.
 * Null means "use the bundled file": cloud off, offline, table empty or request failed.
 * An empty array is authoritative: the table has words, this level simply has none.
 */
export async function loadRemoteLevelCards(level: string): Promise<Card[] | null> {
  if (!isCloudEnabled) return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  const supabase = getSupabase();
  if (!supabase) return null;

  const key = `${ACTIVE_COURSE}:${level}`;
  const pending = levelRequests.get(key);
  if (pending) return pending;

  const request = (async () => {
    try {
      if (!(await tableHasWords(ACTIVE_COURSE, supabase))) return null;
      return await fetchLevel(level, ACTIVE_COURSE, supabase);
    } catch (error) {
      console.error('Failed to load the vocabulary from Supabase', error);
      levelRequests.delete(key);
      return null;
    }
  })();
  levelRequests.set(key, request);
  return request;
}
