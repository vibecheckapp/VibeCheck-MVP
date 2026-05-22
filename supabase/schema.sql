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
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create index if not exists idx_room_players_last_seen on public.room_players(last_seen);

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
  voter_id uuid not null references public.users(id) on delete cascade,
  score integer not null,
  created_at timestamptz not null default now(),
  constraint votes_unique_round_pick_user unique (round_pick_id, voter_id)
);

create table if not exists public.room_notifications (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete cascade,
  event_type text not null,
  triggered_by uuid,
  created_at timestamptz not null default now()
);

-- Index for efficient cleanup of old notifications
create index if not exists idx_room_notifications_created_at on public.room_notifications(created_at);

-- Trigger: Clean up orphan votes when round_pick is deleted directly
create or replace function cleanup_orphan_votes()
returns trigger as $$
begin
  delete from public.votes where round_pick_id = old.id;
  return old;
end;
$$ language plpgsql security definer;

create or replace trigger trigger_cleanup_votes_on_pick_delete
  before delete on public.round_picks
  for each row
  execute function cleanup_orphan_votes();

-- pg_cron extension for scheduled cleanup
create extension if not exists pg_cron;

-- Scheduled job: Clean up room_notifications older than 7 days (runs daily at 3am)
-- Note: This requires pg_cron to be enabled in Supabase dashboard -> Database -> Extensions
grant usage on schema pg_cron to postgres;
grant execute on function pg_cron.schedule to postgres;
grant execute on function pg_cron.unschedule to postgres;

-- Schedule the cleanup (idempotent - replaces existing schedule)
select
  case
    when (select bool from pg_cron.job where jobname = 'cleanup-old-notifications') then
      pg_cron.unschedule('cleanup-old-notifications')
    else null
  end;

select pg_cron.schedule(
  'cleanup-old-notifications',
  '0 3 * * *', -- Daily at 3:00 AM
  $$delete from public.room_notifications where created_at < now() - interval '7 days'$$
);
