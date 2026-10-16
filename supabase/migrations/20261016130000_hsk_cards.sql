-- Official HSK vocabulary (新版HSK考试大纲, chinesetest.cn), one row per word.
-- Reference data shared by every student: readable from the app, written only by
-- the seed script (scripts/seed-hsk.ts) with the service role.

create table public.hsk_cards (
  id text primary key, -- syllabus serial, S-00001 ... S-11000
  hanzi text not null,
  traditional text,
  pinyin text not null,
  ptbr text not null,
  level text not null check (level in ('HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5', 'HSK 6', 'HSK 7-9')),
  pos text, -- part of speech (N, V, Adj...)
  tags text[] not null default '{}'
);

-- The app downloads one level at a time, in syllabus order.
create index hsk_cards_level_id_idx on public.hsk_cards (level, id);

alter table public.hsk_cards enable row level security;

-- The vocabulary is the same for everyone: read by signed-in and anonymous visitors,
-- never written through the Data API.
create policy "HSK cards: public read" on public.hsk_cards
  for select to anon, authenticated using (true);

revoke all on public.hsk_cards from anon, authenticated;
grant select on public.hsk_cards to anon, authenticated;
grant select, insert, update, delete on public.hsk_cards to service_role;
