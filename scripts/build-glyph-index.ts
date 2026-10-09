/**
 * Builds src/data/glyphIndex.json: a 24x24 bitmap for every single character that
 * appears in the HSK decks, rasterised from the stroke centrelines of hanzi-writer-data.
 *
 *   npx tsx scripts/build-glyph-index.ts <path-to-hanzi-writer-data-package>
 *
 * The package is the npm package `hanzi-writer-data` (unpacked). It is not a runtime
 * dependency: the generated index is committed so the app works offline.
 */
import fs from 'node:fs';
import path from 'node:path';
import { normalizeStrokes, packCells, rasterize, type Polyline } from '../src/lib/handwriting';

const root = process.cwd();
const dataDir = process.argv[2];
if (!dataDir) {
  console.error('Usage: npx tsx scripts/build-glyph-index.ts <hanzi-writer-data package dir>');
  process.exit(1);
}

const hanziInDecks = new Set<string>();
for (const file of fs.readdirSync(path.join(root, 'src/data'))) {
  if (!/^hsk.*\.json$/.test(file)) continue;
  const cards = JSON.parse(fs.readFileSync(path.join(root, 'src/data', file), 'utf8')) as { hanzi?: string }[];
  for (const card of cards) {
    for (const ch of card.hanzi ?? '') {
      if (/[一-鿿]/.test(ch)) hanziInDecks.add(ch);
    }
  }
}

const index: Record<string, string> = {};
const missing: string[] = [];
for (const ch of [...hanziInDecks].sort()) {
  const file = path.join(dataDir, `${ch}.json`);
  if (!fs.existsSync(file)) {
    missing.push(ch);
    continue;
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { medians: [number, number][][] };
  // Stroke data is y-up; the drawing is y-down. Flipping keeps both in the same orientation.
  const strokes: Polyline[] = data.medians.map((m) => m.map(([x, y]) => ({ x, y: -y })));
  index[ch] = packCells(rasterize(normalizeStrokes(strokes)));
}

const outFile = path.join(root, 'src/data/glyphIndex.json');
fs.writeFileSync(outFile, JSON.stringify(index));
console.log(`indexed ${Object.keys(index).length} characters, missing ${missing.length}: ${missing.join(' ')}`);
console.log(`wrote ${path.relative(root, outFile)} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);
