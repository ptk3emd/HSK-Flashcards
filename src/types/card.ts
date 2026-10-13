export type CardState = 0 | 1 | 2 | 3; // 0: New, 1: Learning, 2: Review, 3: Relearning
export type Rating = 1 | 2 | 3 | 4; // 1: Again, 2: Hard, 3: Good, 4: Easy

export interface Card {
  id: string;
  hanzi: string;
  traditional?: string;
  pinyin: string;
  ptbr: string;
  level: string; // 'HSK 1', 'HSK 2', 'HSK 3', etc.
  pos?: string; // Part of speech (N, V, Adj...)
  tags?: string[];
  
  // FSRS fields
  state: CardState;
  due: string; // ISO date string
  stability: number; // S (days)
  difficulty: number; // D (1 - 10)
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  last_review?: string; // ISO date string

  // Study management
  suspended?: boolean; // Removed from study queues until reactivated
  mnemonic?: string; // User-written memory hint shown on the card back
}

export interface ReviewLog {
  cardId: string;
  rating: Rating;
  state: CardState;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  last_elapsed_days: number;
  scheduled_days: number;
  reviewTime: string;
  previousCardSnapshot: Card;
}

export interface FSRSOptions {
  request_retention: number; // default 0.90
  maximum_interval: number; // default 36500
  w: number[]; // 19 weights
  enable_fuzz: boolean;
  retention_by_level?: Record<string, number>; // Per-HSK-level override of request_retention
}

export type VoiceGenderPreference = 'female' | 'male' | 'auto';

export interface DeckConfig {
  dailyNewLimit: number;
  dailyReviewLimit: number;
  autoPlayAudio: boolean;
  speechSpeed: number; // 0.5 - 1.5
  speechVoiceGender: VoiceGenderPreference; // 'female' | 'male' | 'auto'
  speechVoiceURI?: string;
  activeLevels: string[];
  hideSystemBar: boolean; // Fullscreen: hides the browser and system bars where supported
  hideAnswerButtons: boolean; // Answer with gestures only
  twoButtonGrading: boolean; // Only "Novamente" and "Bom"; "Difícil" and "Fácil" are off
  gestures: GestureMap; // What each gesture on the study card does
}

/** Gestures recognised on the card in the study session */
export type StudyGesture =
  | 'tap'
  | 'doubleTap'
  | 'longPress'
  | 'swipeRight'
  | 'swipeLeft'
  | 'swipeUp'
  | 'swipeDown';

/** Study-screen actions a gesture can trigger */
export type StudyAction =
  | 'none'
  | 'reveal'
  | 'revealOrGood'
  | 'again'
  | 'hard'
  | 'good'
  | 'easy'
  | 'undo'
  | 'speak'
  | 'writing'
  | 'suspend'
  | 'menu';

export type GestureMap = Record<StudyGesture, StudyAction>;

/* Learn tab: stories that teach a grammar point, and HSK mock exams */

export interface StoryToken {
  hanzi: string;
  pinyin: string;
  punct: boolean;
}

export interface StorySentence {
  tokens: StoryToken[];
  ptbr: string;
}

export interface StoryQuestion {
  prompt: string;
  options: string[];
  answer: number;
}

export interface Story {
  id: string;
  level: string;
  grammar: string;
  title: string;
  titlePt: string;
  sentences: StorySentence[];
  questions: StoryQuestion[];
}

export interface GrammarPoint {
  text: string;
  /** The story that teaches this point, when there is one */
  storyId?: string;
}

export interface GrammarGroup {
  category: string;
  points: GrammarPoint[];
}

/** A question about a passage; `explain` is shown when the student gets it wrong. */
export interface ExamQuestion {
  prompt: string;
  options: string[];
  answer: number;
  explain: string;
}

export interface ExamSentence {
  id: string;
  tokens: StoryToken[];
  ptbr: string;
  grammar?: string;
}

export interface ExamPassage {
  id: string;
  sentences: StorySentence[];
  questions: ExamQuestion[];
}

/** A sentence with one blank (a token whose hanzi is ＿) and the options that fill it. */
export interface ExamCloze {
  id: string;
  tokens: StoryToken[];
  ptbr: string;
  options: string[];
  answer: number;
  explain: string;
  grammar: string;
}

export interface ExamBank {
  sentences: ExamSentence[];
  passages: ExamPassage[];
  cloze: ExamCloze[];
}

export interface LevelContent {
  stories: Story[];
  grammar: GrammarGroup[];
  exam: ExamBank;
}

export type ExamPart = 'listening' | 'reading';

export type ExamItemKind = 'listen' | 'sentence' | 'passage' | 'cloze';

export interface ExamItem {
  id: string;
  part: ExamPart;
  kind: ExamItemKind;
  /** Chinese text spoken for a listening item */
  audio?: string;
  /** The Chinese text of the item: shown to read, or kept as the transcript of a listening item */
  text?: StorySentence[];
  prompt: string;
  options: string[];
  answer: number;
  explain?: string;
  grammar?: string;
}

/** A started exam, saved after every answer so a reload can resume it. */
export interface ExamSession {
  level: string;
  items: ExamItem[];
  picks: Record<string, number | null>;
  /** Items whose text was shown for a listening question */
  assisted: string[];
  partIndex: number;
  endsAt: number;
}

export interface ExamPartSpec {
  part: ExamPart;
  label: string;
  count: number;
  minutes: number;
}

export interface ExamAttempt {
  id: string;
  level: string;
  finishedAt: string;
  correct: Record<ExamPart, number>;
  total: Record<ExamPart, number>;
  /** Listening questions answered with the text shown */
  assisted?: number;
}
