-- Study progress synced from the app. The browser stays the source of truth while offline;
-- these tables hold each signed-in student's copy so it follows them across devices.

-- One row per student: the cards they have touched (studied, suspended or annotated),
-- their settings and their Learn-tab progress. Written by the app as a debounced upsert.
create table public.user_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  cards jsonb not null default '[]'::jsonb check (jsonb_typeof(cards) = 'array'),
  deck_config jsonb,
  fsrs_options jsonb,
  stories_read jsonb not null default '[]'::jsonb check (jsonb_typeof(stories_read) = 'array'),
  exam_attempts jsonb not null default '[]'::jsonb check (jsonb_typeof(exam_attempts) = 'array'),
  updated_at timestamptz not null default now()
);

-- Every answer, append-only: the usage history behind the statistics.
create table public.review_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id text not null,
  rating smallint not null check (rating between 1 and 4),
  state smallint not null check (state between 0 and 3),
  reviewed_at timestamptz not null,
  scheduled_days integer,
  stability double precision,
  difficulty double precision,
  -- The same answer sent twice (a retry after a dropped connection) is stored once
  unique (user_id, card_id, reviewed_at)
);
create index review_logs_user_time_idx on public.review_logs (user_id, reviewed_at desc);

alter table public.user_progress enable row level security;
alter table public.review_logs enable row level security;

-- Each student reads and writes only their own rows.
create policy "Own progress: select" on public.user_progress
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own progress: insert" on public.user_progress
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own progress: update" on public.user_progress
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Own progress: delete" on public.user_progress
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Own reviews: select" on public.review_logs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own reviews: insert" on public.review_logs
  for insert to authenticated with check ((select auth.uid()) = user_id);
-- Undo removes the answer it reverts
create policy "Own reviews: delete" on public.review_logs
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Expose the tables to signed-in users through the Data API; anonymous visitors get nothing.
revoke all on public.user_progress, public.review_logs from anon;
grant select, insert, update, delete on public.user_progress to authenticated;
grant select, insert, delete on public.review_logs to authenticated;
