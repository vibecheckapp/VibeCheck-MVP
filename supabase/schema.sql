-- Supabase / Postgres schema for VibeCheck-MVP
-- Realtime-safe, server-authoritative game state model

-- Enable helper extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Room states enumeration
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'room_state') THEN
    CREATE TYPE room_state AS ENUM ('lobby', 'playing', 'voting', 'scoreboard', 'paused', 'finished');
  END IF;
END$$;

-- rooms
CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- legacy code field (kept for compatibility) and canonical room_code used by APIs
  code text,
  room_code text NOT NULL UNIQUE,
  host_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  current_state room_state NOT NULL DEFAULT 'lobby',
  current_round integer NOT NULL DEFAULT 0,
  current_song jsonb,
  active_round_id uuid,
  settings jsonb NOT NULL DEFAULT '{"auto_advance": true, "auto_advance_delay": 10, "anonymous_voting": true, "auto_play_winner_song": true, "auto_play_winner_duration": 30}'::jsonb,
  state_version bigint NOT NULL DEFAULT 0
);

-- players
CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_host boolean NOT NULL DEFAULT false,
  is_connected boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, name)
);

-- users (application-level users table expected by APIs)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  display_name text NOT NULL,
  username text NOT NULL DEFAULT ('player-' || replace(left(gen_random_uuid()::text, 8), '-', '')),
  magic_code text NOT NULL DEFAULT lpad((floor(random() * 10000))::integer::text, 4, '0'),
  last_music_import_at timestamptz,
  spotify_refresh_token text,
  spotify_access_token text,
  spotify_token_expires_at timestamptz,
  spotify_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS spotify_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spotify_user_id text NOT NULL,
  access_token text,
  refresh_token text NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id),
  UNIQUE (spotify_user_id)
);

-- room_players: mapping table used widely in existing APIs
CREATE TABLE IF NOT EXISTS room_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  is_host boolean NOT NULL DEFAULT false
);

-- room_events: authoritative event stream
CREATE TABLE IF NOT EXISTS room_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- scenario_suggestions (compatibility with existing API)
CREATE TABLE IF NOT EXISTS scenario_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id uuid REFERENCES users(id),
  suggestion text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- room_notifications (broadcast messages)
CREATE TABLE IF NOT EXISTS room_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- rounds table (game rounds)
CREATE TABLE IF NOT EXISTS rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  scenario text,
  status text NOT NULL DEFAULT 'playing',
  player_order uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  current_turn_index integer NOT NULL DEFAULT 0,
  current_pick_id uuid,
  played_track_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  votes_cast integer NOT NULL DEFAULT 0,
  votes_needed integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  ended_at timestamptz,
  paused_at timestamptz
);

-- round_picks
CREATE TABLE IF NOT EXISTS round_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id text NOT NULL,
  track_name text,
  artist_names text,
  album_name text,
  cover_url text,
  uri text,
  started_at timestamptz,
  played boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0
);

-- votes
CREATE TABLE IF NOT EXISTS votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  -- support both legacy round number and round_id UUID
  round integer,
  round_id uuid REFERENCES rounds(id) ON DELETE CASCADE,
  player_id uuid REFERENCES players(id) ON DELETE CASCADE,
  song_id text,
  rating integer,
  round_pick_id uuid REFERENCES round_picks(id) ON DELETE CASCADE,
  voter_id uuid REFERENCES users(id) ON DELETE CASCADE,
  score integer CHECK (score IS NULL OR score BETWEEN 1 AND 10),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- create a unique expression index to enforce uniqueness across round_id or round
CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_unique ON votes (
  room_id,
  (COALESCE(round_id::text, round::text)),
  player_id,
  song_id
);

-- song_history (prevents duplicates across rounds)
CREATE TABLE IF NOT EXISTS song_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  song_id text NOT NULL,
  -- optionally reference round id
  round integer,
  round_id uuid REFERENCES rounds(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT song_history_unique UNIQUE (room_id, song_id)
);

