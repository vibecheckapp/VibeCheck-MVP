-- Persistent Spotify connection per user.

CREATE TABLE IF NOT EXISTS public.spotify_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  spotify_user_id text NOT NULL,
  access_token text,
  refresh_token text NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id),
  UNIQUE (spotify_user_id)
);

CREATE INDEX IF NOT EXISTS spotify_connections_user_idx
  ON public.spotify_connections(user_id);

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

ALTER TABLE public.spotify_connections ENABLE ROW LEVEL SECURITY;
-- Tokens are never directly exposed to clients. Server routes use the service role.
