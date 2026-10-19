-- The Learn tab now teaches grammar points (HSK 1-6) and replaces the mock exams with
-- grammar practice quizzes. These two jsonb columns carry that progress per course row.
-- stories_read and exam_attempts stay in place, unused, so already deployed app versions
-- keep working during the transition.

alter table public.user_progress
  add column grammar_studied jsonb not null default '[]'::jsonb check (jsonb_typeof(grammar_studied) = 'array'),
  add column quiz_attempts jsonb not null default '[]'::jsonb check (jsonb_typeof(quiz_attempts) = 'array');
