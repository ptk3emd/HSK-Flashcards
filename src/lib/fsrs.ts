import { Card, CardState, FSRSOptions, Rating } from '../types/card';

/** Default FSRS-6 parameters (21 weights). */
export const DEFAULT_FSRS_WEIGHTS: number[] = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666,
  0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658,
  0.1542,
];

/** The 19 weights used by the legacy FSRS-5 engine. */
export const DEFAULT_FSRS5_WEIGHTS: number[] = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0234, 1.616, 0.1544,
  1.0824, 1.9813, 0.0953, 0.2975, 2.2042, 0.2407, 2.9466, 0.5034, 0.6567,
];

export const FSRS5_DEFAULT_DECAY = 0.5;
export const FSRS6_DEFAULT_DECAY = 0.1542;

export const DEFAULT_FSRS_OPTIONS: FSRSOptions = {
  request_retention: 0.90,
  maximum_interval: 36500,
  w: [...DEFAULT_FSRS_WEIGHTS],
  enable_fuzz: false,
  fsrsVersion: 6,
};

export const DEFAULT_FSRS5_OPTIONS: FSRSOptions = {
  request_retention: 0.90,
  maximum_interval: 36500,
  w: [...DEFAULT_FSRS5_WEIGHTS],
  enable_fuzz: false,
  fsrsVersion: 5,
};

export const WEIGHTS_COUNT = DEFAULT_FSRS_WEIGHTS.length;
export const FSRS5_WEIGHTS_COUNT = DEFAULT_FSRS5_WEIGHTS.length;
export const RETENTION_MIN = 0.7;
export const RETENTION_MAX = 0.99;
export const MAX_INTERVAL_LIMIT = 36500;

export const S_MIN = 0.001;
export const S_MAX = 36500;
export const INIT_S_MAX = 100;

// Anki's default: a card that lapses this many times is flagged as a leech.
export const LEECH_THRESHOLD = 8;

const ENABLE_SHORT_TERM = true;
const LEARNING_STEP_MINUTES = 10;
const HARD_STEP_MINUTES = Math.round(LEARNING_STEP_MINUTES * 1.5);
const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Safe ranges for the 21 FSRS-6 weights. w19 accepts 0 because the 19-to-21
 * migration appends [0, 0.5]: 0 neutralises the new stability exponent and
 * 0.5 reproduces the FSRS-5 forgetting curve.
 */
export const WEIGHT_RANGES: ReadonlyArray<readonly [number, number]> = [
  [S_MIN, INIT_S_MAX],
  [S_MIN, INIT_S_MAX],
  [S_MIN, INIT_S_MAX],
  [S_MIN, INIT_S_MAX],
  [1, 10],
  [0.001, 4],
  [0.001, 4],
  [0.001, 0.75],
  [0, 4.5],
  [0, 0.8],
  [0.001, 3.5],
  [0.001, 5],
  [0.001, 0.25],
  [0.001, 0.9],
  [0, 4],
  [0, 1],
  [1, 6],
  [0, 2],
  [0, 2],
  [0, 0.8],
  [0.1, 0.8],
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function computeDecayFactor(w: number[]): { decay: number; factor: number } {
  const decay = -w[20];
  const factor = roundTo(Math.exp(Math.log(0.9) / decay) - 1, 8);
  return { decay, factor };
}

/** Parameters of the forgetting curve for the given weights, for display and charts. */
export function getForgettingCurveParams(weights?: number[]): { decay: number; factor: number } {
  return computeDecayFactor(resolveWeights(weights));
}

function forgettingCurve(elapsedDays: number, stability: number, w: number[]): number {
  const { decay, factor } = computeDecayFactor(w);
  return roundTo(Math.pow(1 + (factor * elapsedDays) / stability, decay), 8);
}

/**
 * Exact fractional days between the last review and `now`, used by the stats
 * curves. The scheduler uses whole UTC calendar days, like ts-fsrs.
 */
export function elapsedDaysSince(lastReview: string, now: Date): number {
  const diff = now.getTime() - new Date(lastReview).getTime();
  return Number.isFinite(diff) ? Math.max(0, diff / DAY_MS) : 0;
}

function calendarDaysBetween(last: Date, now: Date): number {
  const utc1 = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate());
  const utc2 = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (!Number.isFinite(utc1) || !Number.isFinite(utc2)) return 0;
  return Math.max(0, Math.floor((utc2 - utc1) / DAY_MS));
}

