import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Card } from '../types/card';
import { mapVocabularyRow } from './vocabulary';
import { reconcileCardVocabulary } from './vocabularyMerge';

const NOW = new Date('2026-10-21T12:00:00.000Z');

const card = (id: string, extra: Partial<Card> = {}): Card => ({
  id,
  hanzi: id,
  pinyin: '',
  ptbr: '',
  level: 'HSK 1',
  state: 0,
  due: '2026-01-01T00:00:00.000Z',
  stability: 0,
  difficulty: 0,
  elapsed_days: 0,
  scheduled_days: 0,
  reps: 0,
  lapses: 0,
  ...extra,
});

test('a Mandarin row becomes an untouched card', () => {
  const row = {
    id: 'S-00001',
    hanzi: '爱',
    traditional: '愛',
    pinyin: 'ài',
    ptbr: 'amar; gostar de; amor',
    level: 'HSK 1',
    pos: 'V',
    tags: ['HSK 1', 'V'],
  };
  const mapped = mapVocabularyRow(row, 'zh', NOW);
  assert.equal(mapped?.hanzi, '爱');
  assert.equal(mapped?.traditional, '愛');
  assert.equal(mapped?.pinyin, 'ài');
  assert.equal(mapped?.state, 0);
  assert.equal(mapped?.due, NOW.toISOString());
  assert.deepEqual(mapped?.tags, ['HSK 1', 'V']);
});

test('a French row uses the word column and carries no pinyin', () => {
  const mapped = mapVocabularyRow(
    { id: 'F-00001', word: 'le', ptbr: 'o', level: 'HSK 1', pos: 'Art', tags: ['A1', 'Art'] },
    'fr',
    NOW
  );
  assert.equal(mapped?.hanzi, 'le');
  assert.equal(mapped?.pinyin, '');
  assert.equal(mapped?.pos, 'Art');
});

test('unusable or foreign rows are ignored', () => {
  assert.equal(mapVocabularyRow({ id: 'S-00001', ptbr: 'x', level: 'HSK 1' }, 'zh', NOW), null);
  assert.equal(mapVocabularyRow({ id: 'S-00001', hanzi: '爱', ptbr: 'x', level: 'HSK 1' }, 'zh', NOW), null);
  assert.equal(mapVocabularyRow({ id: 'F-00001', word: 'le', ptbr: 'o', level: 'HSK 1' }, 'zh', NOW), null);
});

test('remote text replaces the card text while its schedule is kept', () => {
  const local = card('F-00001', {
    hanzi: 'aimer',
    state: 2,
    reps: 5,
    due: '2026-11-01T00:00:00.000Z',
    stability: 12,
    difficulty: 4,
  });
  const remote = card('F-00001', { hanzi: 'le', ptbr: 'o' });
  const result = reconcileCardVocabulary([local], new Map([['HSK 1', [remote]]]), 'fr');

  assert.equal(result.changed, true);
  assert.equal(result.cards[0].hanzi, 'le');
  assert.equal(result.cards[0].state, 2);
  assert.equal(result.cards[0].reps, 5);
  assert.equal(result.cards[0].due, '2026-11-01T00:00:00.000Z');
});

test('the saved deck follows the remote list: adds new words, drops untouched removed ones', () => {
  const local = [card('F-00001'), card('F-00002'), card('note-1', { hanzi: 'custom' })];
  const remote = [card('F-00001', { hanzi: 'le' }), card('F-00003', { hanzi: 'les' })];
  const result = reconcileCardVocabulary(local, new Map([['HSK 1', remote]]), 'fr');

  assert.deepEqual(result.cards.map((c) => c.id), ['F-00001', 'note-1', 'F-00003']);
  assert.equal(result.changed, true);
});

test('a removed word that was studied is kept, never losing its history', () => {
  const studied = card('F-00002', { state: 2, reps: 4 });
  const result = reconcileCardVocabulary([studied], new Map([['HSK 1', []]]), 'fr');

  assert.equal(result.changed, false);
  assert.deepEqual(result.cards.map((c) => c.id), ['F-00002']);
});

test('an empty remote level removes untouched words', () => {
  const result = reconcileCardVocabulary([card('F-00002')], new Map([['HSK 1', []]]), 'fr');
  assert.deepEqual(result.cards, []);
  assert.equal(result.changed, true);
});

test('no remote level means the deck is left exactly as it is', () => {
  const cards = [card('F-00002')];
  const result = reconcileCardVocabulary(cards, new Map(), 'fr');
  assert.equal(result.cards, cards);
  assert.equal(result.changed, false);
});
