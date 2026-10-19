import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GrammarExercise, LevelContent } from '../types/card';
import { createRng, prepareQuiz, QUIZ_LENGTH, quizBand, scoreQuiz } from './learn';

const exercise = (id: string): GrammarExercise => ({
  id,
  prompt: `Pergunta ${id}`,
  options: ['a', 'b', 'c', 'd'],
  answer: 2,
  explain: 'porque sim',
});

const content = (count: number): LevelContent => ({
  grammar: [],
  exercises: Array.from({ length: count }, (_, i) => exercise(`e${i}`)),
});

test('a quiz round is seeded: the same seed replays the same questions', () => {
  const a = prepareQuiz(content(30), 42);
  const b = prepareQuiz(content(30), 42);
  assert.deepEqual(a, b);
  const c = prepareQuiz(content(30), 43);
  assert.notDeepEqual(a.map((q) => q.id), c.map((q) => q.id));
});

test('a round takes at most the round length and keeps the right answer with its option', () => {
  const round = prepareQuiz(content(30), 7);
  assert.equal(round.length, QUIZ_LENGTH);
  for (const q of round) assert.equal(q.options[q.answer], 'c');
  const short = prepareQuiz(content(3), 7);
  assert.equal(short.length, 3);
});

test('scoring counts the picks that match the shuffled answer', () => {
  const round = prepareQuiz(content(5), 11);
  const picks: Record<string, number | null> = {};
  round.forEach((q, i) => (picks[q.id] = i < 3 ? q.answer : null));
  const result = scoreQuiz(round, picks);
  assert.deepEqual(result, { correct: 3, total: 5 });
});

test('the rng is deterministic', () => {
  const a = createRng(9);
  const b = createRng(9);
  assert.equal(a(), b());
  assert.equal(a(), b());
});

test('the band reacts to the score', () => {
  assert.match(quizBand(20, 20), /Domínio/);
  assert.match(quizBand(15, 20), /Bom caminho/);
  assert.match(quizBand(11, 20), /revisar/);
  assert.match(quizBand(2, 20), /Releia/);
  assert.match(quizBand(0, 0), /Releia/);
});
