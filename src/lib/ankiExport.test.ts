import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ExportDataError,
  buildAnkiCsv,
  loadExportCards,
  mergeExportCards,
  parseReviewLogs,
  readUserBackup,
} from './ankiExport';
import { ALL_HSK_LEVELS, HSK_LEVEL_INFO } from '../data/defaultDecks';
import { STORAGE_KEYS } from './storage';
import type { Card, ReviewLog } from '../types/card';

const NATIVE_TOTAL = ALL_HSK_LEVELS.reduce((total, level) => total + HSK_LEVEL_INFO[level].count, 0);

const card: Card = { id: 'S-00001', hanzi: '你好', pinyin: 'nǐ hǎo', ptbr: 'Olá', level: 'HSK 1',
  state: 0, due: '2026-01-01T00:00:00Z', stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0 };

test('includes every native level while preserving saved edits and custom cards', async () => {
  const edited = { ...card, mnemonic: 'Minha dica', reps: 8, suspended: true };
  const custom = { ...card, id: 'custom', ptbr: 'Pessoal' };
  const all = await loadExportCards([edited, custom]);
  assert.equal(all.length, NATIVE_TOTAL + 1);
  assert.deepEqual(all.find(c => c.id === card.id), edited);
  assert.equal(all.filter(c => c.level === 'HSK 7-9').length, HSK_LEVEL_INFO['HSK 7-9'].count);
  assert.equal(new Set(all.map(c => c.id)).size, all.length);
});
test('merge never mutates the native source', () => {
  const native = Object.freeze({ ...card });
  assert.equal(mergeExportCards([native], [{ ...card, reps: 2 }])[0].reps, 2);
  assert.equal(native.reps, 0);
});
test('CSV declares Anki mapping and escapes quotes, markup and line breaks', () => {
  const output = buildAnkiCsv([{ ...card, ptbr: 'Uma "fala",\n<script>alert(1)</script>' }], []);
  assert.ok(output.startsWith('#separator:Comma\r\n#html:true\r\n#tags column:3\r\n#deck column:4'));
  assert.ok(output.includes('&lt;script&gt;'));
  assert.ok(!output.includes('<script>'));
  assert.ok(output.includes('data-hsk-id=""S-00001"">S-00001</span>'));
  assert.equal(output.split('\r\n').length, 7);
});
test('backup reads exactly the app-owned storage keys and preserves their raw values', () => {
  const seen: string[] = [];
  const result = readUserBackup({ getItem: key => { seen.push(key); return key === STORAGE_KEYS.cards ? '[{"id":"personal"}]' : null; } });
  assert.deepEqual(result, { [STORAGE_KEYS.cards]: '[{"id":"personal"}]' });
  assert.deepEqual(seen, Object.values(STORAGE_KEYS));
});
test('review history is parsed when saved and treated as empty on a fresh device', () => {
  const log: ReviewLog = { cardId: card.id, rating: 3, state: 0, due: card.due, stability: 0,
    difficulty: 0, elapsed_days: 0, last_elapsed_days: 0, scheduled_days: 0, reviewTime: card.due,
    previousCardSnapshot: card };
  assert.deepEqual(parseReviewLogs({ [STORAGE_KEYS.reviewLogs]: JSON.stringify([log]) }), [log]);
  assert.deepEqual(parseReviewLogs({}), []);
});
test('unreadable review history raises a data error, not a connection failure', () => {
  for (const raw of ['{oops', '"text"', '42', '{"cardId":"S-00001"}']) {
    assert.throws(() => parseReviewLogs({ [STORAGE_KEYS.reviewLogs]: raw }), ExportDataError);
  }
});
