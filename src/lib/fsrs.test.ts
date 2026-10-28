import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Card, CardState, FSRSOptions, Rating } from '../types/card';
import {
  DEFAULT_FSRS5_WEIGHTS,
  DEFAULT_FSRS_WEIGHTS,
  DEFAULT_FSRS5_OPTIONS,
  DEFAULT_FSRS_OPTIONS,
  FSRS5_DEFAULT_DECAY,
  FSRS5_WEIGHTS_COUNT,
  FSRS6_DEFAULT_DECAY,
  WEIGHTS_COUNT,
  calculateRetrievability,
  elapsedDaysSince,
  getForgettingCurveParams,
  isValidLegacyWeights,
  isValidWeights,
  migrateToFSRS6,
  parseWeights,
  resolveWeights,
  scheduleCard,
} from './fsrs';
import { sanitizeFSRSOptions } from './storage';
import { preferNewerFSRS } from './syncMerge';
import {
  Card as TSCard,
  Grade,
  Rating as TSRating,
  State as TSState,
  fsrs,
} from 'ts-fsrs';

const baseCard = (extra: Partial<Card> = {}): Card => ({
  id: 'test',
  hanzi: '',
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

const options: FSRSOptions = {
  ...DEFAULT_FSRS_OPTIONS,
  w: [...DEFAULT_FSRS_WEIGHTS],
  enable_fuzz: false,
};

const reference = fsrs({
  request_retention: options.request_retention,
  maximum_interval: options.maximum_interval,
  w: options.w,
  enable_fuzz: false,
  enable_short_term: true,
  learning_steps: ['10m'] as const,
  relearning_steps: ['10m'] as const,
});

const toTsCard = (card: Card): TSCard => ({
  due: new Date(card.due),
  stability: card.stability,
  difficulty: card.difficulty,
  elapsed_days: card.elapsed_days,
  scheduled_days: card.scheduled_days,
  learning_steps: 0,
  reps: card.reps,
  lapses: card.lapses,
  state: card.state as unknown as TSState,
  last_review: card.last_review ? new Date(card.last_review) : undefined,
});

const tsRating = (rating: Rating): Grade => {
  const map = {
    1: TSRating.Again,
    2: TSRating.Hard,
    3: TSRating.Good,
    4: TSRating.Easy,
  } as const;
  return map[rating];
};

const assertClose = (actual: number, expected: number, label: string) => {
  assert.ok(
    Math.abs(actual - expected) <= 1e-8,
    `${label}: expected ${expected}, received ${actual}`
  );
};

const compareWithReference = (card: Card, rating: Rating, now: Date, custom = options) => {
  const ours = scheduleCard(card, rating, now, custom);
  const engine = custom === options ? reference : fsrs({ request_retention: custom.retention_by_level?.[card.level] ?? custom.request_retention, maximum_interval: custom.maximum_interval, w: custom.w[19] === 0 && custom.w[20] === 0.5 ? custom.w.slice(0, 19) : custom.w, enable_fuzz: false, enable_short_term: true, learning_steps: ['10m'], relearning_steps: ['10m'] });
  const theirs = engine.next(toTsCard(card), now, tsRating(rating)).card;
  // ts-fsrs 5.4.2 orders Good/Easy after applying the cap and can exceed it by 1–2d.
  // Our deliberate boundary correction leaves memory math identical to the reference.
  if (theirs.scheduled_days > custom.maximum_interval) {
    theirs.scheduled_days = custom.maximum_interval;
    theirs.due = new Date(now.getTime() + custom.maximum_interval * 86400000);
  }

  assert.equal(ours.state, theirs.state, `state for rating ${rating}`);
  assert.equal(ours.scheduled_days, theirs.scheduled_days, `scheduled_days for rating ${rating}`);
  assert.equal(ours.reps, theirs.reps, `reps for rating ${rating}`);
  assert.equal(ours.lapses, theirs.lapses, `lapses for rating ${rating}`);
  assert.equal(ours.elapsed_days, theirs.elapsed_days, `elapsed_days for rating ${rating}`);
  assertClose(ours.stability, theirs.stability, `stability for rating ${rating}`);
  assertClose(ours.difficulty, theirs.difficulty, `difficulty for rating ${rating}`);
  assert.equal(
    new Date(ours.due).getTime(),
    new Date(theirs.due).getTime(),
    `due for rating ${rating}`
  );
};

test('the default weight sets have the FSRS-6 and FSRS-5 sizes', () => {
  assert.equal(WEIGHTS_COUNT, 21);
  assert.equal(FSRS5_WEIGHTS_COUNT, 19);
  assert.equal(DEFAULT_FSRS_WEIGHTS.length, 21);
  assert.equal(DEFAULT_FSRS5_WEIGHTS.length, 19);
  assert.ok(isValidWeights(DEFAULT_FSRS_WEIGHTS));
  assert.ok(isValidLegacyWeights(DEFAULT_FSRS5_WEIGHTS));
});

test('parseWeights accepts the 21 defaults and rejects missing or out-of-range weights', () => {
  assert.deepEqual(parseWeights(DEFAULT_FSRS_WEIGHTS.join(', ')), {
    weights: DEFAULT_FSRS_WEIGHTS,
    error: null,
  });

  const missing = parseWeights(DEFAULT_FSRS_WEIGHTS.slice(0, 20).join(','));
  assert.equal(missing.weights, null);
  assert.match(missing.error ?? '', /21 pesos/);

  const negativeDecay = [...DEFAULT_FSRS_WEIGHTS];
  negativeDecay[20] = 0;
  const invalid = parseWeights(negativeDecay.join(','));
  assert.equal(invalid.weights, null);
  assert.match(invalid.error ?? '', /Peso 21/);
});

test('migration appends [0, 0.5] and leaves the FSRS-5 curve intact', () => {
  const migrated = migrateToFSRS6(DEFAULT_FSRS5_OPTIONS);
  assert.equal(migrated.fsrsVersion, 6);
  assert.equal(migrated.w.length, 21);
  assert.deepEqual(migrated.w.slice(0, 19), DEFAULT_FSRS5_WEIGHTS);
  assert.deepEqual(migrated.w.slice(19), [0, 0.5]);
});

test('migration keeps an already valid 21-weight set', () => {
  const migrated = migrateToFSRS6({ ...options, fsrsVersion: 5 });
  assert.equal(migrated.fsrsVersion, 6);
  assert.deepEqual(migrated.w, DEFAULT_FSRS_WEIGHTS);
});

test('resolveWeights appends the legacy decay for 19-weight sets', () => {
  assert.deepEqual(resolveWeights(DEFAULT_FSRS5_WEIGHTS).slice(19), [0, 0.5]);
  assert.deepEqual(resolveWeights(DEFAULT_FSRS_WEIGHTS), DEFAULT_FSRS_WEIGHTS);
});

test('storage treats 19 weights as FSRS-5 and 21 weights as FSRS-6', () => {
  const legacy = sanitizeFSRSOptions({ ...DEFAULT_FSRS_OPTIONS, w: DEFAULT_FSRS5_WEIGHTS });
  assert.equal(legacy.fsrsVersion, 5);
  assert.deepEqual(legacy.w, DEFAULT_FSRS5_WEIGHTS);

  const current = sanitizeFSRSOptions({ ...DEFAULT_FSRS_OPTIONS, w: DEFAULT_FSRS_WEIGHTS, fsrsVersion: undefined });
  assert.equal(current.fsrsVersion, 6);
  assert.deepEqual(current.w, DEFAULT_FSRS_WEIGHTS);

  const corrupt = sanitizeFSRSOptions({ ...DEFAULT_FSRS_OPTIONS, w: [1, 2], fsrsVersion: 5 });
  assert.equal(corrupt.fsrsVersion, 5);
  assert.deepEqual(corrupt.w, DEFAULT_FSRS5_WEIGHTS);
});

test('an older cloud copy never downgrades a newer scheduler', () => {
  const local = { ...options, fsrsVersion: 6 as const };
  const remote5 = { ...DEFAULT_FSRS5_OPTIONS };
  const remote6 = { ...options, request_retention: 0.85, fsrsVersion: 6 as const };

  assert.deepEqual(preferNewerFSRS(local, remote5), local);
  assert.deepEqual(preferNewerFSRS(local, remote6), remote6);
  assert.deepEqual(preferNewerFSRS(remote5, local), local);
});

test('retrievability is 1 at review time and 0.9 at the stability interval', () => {
  assertClose(calculateRetrievability(0, 10, DEFAULT_FSRS_WEIGHTS), 1, 'R at t=0');
  assertClose(calculateRetrievability(10, 10, DEFAULT_FSRS_WEIGHTS), 0.9, 'R at t=S');
  assert.equal(calculateRetrievability(10, 0, DEFAULT_FSRS_WEIGHTS), 0);
});

test('the curve params keep the FSRS-6 decay negative and recover the legacy factor', () => {
  const current = getForgettingCurveParams(DEFAULT_FSRS_WEIGHTS);
  assertClose(current.decay, -FSRS6_DEFAULT_DECAY, 'FSRS-6 decay');
  assertClose(current.factor, Math.pow(0.9, -1 / FSRS6_DEFAULT_DECAY) - 1, 'FSRS-6 factor');

  const legacy = getForgettingCurveParams(DEFAULT_FSRS5_WEIGHTS);
  assertClose(legacy.decay, -FSRS5_DEFAULT_DECAY, 'legacy decay');
  assertClose(legacy.factor, 19 / 81, 'legacy factor');
  assertClose(
    calculateRetrievability(10, 10, DEFAULT_FSRS5_WEIGHTS),
    0.9,
    'legacy R at t=S'
  );
});

test('elapsedDaysSince is fractional for stats', () => {
  assertClose(
    elapsedDaysSince('2026-01-01T00:00:00.000Z', new Date('2026-01-01T12:00:00.000Z')),
    0.5,
    'half a day'
  );
});

test('new cards match ts-fsrs for every rating', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  for (const rating of [1, 2, 3, 4] as Rating[]) {
    compareWithReference(baseCard(), rating, now);
  }
});

test('learning cards match ts-fsrs, including the 10/15 minute steps', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const afterAgain = scheduleCard(baseCard(), 1, now, options);
  assert.equal(afterAgain.state, 1);
  assert.equal(afterAgain.scheduled_days, 0);
  assert.equal(new Date(afterAgain.due).getTime(), now.getTime() + 10 * 60_000);

  const later = new Date(now.getTime() + 10 * 60_000);
  for (const rating of [1, 2, 3, 4] as Rating[]) {
    compareWithReference(afterAgain, rating, later);
  }

  const afterHard = scheduleCard(baseCard(), 2, now, options);
  assert.equal(afterHard.state, 1);
  assert.equal(new Date(afterHard.due).getTime(), now.getTime() + 15 * 60_000);
  compareWithReference(afterHard, 3, new Date(now.getTime() + 15 * 60_000));
});

