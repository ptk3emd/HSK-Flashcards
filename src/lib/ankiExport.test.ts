import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAnkiCsv, loadExportCards, mergeExportCards, readUserBackup } from './ankiExport';
import type { Card } from '../types/card';

const card: Card = { id: 'S-00001', hanzi: '你好', pinyin: 'nǐ hǎo', ptbr: 'Olá', level: 'HSK 1',
  state: 0, due: '2026-01-01T00:00:00Z', stability: 0, difficulty: 0, elapsed_days: 0, scheduled_days: 0, reps: 0, lapses: 0 };
test('includes every native level while preserving saved edits and custom cards', async () => {
  const edited = { ...card, mnemonic: 'Minha dica', reps: 8, suspended: true };
  const custom = { ...card, id: 'custom', ptbr: 'Pessoal' };
  const all = await loadExportCards([edited, custom]);
  assert.equal(all.length, 11001);
  assert.deepEqual(all.find(c => c.id === card.id), edited);
  assert.equal(all.filter(c => c.level === 'HSK 7-9').length, 5600);
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
test('backup preserves original app data and never reads unrelated keys', () => {
  const seen: string[] = [];
  const result = readUserBackup({ getItem: key => { seen.push(key); return key === 'hanzi_anki_cards_v2' ? '[{"id":"personal"}]' : null; } });
  assert.deepEqual(result, { hanzi_anki_cards_v2: '[{"id":"personal"}]' });
  assert.ok(seen.every(k => k.startsWith('hanzi_anki_')));
});
