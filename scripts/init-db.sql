-- Players: Identität (keine Auth nötig)
create table if not exists public.players (
  id uuid primary key,
  name text not null check (char_length(name) between 1 and 32),
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

-- Aktueller Zustand (das, was alle live sehen)
create table if not exists public.player_state (
  player_id uuid primary key references public.players(id) on delete cascade,
  room text not null default 'main',
  pose text not null default 'idle',
  item text not null default 'none',
  updated_at timestamptz not null default now()
);

create index if not exists player_state_room_idx on public.player_state(room);

-- Optional: Event-Feed / Debug
create table if not exists public.events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  actor_player_id uuid references public.players(id) on delete set null,
  type text not null,
  payload jsonb not null default '{}'::jsonb
);

-- Rate limit pro Player (simple + effektiv)
create table if not exists public.rate_limits (
  player_id uuid primary key,
  window_start timestamptz not null,
  hits int not null
);

-- Row Level Security aktivieren
alter table public.players enable row level security;
alter table public.player_state enable row level security;
alter table public.events enable row level security;
alter table public.rate_limits enable row level security;

-- Policies für anonyme Nutzer (lesen erlaubt, schreiben nicht)
create policy "read players"
on public.players for select
to anon
using (true);

create policy "read state"
on public.player_state for select
to anon
using (true);

create policy "read events"
on public.events for select
to anon
using (true);

-- Avatar-URL für Spieler hinzufügen
alter table public.players
add column if not exists avatar_url text;

-- Position (x,y) für Spieler hinzufügen
alter table public.player_state
  add column if not exists x real not null default 0.5,
  add column if not exists y real not null default 0.5;