test('review cards match ts-fsrs, including the lapse cap and interval ordering', () => {
  const lastReview = new Date('2026-01-01T00:00:00.000Z');
  const now = new Date('2026-01-06T00:00:00.000Z');
  const card = baseCard({
    state: 2,
    due: lastReview.toISOString(),
    last_review: lastReview.toISOString(),
    stability: 20,
    difficulty: 6,
    reps: 4,
    lapses: 1,
  });

  for (const rating of [1, 2, 3, 4] as Rating[]) {
    compareWithReference(card, rating, now);
  }

  const hard = scheduleCard(card, 2, now, options);
  const good = scheduleCard(card, 3, now, options);
  const easy = scheduleCard(card, 4, now, options);
  assert.ok(hard.scheduled_days <= good.scheduled_days);
  assert.ok(good.scheduled_days >= hard.scheduled_days + 1);
  assert.ok(easy.scheduled_days >= good.scheduled_days + 1);
});

test('same-day reviews match ts-fsrs and use short-term stability', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const card = baseCard({
    state: 2,
    due: now.toISOString(),
    last_review: now.toISOString(),
    stability: 5,
    difficulty: 5,
    reps: 2,
  });

  for (const rating of [1, 2, 3, 4] as Rating[]) {
    compareWithReference(card, rating, now);
  }
});

