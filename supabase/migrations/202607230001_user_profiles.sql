-- Persistent user profiles for username + magic-code sign-in.
-- Safe to run against the existing MVP schema.

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS magic_code text,
  ADD COLUMN IF NOT EXISTS last_music_import_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Preserve existing MVP users while making their profile usable.
UPDATE public.users
SET username = lower(regexp_replace(trim(display_name), '[^a-zA-Z0-9_]+', '-', 'g'))
WHERE username IS NULL;

UPDATE public.users
SET username = 'player-' || left(id::text, 8)
WHERE username IS NULL OR username = '';

-- Resolve legacy duplicate usernames before creating the unique index.
WITH duplicates AS (
  SELECT id,
         username,
         row_number() OVER (PARTITION BY lower(username) ORDER BY created_at, id) AS position
  FROM public.users
  WHERE username IS NOT NULL
)
UPDATE public.users AS users
SET username = duplicates.username || '-' || duplicates.position
FROM duplicates
WHERE users.id = duplicates.id
  AND duplicates.position > 1;

UPDATE public.users
SET magic_code = lpad((floor(random() * 10000))::integer::text, 4, '0')
WHERE magic_code IS NULL OR magic_code = '';

ALTER TABLE public.users
  ALTER COLUMN username SET NOT NULL,
  ALTER COLUMN magic_code SET NOT NULL,
  ALTER COLUMN username SET DEFAULT ('player-' || replace(left(gen_random_uuid()::text, 8), '-', '')),
  ALTER COLUMN magic_code SET DEFAULT lpad((floor(random() * 10000))::integer::text, 4, '0');

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_unique
  ON public.users (lower(username));

CREATE INDEX IF NOT EXISTS users_username_lookup_idx
  ON public.users (username);

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

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Profile writes are performed by server routes using the service role.
-- No direct client INSERT/UPDATE policy is added.
COMMENT ON COLUMN public.users.magic_code IS
  'Four-digit MVP login code. Replace with a hash-only representation before production authentication.';
