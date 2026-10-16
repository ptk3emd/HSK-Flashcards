-- French course vocabulary (Palier Français): the HSK 3.0 list with its French equivalent,
-- one row per word. F-00001 is the French counterpart of S-00001 in public.hsk_cards.
-- Reference data shared by every student: readable from the app, written only by the seed
-- script (scripts/seed-fr.ts) with the service role.

create table public.fr_cards (
  id text primary key check (id ~ '^F-[0-9]{5}$'), -- F-00001 ... F-11000
  word text not null,                               -- the French entry on the card front
  ptbr text not null,
  level text not null check (level in ('HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5', 'HSK 6', 'HSK 7-9')),
  pos text,
  tags text[] not null default '{}'
);

create index fr_cards_level_id_idx on public.fr_cards (level, id);

alter table public.fr_cards enable row level security;

create policy "FR cards: public read" on public.fr_cards
  for select to anon, authenticated using (true);

revoke all on public.fr_cards from anon, authenticated;
grant select on public.fr_cards to anon, authenticated;
grant select, insert, update, delete on public.fr_cards to service_role;
