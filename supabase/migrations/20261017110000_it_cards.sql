-- Italian course (Scalino): progress rows may now be for Italian too.
alter table public.user_progress drop constraint user_progress_course_check;
alter table public.user_progress
  add constraint user_progress_course_check check (course in ('zh', 'fr', 'it'));

-- Italian course vocabulary: the HSK 3.0 list with its Italian equivalent, one row per word.
-- I-00001 is the Italian counterpart of S-00001 in public.hsk_cards. Reference data shared by
-- every student: readable from the app, written only by the seed script (npm run seed:it).

create table public.it_cards (
  id text primary key check (id ~ '^I-[0-9]{5}$'), -- I-00001 ... I-11000
  word text not null,                               -- the Italian entry on the card front
  ptbr text not null,
  level text not null check (level in ('HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5', 'HSK 6', 'HSK 7-9')),
  pos text,
  tags text[] not null default '{}'
);

create index it_cards_level_id_idx on public.it_cards (level, id);

alter table public.it_cards enable row level security;

create policy "IT cards: public read" on public.it_cards
  for select to anon, authenticated using (true);

revoke all on public.it_cards from anon, authenticated;
grant select on public.it_cards to anon, authenticated;
grant select, insert, update, delete on public.it_cards to service_role;