test('19-weight options run the legacy engine even without an explicit version', () => {
  const now = new Date('2026-01-06T00:00:00.000Z');
  const card = baseCard({
    state: 2,
    due: '2026-01-01T00:00:00.000Z',
    last_review: '2026-01-01T00:00:00.000Z',
    stability: 10,
    difficulty: 5,
    reps: 2,
  });
  const legacyOptions: FSRSOptions = {
    ...DEFAULT_FSRS5_OPTIONS,
    w: [...DEFAULT_FSRS5_WEIGHTS],
  };
  const implicit = scheduleCard(card, 3, now, { ...legacyOptions, fsrsVersion: undefined });
  const explicit = scheduleCard(card, 3, now, legacyOptions);
  assert.deepEqual(implicit, explicit);
});

test('an invalid card state falls back to a safe new-card schedule', () => {
  const card = baseCard({
    state: 2,
    stability: 0,
    difficulty: 0,
    last_review: '2026-01-01T00:00:00.000Z',
  });
  const next = scheduleCard(card, 3, new Date('2026-01-02T00:00:00.000Z'), options);
  assert.equal(next.state, 2);
  assert.ok(next.stability > 0);
  assert.ok(next.scheduled_days >= 1);
});

test('FSRS-6 learning state numbers line up with the app state type', () => {
  const card = baseCard();
  const next = scheduleCard(card, 1, new Date('2026-01-01T00:00:00.000Z'), options);
  const state: CardState = next.state;
  assert.equal(state, 1);
});


