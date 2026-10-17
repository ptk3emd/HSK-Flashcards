import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_HSK_LEVELS } from '../data/defaultDecks';
import { COURSES } from './course';
import type { CourseId } from './courseId';

const IDS: CourseId[] = ['zh', 'fr', 'it'];

test('every course names all nine levels and the four grades', () => {
  for (const id of IDS) {
    const course = COURSES[id];
    assert.equal(course.id, id);
    assert.deepEqual(Object.keys(course.levelIndex).sort(), [...ALL_HSK_LEVELS].sort(), id);
    assert.deepEqual(Object.keys(course.sealMarks).sort(), ['1', '2', '3', '4'], id);
    assert.ok(course.voicePrefixes.length > 0, id);
    assert.ok(course.lang.length > 0, id);
  }
});

test('only the Mandarin course has characters and the Learn tab', () => {
  assert.equal(COURSES.zh.hasCharacters, true);
  assert.equal(COURSES.zh.hasLearn, true);
  for (const id of ['fr', 'it'] as const) {
    assert.equal(COURSES[id].hasCharacters, false, id);
    assert.equal(COURSES[id].hasLearn, false, id);
  }
});

test('each course has its own brand and favicon', () => {
  const brands = IDS.map((id) => COURSES[id].brand);
  assert.equal(new Set(brands).size, IDS.length);
  const icons = IDS.map((id) => COURSES[id].favicon);
  assert.equal(new Set(icons).size, IDS.length);
});
