-- MVP game-loop compatibility fields.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'room_state'
  ) THEN
    CREATE TYPE public.room_state AS ENUM (
      'lobby',
      'playing',
      'voting',
      'scoreboard',
      'paused',
      'finished'
    );
  END IF;
END $$;

ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS paused_at timestamptz;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS current_state room_state NOT NULL DEFAULT 'lobby';