test('FSRS-6 matches reference across retention overrides, limits, memory and elapsed days', () => {
  const last = '2026-01-01T23:55:00.000Z';
  for (const retention of [0.7, 0.85, 0.9, 0.99]) {
    for (const maximum_interval of [1, 30, 36500]) {
      for (const stability of [0.1, 1, 20, 36500]) {
        for (const difficulty of [1, 5, 10]) {
          for (const days of [0, 1, 30, 365]) {
            const card = baseCard({ state: 2, stability, difficulty, reps: 10, last_review: last });
            const custom = { ...options, maximum_interval, retention_by_level: { 'HSK 1': retention } };
            const now = new Date(Date.parse(last) + days * 86400000 + 600000);
            for (const rating of [1, 2, 3, 4] as Rating[]) compareWithReference(card, rating, now, custom);
          }
        }
      }
    }
  }
});

test('FSRS-6 matches reference through a deterministic 200-answer history', () => {
  let card = baseCard();
  let now = new Date('2026-01-01T23:55:00.000Z');
  for (let i = 0; i < 200; i++) {
    const rating = ([1, 3, 2, 3, 4, 3, 1, 3, 3, 4] as Rating[])[i % 10];
    compareWithReference(card, rating, now);
    card = scheduleCard(card, rating, now, options);
    now = new Date(Date.parse(card.due) + (i % 3) * 86400000);
  }
});


test('all review grades respect the maximum even when ordering reaches the ceiling', () => {
  for (const maximum_interval of [1, 2, 30, 36500]) {
    const card = baseCard({ state: 2, stability: 36500, difficulty: 1, reps: 10, last_review: '2025-01-01T00:00:00.000Z' });
    const now = new Date('2026-01-01T00:00:00.000Z');
    const intervals = ([2, 3, 4] as Rating[]).map(rating => {
      const next = scheduleCard(card, rating, now, { ...options, maximum_interval });
      assert.ok(next.scheduled_days >= 1 && next.scheduled_days <= maximum_interval);
      assert.equal(Date.parse(next.due) - now.getTime(), next.scheduled_days * 86400000);
      return next.scheduled_days;
    });
    assert.ok(intervals[0] <= intervals[1] && intervals[1] <= intervals[2]);
  }
});

test('custom FSRS-6 weights match reference for learning and relearning', () => {
  const customWeights = [...DEFAULT_FSRS_WEIGHTS];
  customWeights[19] = 0.3;
  customWeights[20] = 0.4;
  for (const w of [customWeights]) {
    for (const state of [1, 3] as CardState[]) {
      for (const days of [0, 1, 7]) {
        const card = baseCard({ state, stability: 2, difficulty: 5, reps: 4, lapses: 1, last_review: '2026-01-01T00:00:00.000Z' });
        const now = new Date(Date.parse(card.last_review!) + days * 86400000 + 600000);
        for (const rating of [1, 2, 3, 4] as Rating[]) compareWithReference(card, rating, now, { ...options, w });
      }
    }
  }
});


test('migration deliberately preserves a zero stability exponent instead of clipping it to 0.01', () => {
  const migrated = migrateToFSRS6(DEFAULT_FSRS5_OPTIONS);
  const card = baseCard({ state: 1, stability: 2, difficulty: 5, reps: 1, last_review: '2026-01-01T00:00:00.000Z' });
  const next = scheduleCard(card, 1, new Date('2026-01-01T00:10:00.000Z'), migrated);
  const expected = 2 * Math.exp(migrated.w[17] * (-2 + migrated.w[18]));
  assert.ok(Math.abs(next.stability - expected) < 1e-8);
  assert.equal(migrated.w[19], 0);
});
