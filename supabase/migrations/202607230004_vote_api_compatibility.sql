-- Align the existing votes table with the current round/vote API.
-- Legacy columns remain for backward compatibility.

ALTER TABLE public.votes
  ADD COLUMN IF NOT EXISTS round_pick_id uuid REFERENCES public.round_picks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS voter_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS score integer;

-- Older deployments may already use the newer API shape and therefore do not
-- have the legacy columns below. Only alter columns that actually exist.
DO $$
DECLARE
  v_column_name text;
BEGIN
  FOREACH v_column_name IN ARRAY ARRAY['room_id', 'player_id', 'song_id', 'rating'] LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns AS c
      WHERE c.table_schema = 'public'
        AND c.table_name = 'votes'
        AND c.column_name = v_column_name
    ) THEN
      EXECUTE format('ALTER TABLE public.votes ALTER COLUMN %I DROP NOT NULL', v_column_name);
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS votes_round_pick_idx
  ON public.votes(round_pick_id);
CREATE INDEX IF NOT EXISTS votes_voter_idx
  ON public.votes(voter_id);

-- Older deployments may contain repeated submissions for the same pick and
-- voter. Keep the newest vote before enforcing the new uniqueness rule.
DELETE FROM public.votes AS duplicate_vote
USING (
  SELECT id,
         row_number() OVER (
           PARTITION BY round_pick_id, voter_id
           ORDER BY created_at DESC NULLS LAST, id DESC
         ) AS duplicate_number
  FROM public.votes
  WHERE round_pick_id IS NOT NULL
    AND voter_id IS NOT NULL
) AS ranked_votes
WHERE duplicate_vote.id = ranked_votes.id
  AND ranked_votes.duplicate_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS votes_round_pick_voter_unique
  ON public.votes(round_pick_id, voter_id)
  WHERE round_pick_id IS NOT NULL AND voter_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'votes_score_range_check'
  ) THEN
    ALTER TABLE public.votes
      ADD CONSTRAINT votes_score_range_check
      CHECK (score IS NULL OR score BETWEEN 1 AND 10);
  END IF;
END $$;
