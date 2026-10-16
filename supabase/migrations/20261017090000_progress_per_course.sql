-- One progress row per student and course (Mandarin "zh", French "fr"). Rows written before
-- the French course existed are Mandarin, which the default records.
alter table public.user_progress
  add column course text not null default 'zh' check (course in ('zh', 'fr'));

alter table public.user_progress drop constraint user_progress_pkey;
alter table public.user_progress add primary key (user_id, course);

-- review_logs needs no change: French card ids start with F-, Mandarin ones with S-.