-- suggestions
CREATE TABLE IF NOT EXISTS suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id uuid REFERENCES players(id),
  text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- optional songs master table
CREATE TABLE IF NOT EXISTS songs (
  id text PRIMARY KEY,
  spotify_song_id text,
  title text,
  artist text,
  album text,
  image_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Persistent user-owned Spotify libraries.
CREATE TABLE IF NOT EXISTS music_libraries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount IN (50, 100, 250, 500)),
  period text NOT NULL CHECK (period IN ('short_term', 'medium_term', 'long_term')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, amount, period)
);

CREATE TABLE IF NOT EXISTS user_library_songs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id uuid NOT NULL REFERENCES music_libraries(id) ON DELETE CASCADE,
  song_id text NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  rank integer NOT NULL CHECK (rank > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (library_id, song_id),
  UNIQUE (library_id, rank)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_players_room ON players(room_id);
CREATE INDEX IF NOT EXISTS idx_room_events_room ON room_events(room_id);
CREATE INDEX IF NOT EXISTS idx_votes_room_round ON votes(room_id, round);
CREATE INDEX IF NOT EXISTS votes_round_pick_idx ON votes(round_pick_id);
CREATE INDEX IF NOT EXISTS votes_voter_idx ON votes(voter_id);
CREATE UNIQUE INDEX IF NOT EXISTS votes_round_pick_voter_unique ON votes(round_pick_id, voter_id)
  WHERE round_pick_id IS NOT NULL AND voter_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_song_history_room ON song_history(room_id);
CREATE INDEX IF NOT EXISTS idx_players_last_seen ON players(last_seen);
CREATE INDEX IF NOT EXISTS idx_rooms_state_version ON rooms(state_version);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique ON users (lower(username));
CREATE INDEX IF NOT EXISTS users_username_lookup_idx ON users(username);
CREATE INDEX IF NOT EXISTS spotify_connections_user_idx ON spotify_connections(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS songs_spotify_song_id_unique ON songs(spotify_song_id) WHERE spotify_song_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS music_libraries_user_idx ON music_libraries(user_id);
CREATE INDEX IF NOT EXISTS user_library_songs_library_rank_idx ON user_library_songs(library_id, rank);
CREATE INDEX IF NOT EXISTS user_library_songs_song_idx ON user_library_songs(song_id);

-- Keep profile timestamps current.
CREATE OR REPLACE FUNCTION public.set_users_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_updated_at ON public.users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_users_updated_at();

CREATE OR REPLACE FUNCTION public.set_music_libraries_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS music_libraries_updated_at ON public.music_libraries;
CREATE TRIGGER music_libraries_updated_at
  BEFORE UPDATE ON public.music_libraries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_music_libraries_updated_at();

CREATE OR REPLACE FUNCTION public.set_spotify_connections_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS spotify_connections_updated_at ON public.spotify_connections;
CREATE TRIGGER spotify_connections_updated_at
  BEFORE UPDATE ON public.spotify_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.set_spotify_connections_updated_at();

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_libraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_library_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spotify_connections ENABLE ROW LEVEL SECURITY;

-- RPC: emit_room_event (clients call to request an event emission)
CREATE OR REPLACE FUNCTION public.emit_room_event(p_room uuid, p_type text, p_payload jsonb)
RETURNS jsonb AS
$$
DECLARE
  actor text := coalesce(current_setting('jwt.claims.sub', true), '');
  created jsonb;
  allowed integer;
BEGIN
  -- Caller must either be a player in the room or a privileged role
  SELECT COUNT(*) INTO allowed FROM players WHERE room_id = p_room AND id::text = actor;
  IF allowed = 0 AND current_setting('role', true) NOT IN ('service_role','postgres') THEN
    RAISE EXCEPTION 'not allowed to emit events for room %', p_room;
  END IF;

  INSERT INTO room_events(room_id, type, payload)
    VALUES (p_room, p_type, p_payload)
    RETURNING row_to_json(room_events.*) INTO created;

  RETURN created;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic server-side "start_round" operation
CREATE OR REPLACE FUNCTION public.start_round(p_room uuid, p_round integer)
RETURNS jsonb AS
$$
DECLARE
  sel record;
  snapshot jsonb;
BEGIN
  -- lock the room row to serialize concurrent starts
  PERFORM 1 FROM rooms WHERE id = p_room FOR UPDATE;

  -- choose a random song not in song_history
  SELECT s.id, s.metadata INTO sel
  FROM songs s
  WHERE s.id NOT IN (SELECT song_id FROM song_history WHERE room_id = p_room)
  ORDER BY random()
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no available songs for room %', p_room;
  END IF;

  -- insert history entry
  INSERT INTO song_history(room_id, song_id, round) VALUES (p_room, sel.id, p_round);

  -- update room atomically and bump version
  UPDATE rooms
  SET current_round = p_round,
      current_song = jsonb_build_object('id', sel.id, 'metadata', sel.metadata),
      current_state = 'playing',
      state_version = state_version + 1
  WHERE id = p_room;

  -- emit authoritative event
  INSERT INTO room_events(room_id, type, payload)
    VALUES (p_room, 'round_started',
      jsonb_build_object('round', p_round, 'song', jsonb_build_object('id', sel.id, 'metadata', sel.metadata), 'state_version', (SELECT state_version FROM rooms WHERE id = p_room))
    );

  SELECT row_to_json(r.*) INTO snapshot FROM (
    SELECT id, room_code, host_id, active_round_id, created_at, current_state, current_round, current_song, settings, state_version
    FROM rooms WHERE id = p_room
  ) r;

  RETURN snapshot;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Snapshot RPC for full rehydration
CREATE OR REPLACE FUNCTION public.get_room_snapshot(p_room uuid)
RETURNS jsonb AS
$$
DECLARE
  r jsonb;
  players_agg jsonb;
  votes_agg jsonb;
  history_agg jsonb;
BEGIN
  SELECT row_to_json(r.*)::jsonb INTO r FROM (
    SELECT id, room_code, host_id, active_round_id, created_at, current_state, current_round, current_song, settings, state_version
    FROM rooms WHERE id = p_room
  ) r;

  SELECT jsonb_agg(jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'is_host', p.is_host,
    'is_connected', p.is_connected,
    'joined_at', p.joined_at,
    'last_seen', p.last_seen
  )) INTO players_agg
  FROM players p WHERE p.room_id = p_room;

  SELECT jsonb_agg(jsonb_build_object(
    'id', v.id,
    'player_id', v.player_id,
    'round', v.round,
    'song_id', v.song_id,
    'rating', v.rating
  )) INTO votes_agg
  FROM votes v WHERE v.room_id = p_room;

  SELECT jsonb_agg(jsonb_build_object(
    'song_id', sh.song_id,
    'round', sh.round,
    'created_at', sh.created_at
  ) ORDER BY sh.created_at) INTO history_agg
  FROM song_history sh WHERE sh.room_id = p_room;

  RETURN jsonb_build_object(
    'room', coalesce(r, '{}'::jsonb),
    'players', coalesce(players_agg, '[]'::jsonb),
    'votes', coalesce(votes_agg, '[]'::jsonb),
    'song_history', coalesce(history_agg, '[]'::jsonb)
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Cleanup function for old events (7 days retention)
CREATE OR REPLACE FUNCTION public.cleanup_old_room_events()
RETURNS void AS
$$
BEGIN
  DELETE FROM room_events WHERE created_at < now() - interval '7 days';
END;
$$ LANGUAGE plpgsql;

-- Notes: Apply RLS policies in Supabase console to restrict direct mutations.
-- Recommended: only allow select on tables to clients; mutations via SECURITY DEFINER RPCs or via Edge functions.