/**
 * Request retention for a card: its HSK level override if set, otherwise the global value.
 */
export function retentionForCard(card: Card, options: FSRSOptions): number {
  return options.retention_by_level?.[card.level] ?? options.request_retention;
}

/**
 * Leech flag derived from the FSRS lapse counter; not stored on the card.
 */
export function isLeech(card: Card): boolean {
  return card.lapses >= LEECH_THRESHOLD;
}

function weightValidationError(values: unknown): string | null {
  if (!Array.isArray(values)) return `Use ${WEIGHTS_COUNT} números separados por vírgula.`;
  if (values.length !== WEIGHTS_COUNT) {
    return `Use ${WEIGHTS_COUNT} pesos (FSRS-6); recebi ${values.length}.`;
  }
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return `O peso ${i + 1} não é um número válido.`;
    }
    const [min, max] = WEIGHT_RANGES[i];
    if (value < min || value > max) {
      return `Peso ${i + 1} fora da faixa: use entre ${min} e ${max}.`;
    }
  }
  return null;
}

/**
 * A weight set is usable when it has 21 finite numbers inside the FSRS-6 ranges.
 */
export function isValidWeights(values: unknown): values is number[] {
  return weightValidationError(values) === null;
}

/**
 * Legacy FSRS-5 sets keep their old contract: 19 finite numbers, positive initial stabilities.
 */
export function isValidLegacyWeights(values: unknown): values is number[] {
  if (!Array.isArray(values) || values.length !== FSRS5_WEIGHTS_COUNT) return false;
  return values.every((v, i) => typeof v === 'number' && Number.isFinite(v) && (i >= 4 || v > 0));
}

/**
 * Parses a user-entered list of FSRS-6 weights (comma, space or newline separated).
 */
export function parseWeights(text: string): { weights: number[] | null; error: string | null } {
  const values = text.split(/[\s,;]+/).filter(Boolean).map(Number);
  const error = weightValidationError(values);
  return { weights: error === null ? values : null, error };
}

/**
 * Resolves a stored set to 21 weights. Legacy 19-weight sets get [0, 0.5]
 * appended, which keeps the FSRS-5 forgetting curve.
 */
export function resolveWeights(w?: number[]): number[] {
  if (isValidWeights(w)) return w;
  if (isValidLegacyWeights(w)) return [...w, 0, FSRS5_DEFAULT_DECAY];
  return DEFAULT_FSRS_WEIGHTS;
}

/**
 * Converts a legacy FSRS-5 option set to FSRS-6 without touching the cards.
 * Legacy custom weights are clamped to the new safe ranges.
 */
export function migrateToFSRS6(options: FSRSOptions): FSRSOptions {
  if (isValidWeights(options.w)) {
    return { ...options, fsrsVersion: 6 };
  }
  const legacy = isValidLegacyWeights(options.w) ? options.w : DEFAULT_FSRS5_WEIGHTS;
  const migrated = legacy.map((value, i) => clamp(value, WEIGHT_RANGES[i][0], WEIGHT_RANGES[i][1]));
  migrated.push(0, FSRS5_DEFAULT_DECAY);
  return { ...options, w: migrated, fsrsVersion: 6 };
}

/**
 * Retrievability calculation: R(t, S) = (1 + factor * t / S)^decay.
 */
export function calculateRetrievability(
  elapsedDays: number,
  stability: number,
  weights?: number[]
): number {
  if (!Number.isFinite(elapsedDays) || !Number.isFinite(stability) || stability <= 0) return 0;
  const w = resolveWeights(weights);
  return forgettingCurve(Math.max(0, elapsedDays), stability, w);
}

function initStability(rating: Rating, w: number[]): number {
  return Math.max(w[rating - 1], 0.1);
}

function initDifficulty(rating: Rating, w: number[]): number {
  const d0 = w[4] - Math.exp((rating - 1) * w[5]) + 1;
  return roundTo(d0, 8);
}

