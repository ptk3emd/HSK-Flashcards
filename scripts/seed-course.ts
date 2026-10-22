/**
 * Seeds the French vocabulary into Supabase from src/data/fr/fr*.json.
 * Apply the course's migration before the first run (20261017100000_fr_cards.sql).
 *
 *   npm run seed:fr              # upserts every French word in the bundled deck
 *   npm run seed:fr -- --dry-run # validates the files and prints what would be sent
 *
 * The Italian course is not seeded this way: it mirrors fr_cards through npm run sync:it.
 *
 * Same environment as seed:hsk: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env or
 * .env.local. The service role key bypasses RLS, so it must never be prefixed with VITE_.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { ALL_HSK_LEVELS } from '../src/data/defaultDecks';

loadEnv({ path: ['.env.local', '.env'], quiet: true });

const BATCH = 500;
const COURSES = {
  fr: { folder: 'fr', prefix: 'F', table: 'fr_cards', name: 'French' },
  it: { folder: 'it', prefix: 'I', table: 'it_cards', name: 'Italian' },
} as const;
const courseArg = process.argv.find((arg): arg is keyof typeof COURSES => arg in COURSES);
if (!courseArg) {
  console.error('Usage: tsx scripts/seed-course.ts <fr|it> [--dry-run]');
  process.exit(1);
}
const course = COURSES[courseArg];
if (courseArg === 'it') {
  console.error('The Italian course mirrors fr_cards. Use npm run sync:it instead.');
  process.exit(1);
}
const ID_PATTERN = new RegExp(`^${course.prefix}-\\d{5}$`);
// These decks carry no hanzi: a CJK character in them is a translation error
const CJK = /[㐀-鿿豈-﫿]/;

interface RawCard {
  id?: unknown;
  hanzi?: unknown; // the foreign word: the app keeps it in the card's main field
  ptbr?: unknown;
  level?: unknown;
  pos?: unknown;
  tags?: unknown;
}

interface FrRow {
  id: string;
  word: string;
  ptbr: string;
  level: string;
  pos: string | null;
  tags: string[];
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Reads and validates every level of the course, so a bad file fails before any request. */
function readRows(): FrRow[] {
  const dir = path.join(process.cwd(), 'src', 'data', course.folder);
  const filePattern = new RegExp(`^${course.folder}\\d(_\\d+)?\\.json$`);
  const files = readdirSync(dir)
    .filter((file) => filePattern.test(file))
    .sort();

  const rows: FrRow[] = [];
  const seen = new Set<string>();
  const errors: string[] = [];

  for (const file of files) {
    const cards = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as RawCard[];
    cards.forEach((card, index) => {
      const where = `${file} [${index}]`;
      const { id, hanzi: word, ptbr, level, pos, tags } = card;
      if (!nonEmptyString(id) || !ID_PATTERN.test(id)) {
        errors.push(`${where}: invalid id`);
        return;
      }
      if (seen.has(id)) errors.push(`${where}: duplicate id ${id}`);
      seen.add(id);
      if (!nonEmptyString(word) || CJK.test(word)) {
        errors.push(`${where}: missing or non-Latin word`);
        return;
      }
      if (!nonEmptyString(ptbr) || CJK.test(ptbr)) {
        errors.push(`${where}: missing ptbr or Chinese in it`);
        return;
      }
      if (!nonEmptyString(level) || !(ALL_HSK_LEVELS as readonly string[]).includes(level)) {
        errors.push(`${where}: unknown level`);
        return;
      }
      if (tags !== undefined && !(Array.isArray(tags) && tags.every((t) => typeof t === 'string'))) {
        errors.push(`${where}: invalid tags`);
        return;
      }
      rows.push({
        id,
        word,
        ptbr,
        level,
        pos: nonEmptyString(pos) ? pos : null,
        tags: (tags as string[] | undefined) ?? [],
      });
    });
  }

  if (errors.length > 0) {
    const shown = errors.slice(0, 20).join('\n');
    throw new Error(`Invalid ${course.name} deck:\n${shown}${errors.length > 20 ? `\n... and ${errors.length - 20} more` : ''}`);
  }
  return rows;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const rows = readRows();

  const byLevel = new Map<string, number>();
  for (const row of rows) byLevel.set(row.level, (byLevel.get(row.level) ?? 0) + 1);
  console.log(`${rows.length} ${course.name} words:`);
  for (const level of ALL_HSK_LEVELS) console.log(`  ${level}: ${byLevel.get(level) ?? 0}`);

  if (dryRun) {
    console.log('Dry run: nothing was sent.');
    return;
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env or .env.local (see .env.example).');
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  for (let sent = 0; sent < rows.length; sent += BATCH) {
    const batch = rows.slice(sent, sent + BATCH);
    const { error } = await supabase.from(course.table).upsert(batch, { onConflict: 'id' });
    if (error) throw new Error(`Batch ${Math.floor(sent / BATCH) + 1} failed: ${error.message}`);
    console.log(`upserted ${Math.min(sent + BATCH, rows.length)}/${rows.length}`);
  }

  // The table must end up with exactly the bundled deck, level by level.
  for (const level of ALL_HSK_LEVELS) {
    const { count, error } = await supabase
      .from(course.table)
      .select('id', { count: 'exact', head: true })
      .eq('level', level);
    if (error) throw new Error(`Counting ${level} failed: ${error.message}`);
    const expected = byLevel.get(level) ?? 0;
    if (count !== expected) throw new Error(`${level}: ${count} rows in the table, expected ${expected}`);
  }
  console.log(`Done: ${course.table} matches the bundled ${course.name} deck.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
