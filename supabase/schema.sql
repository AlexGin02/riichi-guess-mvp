create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  status text not null default 'waiting',
  current_phase text not null default 'waiting',
  east_player_id text,
  south_player_id text,
  game_state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.players (
  id text not null,
  room_id uuid not null references public.rooms(id) on delete cascade,
  seat text not null check (seat in ('east', 'south')),
  display_name text,
  hand_json jsonb not null default '[]'::jsonb,
  river_json jsonb not null default '[]'::jsonb,
  is_connected boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, id),
  unique (room_id, seat)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rooms_set_updated_at on public.rooms;
create trigger rooms_set_updated_at
before update on public.rooms
for each row execute function public.set_updated_at();

drop trigger if exists players_set_updated_at on public.players;
create trigger players_set_updated_at
before update on public.players
for each row execute function public.set_updated_at();

alter table public.rooms enable row level security;
alter table public.players enable row level security;

drop policy if exists "anonymous rooms read" on public.rooms;
create policy "anonymous rooms read" on public.rooms
for select to anon using (true);

drop policy if exists "anonymous rooms insert" on public.rooms;
create policy "anonymous rooms insert" on public.rooms
for insert to anon with check (true);

drop policy if exists "anonymous rooms update" on public.rooms;
create policy "anonymous rooms update" on public.rooms
for update to anon using (true) with check (true);

drop policy if exists "anonymous players read" on public.players;
create policy "anonymous players read" on public.players
for select to anon using (true);

drop policy if exists "anonymous players insert" on public.players;
create policy "anonymous players insert" on public.players
for insert to anon with check (true);

drop policy if exists "anonymous players update" on public.players;
create policy "anonymous players update" on public.players
for update to anon using (true) with check (true);

do $$
begin
  alter publication supabase_realtime add table public.rooms;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.players;
exception
  when duplicate_object then null;
end $$;