function nextDifficulty(d: number, rating: Rating, w: number[]): number {
  const delta = -w[6] * (rating - 3);
  const damped = roundTo((delta * (10 - d)) / 9, 8);
  const next = d + damped;
  const meanReversion = roundTo(w[7] * initDifficulty(4, w) + (1 - w[7]) * next, 8);
  return clamp(meanReversion, 1, 10);
}

function nextRecallStability(
  d: number,
  s: number,
  r: number,
  rating: Rating,
  w: number[]
): number {
  const hardPenalty = rating === 2 ? w[15] : 1;
  const easyBonus = rating === 4 ? w[16] : 1;
  const newS =
    s *
    (1 +
      Math.exp(w[8]) *
        (11 - d) *
        Math.pow(s, -w[9]) *
        (Math.exp(w[10] * (1 - r)) - 1) *
        hardPenalty *
        easyBonus);
  return roundTo(clamp(newS, S_MIN, S_MAX), 8);
}

function nextForgetStability(d: number, s: number, r: number, w: number[]): number {
  const formula =
    w[11] *
    Math.pow(d, -w[12]) *
    (Math.pow(s + 1, w[13]) - 1) *
    Math.exp(w[14] * (1 - r));
  const sAfterFail = roundTo(clamp(formula, S_MIN, S_MAX), 8);
  const cap = roundTo(s / Math.exp(w[17] * w[18]), 8);
  return clamp(cap, S_MIN, sAfterFail);
}

function nextShortTermStability(s: number, rating: Rating, w: number[]): number {
  const sinc = Math.pow(s, -w[19]) * Math.exp(w[17] * (rating - 3 + w[18]));
  const masked = rating >= 2 ? Math.max(sinc, 1) : sinc;
  return roundTo(clamp(s * masked, S_MIN, S_MAX), 8);
}

interface MemoryState {
  difficulty: number;
  stability: number;
}

function nextMemoryState(
  memory: MemoryState,
  elapsedDays: number,
  rating: Rating,
  w: number[],
  retrievability?: number
): MemoryState {
  if (memory.difficulty === 0 && memory.stability === 0) {
    return {
      difficulty: clamp(initDifficulty(rating, w), 1, 10),
      stability: initStability(rating, w),
    };
  }

  const r = retrievability ?? forgettingCurve(elapsedDays, memory.stability, w);
  let stability: number;

  if (elapsedDays === 0 && ENABLE_SHORT_TERM) {
    stability = nextShortTermStability(memory.stability, rating, w);
  } else if (rating === 1) {
    stability = nextForgetStability(memory.difficulty, memory.stability, r, w);
  } else {
    stability = nextRecallStability(memory.difficulty, memory.stability, r, rating, w);
  }

  return {
    difficulty: nextDifficulty(memory.difficulty, rating, w),
    stability,
  };
}

/**
 * Calculate interval in days for a given stability and request retention.
 */
export function calculateInterval(
  stability: number,
  requestRetention: number,
  maxInterval: number,
  weights?: number[]
): number {
  const w = resolveWeights(weights);
  const { decay, factor } = computeDecayFactor(w);
  const intervalModifier = roundTo((Math.pow(requestRetention, 1 / decay) - 1) / factor, 8);
  return Math.min(Math.max(1, Math.round(stability * intervalModifier)), maxInterval);
}

export interface NextCardPrediction {
  rating: Rating;
  card: Card;
  intervalText: string;
}

function addDays(now: Date, days: number): Date {
  return new Date(now.getTime() + days * DAY_MS);
}

function addMinutes(now: Date, minutes: number): Date {
  return new Date(now.getTime() + minutes * 60 * 1000);
}

