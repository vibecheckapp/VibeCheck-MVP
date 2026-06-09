-- Migration: Set DEFAULT gen_random_uuid() for UUID primary keys
-- Adds pgcrypto if missing and sets defaults for tables that lacked them.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- rounds.id
ALTER TABLE IF EXISTS rounds ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- round_picks.id
ALTER TABLE IF EXISTS round_picks ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- users.id (optional: only set a default if your auth flow expects generated UUIDs)
ALTER TABLE IF EXISTS users ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Note: ALTER COLUMN ... SET DEFAULT is idempotent; running this migration multiple
-- times is safe.
