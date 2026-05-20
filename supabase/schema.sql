-- Supabase table schema for VibeCheck-MVP
-- Run this SQL in your Supabase SQL editor to create the required tables.

create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  spotify_user_id text,
  spotify_access_token text,
  spotify_refresh_token text,
  spotify_token_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  host_id uuid references public.users(id) on delete set null,
  active_round_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  joined_at timestamptz not null default now()
);

create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  scenario text,
  status text not null default 'playing',
  player_order jsonb,
  current_turn_index integer not null default 0,
  current_pick_id uuid,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.round_picks (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  track_id text,
  track_name text,
  artist_names text,
  album_name text,
  cover_url text,
  uri text,
  started_at timestamptz not null default now(),
  played boolean not null default false
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  round_pick_id uuid not null references public.round_picks(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  score integer not null,
  created_at timestamptz not null default now(),
  constraint votes_unique_round_pick_user unique (round_pick_id, user_id)
);
