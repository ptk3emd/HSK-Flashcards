/**
 * Rebuilds public.it_cards as the Italian translation of public.fr_cards: the Italian course
 * follows the French list one to one (F-00001 -> I-00001), keeping level, pos, ptbr and tags.
 *
 *   npm run sync:it            # dry run: compares both tables and prints what would change
 *   npm run sync:it -- --write # backs up it_cards, upserts the translations and removes extras
 *
 * Translations live in scripts/it-from-fr.json. If the French list grows, add the new ids there
 * before running; the script refuses to write when a French id has no translation.
 *
 * Same environment as the seeds: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env or .env.local.
 * The service role key bypasses RLS, so it must never be prefixed with VITE_.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

loadEnv({ path: ['.env.local', '.env'], quiet: true });

const PAGE = 1000;
const BATCH = 500;
const FR_ID_PATTERN = /^F-\d{5}$/;
const IT_ID_PATTERN = /^I-\d{5}$/;
const CJK = /[㐀-鿿豈-﫿]/;

interface CardRow {
  id: string;
  word: string;
  ptbr: string;
  level: string;
  pos: string | null;
  tags: string[] | null;
}

interface ItCard extends CardRow {
  tags: string[];
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function loadTranslations(): Record<string, string> {
  const file = path.join(process.cwd(), 'scripts', 'it-from-fr.json');
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${file}: expected an object mapping French card ids to Italian words.`);
  }
  const translations: Record<string, string> = {};
  for (const [id, value] of Object.entries(parsed)) {
    if (!nonEmptyString(value)) throw new Error(`${file}: ${id} has an empty translation.`);
    translations[id] = value.trim();
  }
  return translations;
}

function buildRows(french: CardRow[], translations: Record<string, string>): ItCard[] {
  const rows: ItCard[] = [];
  const seen = new Set<string>();
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const card of french) {
    if (!FR_ID_PATTERN.test(card.id)) {
      invalid.push(`${card.id}: invalid French id`);
      continue;
    }
    const id = `I-${card.id.slice(2)}`;
    if (!IT_ID_PATTERN.test(id)) {
      invalid.push(`${card.id}: invalid Italian id ${id}`);
      continue;
    }
    if (seen.has(id)) invalid.push(`${id}: duplicate id`);
    seen.add(id);

    const word = translations[card.id];
    if (!word) {
      missing.push(card.id);
      continue;
    }
    if (CJK.test(word)) invalid.push(`${id}: Chinese character in "${word}"`);

    rows.push({
      id,
      word,
      ptbr: card.ptbr,
      level: card.level,
      pos: card.pos,
      tags: card.tags ?? [],
    });
  }

  if (invalid.length > 0) {
    throw new Error(`Invalid Italian rows:\n${invalid.slice(0, 20).join('\n')}`);
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing ${missing.length} translation(s) in scripts/it-from-fr.json:\n${missing.slice(0, 20).join('\n')}` +
        (missing.length > 20 ? `\n... and ${missing.length - 20} more` : ''),
    );
  }
  return rows;
}

interface ProgressRow {
  user_id: string;
  cards: unknown;
  deck_config: unknown;
  fsrs_options: unknown;
}

function mapProgress(row: ProgressRow, translations: Record<string, string>, targetIds: Set<string>) {
  const cards = Array.isArray(row.cards) ? row.cards : [];
  const mapped = cards.flatMap((card) => {
    if (card === null || typeof card !== 'object') return [];
    const current = card as Record<string, unknown>;
    if (typeof current.id !== 'string' || !FR_ID_PATTERN.test(current.id)) return [];
    const id = `I-${current.id.slice(2)}`;
    if (!targetIds.has(id)) return [];
    return [{ ...current, id, hanzi: translations[current.id] ?? current.hanzi, pinyin: '' }];
  });
  return {
    user_id: row.user_id,
    course: 'it',
    cards: mapped,
    deck_config: row.deck_config ?? null,
    fsrs_options: row.fsrs_options ?? null,
    updated_at: new Date().toISOString(),
  };
}

function countByLevel(rows: ItCard[]): Map<string, number> {
  const byLevel = new Map<string, number>();
  for (const row of rows) byLevel.set(row.level, (byLevel.get(row.level) ?? 0) + 1);
  return byLevel;
}

function sameCard(a: CardRow, b: CardRow): boolean {
  return (
    a.id === b.id &&
    a.word === b.word &&
    a.ptbr === b.ptbr &&
    a.level === b.level &&
    a.pos === b.pos &&
    JSON.stringify(a.tags ?? []) === JSON.stringify(b.tags ?? [])
  );
}

async function main(): Promise<void> {
  const write = process.argv.includes('--write');
  const syncProgress = process.argv.includes('--sync-progress');
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env or .env.local (see .env.example).');
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const fetchAll = async (table: 'fr_cards' | 'it_cards'): Promise<CardRow[]> => {
    const rows: CardRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from(table)
        .select('id, word, ptbr, level, pos, tags')
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`Reading ${table} failed: ${error.message}`);
      const page = (data ?? []) as CardRow[];
      rows.push(...page);
      if (page.length < PAGE) break;
    }
    return rows;
  };
  const fetchFrenchProgress = async (): Promise<ProgressRow[]> => {
    const rows: ProgressRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('user_progress')
        .select('user_id, cards, deck_config, fsrs_options')
        .eq('course', 'fr')
        .order('user_id')
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`Reading user_progress failed: ${error.message}`);
      const page = (data ?? []) as ProgressRow[];
      rows.push(...page);
      if (page.length < PAGE) break;
    }
    return rows;
  };
  const translations = loadTranslations();
  const french = await fetchAll('fr_cards');
  if (french.length === 0) throw new Error('fr_cards is empty: seed the French course first.');

  const rows = buildRows(french, translations);
  const byLevel = countByLevel(rows);
  const existing = await fetchAll('it_cards');
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const targetIds = new Set(rows.map((row) => row.id));
  const obsolete = existing.filter((row) => !targetIds.has(row.id));
  const pending = rows.filter((row) => {
    const current = existingById.get(row.id);
    return !current || !sameCard(current, row);
  });
  const frenchProgress = syncProgress ? await fetchFrenchProgress() : [];
  const alignedProgress = frenchProgress.map((row) => mapProgress(row, translations, targetIds));
  const progressCards = alignedProgress.reduce((total, row) => total + row.cards.length, 0);

  console.log(`fr_cards: ${french.length} words`);
  for (const [level, count] of [...byLevel].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${level}: ${count}`);
  }
  console.log(`it_cards now: ${existing.length} words (${obsolete.length} outside the French list)`);
  console.log(`it_cards after: ${rows.length} words (${pending.length} to upsert, ${obsolete.length} to delete)`);
  if (syncProgress) {
    console.log(`user_progress: ${alignedProgress.length} French rows -> Italian (${progressCards} cards)`);
  }

  if (!write) {
    console.log('\nSample:');
    for (const row of rows.slice(0, 5)) console.log(`  ${row.id}  ${row.word}  (${row.ptbr})`);
    console.log('\nDry run: nothing was sent. Re-run with --write to apply.');
    return;
  }

  if (rows.length === 0) throw new Error('Refusing to write an empty it_cards.');

  const backupDir = path.join(process.cwd(), 'backups');
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `it-cards-${stamp}.json`);
  writeFileSync(backupFile, JSON.stringify(existing, null, 2));
  console.log(`\nBackup: ${path.relative(process.cwd(), backupFile)}`);

  for (let sent = 0; sent < rows.length; sent += BATCH) {
    const batch = rows.slice(sent, sent + BATCH);
    const { error } = await supabase.from('it_cards').upsert(batch, { onConflict: 'id' });
    if (error) throw new Error(`Upsert batch ${Math.floor(sent / BATCH) + 1} failed: ${error.message}`);
    console.log(`upserted ${Math.min(sent + BATCH, rows.length)}/${rows.length}`);
  }

  const obsoleteIds = obsolete.map((row) => row.id);
  for (let sent = 0; sent < obsoleteIds.length; sent += BATCH) {
    const batch = obsoleteIds.slice(sent, sent + BATCH);
    const { error } = await supabase.from('it_cards').delete().in('id', batch);
    if (error) throw new Error(`Delete batch ${Math.floor(sent / BATCH) + 1} failed: ${error.message}`);
    console.log(`deleted ${Math.min(sent + BATCH, obsoleteIds.length)}/${obsoleteIds.length}`);
  }

  const remote = await fetchAll('it_cards');
  if (remote.length !== rows.length) {
    throw new Error(`it_cards has ${remote.length} rows after sync, expected ${rows.length}.`);
  }
  const remoteById = new Map(remote.map((row) => [row.id, row]));
  for (const row of rows) {
    const current = remoteById.get(row.id);
    if (!current || !sameCard(current, row)) {
      throw new Error(`it_cards verification failed at ${row.id}.`);
    }
  }
  const remoteIds = new Set(remote.map((row) => row.id));
  if (remoteIds.size !== targetIds.size) {
    throw new Error(`it_cards has ${remoteIds.size} distinct ids after sync, expected ${targetIds.size}.`);
  }

  if (syncProgress) {
    const PROGRESS_BATCH = 50;
    for (let sent = 0; sent < alignedProgress.length; sent += PROGRESS_BATCH) {
      const batch = alignedProgress.slice(sent, sent + PROGRESS_BATCH);
      const { error } = await supabase
        .from('user_progress')
        .upsert(batch, { onConflict: 'user_id,course' });
      if (error) throw new Error(`Progress upsert failed: ${error.message}`);
      console.log(`progress ${Math.min(sent + PROGRESS_BATCH, alignedProgress.length)}/${alignedProgress.length}`);
    }
  }

  console.log(`Done: it_cards mirrors fr_cards with ${rows.length} Italian rows.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