function scheduleFSRS6(card: Card, rating: Rating, now: Date, options: FSRSOptions): Card {
  const w = resolveWeights(options.w);
  const requestRetention = retentionForCard(card, options);
  const isNew = card.state === 0;
  const elapsedDays =
    !isNew && card.last_review ? calendarDaysBetween(new Date(card.last_review), now) : 0;
  const validMemory =
    !isNew && card.difficulty >= 1 && card.stability >= S_MIN && card.stability <= S_MAX;
  const memory: MemoryState = validMemory
    ? { difficulty: card.difficulty, stability: card.stability }
    : { difficulty: 0, stability: 0 };
  const retrievability = validMemory
    ? forgettingCurve(elapsedDays, card.stability, w)
    : undefined;

  let nextState: CardState;
  let nextMemory: MemoryState;
  let scheduledDays: number;
  let due: Date;

  if (card.state === 2 && validMemory) {
    if (rating === 1) {
      nextMemory = nextMemoryState(memory, elapsedDays, rating, w, retrievability);
      nextState = 3;
      scheduledDays = 0;
      due = addMinutes(now, LEARNING_STEP_MINUTES);
    } else {
      const hardState = nextMemoryState(memory, elapsedDays, 2, w, retrievability);
      const goodState = nextMemoryState(memory, elapsedDays, 3, w, retrievability);
      const easyState = nextMemoryState(memory, elapsedDays, 4, w, retrievability);

      let hard = calculateInterval(hardState.stability, requestRetention, options.maximum_interval, w);
      const goodBeforeOrder = calculateInterval(
        goodState.stability,
        requestRetention,
        options.maximum_interval,
        w
      );
      hard = Math.min(hard, goodBeforeOrder);
      const good = Math.max(goodBeforeOrder, hard + 1);
      const easy = Math.max(
        calculateInterval(easyState.stability, requestRetention, options.maximum_interval, w),
        good + 1
      );

      scheduledDays = rating === 2 ? hard : rating === 3 ? good : easy;
      nextMemory = rating === 2 ? hardState : rating === 3 ? goodState : easyState;
      nextState = 2;
      due = addDays(now, scheduledDays);
    }
  } else {
    nextMemory = nextMemoryState(memory, elapsedDays, rating, w, retrievability);
    if (rating <= 2) {
      nextState = card.state === 3 ? 3 : 1;
      scheduledDays = 0;
      due = addMinutes(now, rating === 1 ? LEARNING_STEP_MINUTES : HARD_STEP_MINUTES);
    } else {
      nextState = 2;
      scheduledDays = calculateInterval(
        nextMemory.stability,
        requestRetention,
        options.maximum_interval,
        w
      );
      due = addDays(now, scheduledDays);
    }
  }

  return {
    ...card,
    state: nextState,
    due: due.toISOString(),
    stability: nextMemory.stability,
    difficulty: nextMemory.difficulty,
    elapsed_days: elapsedDays,
    scheduled_days: scheduledDays,
    reps: card.reps + 1,
    lapses: card.state === 2 && rating === 1 ? card.lapses + 1 : card.lapses,
    last_review: now.toISOString(),
  };
}

