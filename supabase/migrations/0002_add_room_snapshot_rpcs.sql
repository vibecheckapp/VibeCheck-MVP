-- Migration: Add room snapshot and event RPCs used by the client sync layer.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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
