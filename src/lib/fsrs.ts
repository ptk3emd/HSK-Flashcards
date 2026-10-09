import { Card, CardState, FSRSOptions, Rating } from '../types/card';

// Official standard FSRS weights (FSRS-4.5 / v5 / v6-7 formulation)
export const DEFAULT_FSRS_WEIGHTS: number[] = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0234, 1.616, 0.1544,
  1.0824, 1.9813, 0.0953, 0.2975, 2.2042, 0.2407, 2.9466, 0.5034, 0.6567
];

export const DEFAULT_FSRS_OPTIONS: FSRSOptions = {
  request_retention: 0.90,
  maximum_interval: 36500,
  w: DEFAULT_FSRS_WEIGHTS,
  enable_fuzz: false,
};

export const WEIGHTS_COUNT = DEFAULT_FSRS_WEIGHTS.length;
export const RETENTION_MIN = 0.7;
export const RETENTION_MAX = 0.99;
export const MAX_INTERVAL_LIMIT = 36500;

// Anki's default: a card that lapses this many times is flagged as a leech.
export const LEECH_THRESHOLD = 8;

const FACTOR = 19 / 81;
const DECAY = 0.5;
const DAY_MS = 1000 * 60 * 60 * 24;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Whole days elapsed between the last review and `now`, as used by the scheduler.
 */
export function elapsedDaysSince(lastReview: string, now: Date): number {
  const diffTime = Math.max(0, now.getTime() - new Date(lastReview).getTime());
  return Math.max(0, Math.floor(diffTime / DAY_MS));
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

/**
 * A weight set is usable when it has WEIGHTS_COUNT finite numbers and the first four
 * (initial stabilities per rating) are positive; otherwise scheduling produces NaN.
 */
export function isValidWeights(values: unknown): values is number[] {
  if (!Array.isArray(values) || values.length !== WEIGHTS_COUNT) return false;
  return values.every((v, i) => typeof v === 'number' && Number.isFinite(v) && (i >= 4 || v > 0));
}

/**
 * Parses a user-entered list of FSRS weights (comma, space or newline separated).
 * Returns null when the text is not a valid weight set.
 */
export function parseWeights(text: string): number[] | null {
  const values = text.split(/[\s,;]+/).filter(Boolean).map(Number);
  return isValidWeights(values) ? values : null;
}

/**
 * Retrievability calculation: R(t, S)
 */
export function calculateRetrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + FACTOR * (elapsedDays / stability), -DECAY);
}

/**
 * Initial stability for first rating G (1..4)
 */
function initStability(rating: Rating, w: number[]): number {
  return Math.max(0.1, w[rating - 1]);
}

/**
 * Initial difficulty for first rating G (1..4)
 */
function initDifficulty(rating: Rating, w: number[]): number {
  const d0 = w[4] - Math.exp(w[5] * (rating - 1)) + 1;
  return clamp(d0, 1, 10);
}

/**
 * Next difficulty calculation with mean reversion
 */
function nextDifficulty(d: number, rating: Rating, w: number[]): number {
  const nextD = d - w[6] * (rating - 3);
  const meanReversion = w[7] * initDifficulty(3, w) + (1 - w[7]) * nextD;
  return clamp(meanReversion, 1, 10);
}

/**
 * Stability after recall (ratings 2, 3, 4)
 */
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
  return Math.max(0.1, newS);
}

/**
 * Stability after forgetting (rating 1 = Again)
 */
function nextForgetStability(
  d: number,
  s: number,
  r: number,
  w: number[]
): number {
  const newS =
    w[11] *
    Math.pow(d, -w[12]) *
    (Math.pow(s + 1, w[13]) - 1) *
    Math.exp(w[14] * (1 - r));
  return clamp(newS, 0.1, s);
}

/**
 * Calculate interval in days for a given stability and request retention
 */
export function calculateInterval(
  stability: number,
  requestRetention: number,
  maxInterval: number
): number {
  const interval = (stability / FACTOR) * (Math.pow(requestRetention, -1 / DECAY) - 1);
  return Math.min(Math.max(1, Math.round(interval)), maxInterval);
}

export interface NextCardPrediction {
  rating: Rating;
  card: Card;
  intervalText: string;
}

/**
 * Computes how a card will evolve given a specific rating (1, 2, 3, or 4).
 */
export function scheduleCard(
  card: Card,
  rating: Rating,
  now: Date = new Date(),
  options: FSRSOptions = DEFAULT_FSRS_OPTIONS
): Card {
  const { w, maximum_interval } = options;
  const request_retention = retentionForCard(card, options);
  const isNew = card.state === 0;

  let newD = card.difficulty;
  let newS = card.stability;
  let newState: CardState = card.state;
  let scheduledDays = 0;
  let elapsedDays = 0;

  if (card.last_review) {
    elapsedDays = elapsedDaysSince(card.last_review, now);
  }

  const retrievability = isNew ? 1 : calculateRetrievability(elapsedDays, card.stability);

  if (isNew) {
    newD = initDifficulty(rating, w);
    newS = initStability(rating, w);

    if (rating === 1) {
      // Again
      newState = 1; // Learning
      scheduledDays = 0; // due today in 10 minutes
    } else if (rating === 2) {
      // Hard
      newState = 1; // Learning
      scheduledDays = 0;
    } else if (rating === 3) {
      // Good
      newState = 2; // Review
      scheduledDays = calculateInterval(newS, request_retention, maximum_interval);
    } else {
      // Easy
      newState = 2; // Review
      scheduledDays = calculateInterval(newS * 1.3, request_retention, maximum_interval);
    }
  } else {
    // Review or Learning/Relearning
    newD = nextDifficulty(card.difficulty, rating, w);

    if (rating === 1) {
      // Again (lapse)
      newS = nextForgetStability(newD, card.stability, retrievability, w);
      newState = 3; // Relearning
      scheduledDays = 0; // due today
    } else {
      // Hard, Good, Easy
      newS = nextRecallStability(newD, card.stability, retrievability, rating, w);
      newState = 2; // Review
      scheduledDays = calculateInterval(newS, request_retention, maximum_interval);
      if (rating === 2) {
        // Hard interval is slightly less
        scheduledDays = Math.max(1, Math.round(scheduledDays * 0.8));
      }
    }
  }

  // Calculate new due date
  const newDueDate = new Date(now);
  if (scheduledDays === 0) {
    // 10 minutes from now (represented as ISO timestamp)
    newDueDate.setMinutes(newDueDate.getMinutes() + (rating === 1 ? 10 : 15));
  } else {
    newDueDate.setDate(newDueDate.getDate() + scheduledDays);
  }

  return {
    ...card,
    state: newState,
    due: newDueDate.toISOString(),
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
 * Format interval into human readable text for Anki buttons (< 10m, 1d, 3d, etc.)
 */
export function formatIntervalPreview(scheduledDays: number, isShortStep: boolean): string {
  if (isShortStep || scheduledDays === 0) {
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
      text: formatIntervalPreview(nextCard.scheduled_days, isShortStep),
      nextCard,
    };
  });

  return result;
}