function scheduleFSRS5(card: Card, rating: Rating, now: Date, options: FSRSOptions): Card {
  const w = isValidLegacyWeights(options.w) ? options.w : DEFAULT_FSRS5_WEIGHTS;
  const requestRetention = retentionForCard(card, options);
  const isNew = card.state === 0;

  let newD = card.difficulty;
  let newS = card.stability;
  let newState: CardState = card.state;
  let scheduledDays = 0;
  let elapsedDays = 0;

  if (card.last_review) {
    elapsedDays = Math.floor(elapsedDaysSince(card.last_review, now));
  }

  const retrievability = isNew
    ? 1
    : calculateRetrievability(elapsedDays, card.stability, w);

  if (isNew) {
    newD = clamp(initDifficulty(rating, w), 1, 10);
    newS = initStability(rating, w);

    if (rating === 1) {
      newState = 1;
      scheduledDays = 0;
    } else if (rating === 2) {
      newState = 1;
      scheduledDays = 0;
    } else if (rating === 3) {
      newState = 2;
      scheduledDays = calculateInterval(newS, requestRetention, options.maximum_interval, w);
    } else {
      newState = 2;
      scheduledDays = calculateInterval(
        newS * 1.3,
        requestRetention,
        options.maximum_interval,
        w
      );
    }
  } else {
    const nextD = card.difficulty - w[6] * (rating - 3);
    newD = clamp(w[7] * initDifficulty(3, w) + (1 - w[7]) * nextD, 1, 10);

    if (rating === 1) {
      const formula =
        w[11] *
        Math.pow(newD, -w[12]) *
        (Math.pow(card.stability + 1, w[13]) - 1) *
        Math.exp(w[14] * (1 - retrievability));
      newS = clamp(formula, 0.1, card.stability);
      newState = 3;
      scheduledDays = 0;
    } else {
      const hardPenalty = rating === 2 ? w[15] : 1;
      const easyBonus = rating === 4 ? w[16] : 1;
      const formula =
        card.stability *
        (1 +
          Math.exp(w[8]) *
            (11 - newD) *
            Math.pow(card.stability, -w[9]) *
            (Math.exp(w[10] * (1 - retrievability)) - 1) *
            hardPenalty *
            easyBonus);
      newS = Math.max(0.1, formula);
      newState = 2;
      scheduledDays = calculateInterval(newS, requestRetention, options.maximum_interval, w);
      if (rating === 2) {
        scheduledDays = Math.max(1, Math.round(scheduledDays * 0.8));
      }
    }
  }

  const due = new Date(now);
  if (scheduledDays === 0) {
    due.setMinutes(due.getMinutes() + (rating === 1 ? 10 : 15));
  } else {
    due.setDate(due.getDate() + scheduledDays);
  }

  return {
    ...card,
    state: newState,
    due: due.toISOString(),
    stability: Number(newS.toFixed(4)),
    difficulty: Number(newD.toFixed(4)),
    elapsed_days: elapsedDays,
    scheduled_days: scheduledDays,
    reps: card.reps + 1,
    lapses: rating === 1 ? card.lapses + 1 : card.lapses,
    last_review: now.toISOString(),
  };
}

/**
 * Computes how a card will evolve given a specific rating (1, 2, 3, or 4).
 * FSRS-6 is the default; a stored fsrsVersion 5 keeps the legacy engine.
 */
export function scheduleCard(
  card: Card,
  rating: Rating,
  now: Date = new Date(),
  options: FSRSOptions = DEFAULT_FSRS_OPTIONS
): Card {
  const version =
    options.fsrsVersion ?? (options.w.length === FSRS5_WEIGHTS_COUNT ? 5 : 6);
  if (version === 5) return scheduleFSRS5(card, rating, now, options);
  return scheduleFSRS6(card, rating, now, options);
}

/**
 * Format interval into human readable text for Anki buttons (< 10m, 1d, 3d, etc.)
 */
export function formatIntervalPreview(
  scheduledDays: number,
  isShortStep: boolean,
  due?: string,
  now?: Date
): string {
  if (isShortStep || scheduledDays === 0) {
    if (due && now) {
      const minutes = Math.max(1, Math.round((new Date(due).getTime() - now.getTime()) / 60000));
      return `${minutes}m`;
    }
    return '< 10m';
  }
  if (scheduledDays === 1) {
    return '1d';
  }
  if (scheduledDays < 30) {
    return `${scheduledDays}d`;
  }
  if (scheduledDays < 365) {
    const months = (scheduledDays / 30).toFixed(1);
    return `${months.endsWith('.0') ? months.slice(0, -2) : months}m`;
  }
  const years = (scheduledDays / 365).toFixed(1);
  return `${years.endsWith('.0') ? years.slice(0, -2) : years}a`;
}

/**
 * Predict interval previews for each rating (1=Again, 2=Hard, 3=Good, 4=Easy)
 */
export function predictNextIntervals(
  card: Card,
  now: Date = new Date(),
  options: FSRSOptions = DEFAULT_FSRS_OPTIONS
): Record<Rating, { text: string; nextCard: Card }> {
  const result = {} as Record<Rating, { text: string; nextCard: Card }>;
  const ratings: Rating[] = [1, 2, 3, 4];

  ratings.forEach((rating) => {
    const nextCard = scheduleCard(card, rating, now, options);
    const isShortStep = nextCard.scheduled_days === 0;
    result[rating] = {
      text: formatIntervalPreview(nextCard.scheduled_days, isShortStep, nextCard.due, now),
      nextCard,
    };
  });

  return result;
}
