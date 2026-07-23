-- Persistent Spotify music libraries.
-- Safe to run after 202607230001_user_profiles.sql.

CREATE TABLE IF NOT EXISTS public.songs (
  id text PRIMARY KEY,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.songs
  ADD COLUMN IF NOT EXISTS spotify_song_id text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS artist text,
  ADD COLUMN IF NOT EXISTS album text,
  ADD COLUMN IF NOT EXISTS image_url text;

-- Existing MVP rows use songs.id as the Spotify track id.
UPDATE public.songs
SET spotify_song_id = id
WHERE spotify_song_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS songs_spotify_song_id_unique
  ON public.songs(spotify_song_id)
  WHERE spotify_song_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.music_libraries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount IN (50, 100, 250, 500)),
  period text NOT NULL CHECK (period IN ('short_term', 'medium_term', 'long_term')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, amount, period)
);

CREATE TABLE IF NOT EXISTS public.user_library_songs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id uuid NOT NULL REFERENCES public.music_libraries(id) ON DELETE CASCADE,
  song_id text NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  rank integer NOT NULL CHECK (rank > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (library_id, song_id),
  UNIQUE (library_id, rank)
);

CREATE INDEX IF NOT EXISTS music_libraries_user_idx
  ON public.music_libraries(user_id);
CREATE INDEX IF NOT EXISTS user_library_songs_library_rank_idx
  ON public.user_library_songs(library_id, rank);
CREATE INDEX IF NOT EXISTS user_library_songs_song_idx
  ON public.user_library_songs(song_id);

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

ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_libraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_library_songs ENABLE ROW LEVEL SECURITY;

-- Reads and writes are intentionally server-side until account sessions are added.
