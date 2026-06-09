Schema Lint Report

Checked: `supabase/schema.sql`

Findings:

- `rounds.id`: had no DEFAULT; added `gen_random_uuid()` in schema.sql. (Fixed)
- `round_picks.id`: had no DEFAULT; added `gen_random_uuid()` in schema.sql. (Fixed)
- `users.id`: has no DEFAULT; left as-is in schema.sql originally. Migration adds a DEFAULT, but verify if your auth system supplies IDs.

Suggestions:

- If you rely on Supabase Auth `auth.users` uuids, do NOT set a default on `users.id` — keep it as-is and insert with the auth-provided uuid.
- Consider adding explicit foreign key constraints referencing `auth.users` if applicable.
- Add RLS policies per table in Supabase console (recommended comments exist in the schema).

Next steps to apply changes:

1) Apply the migration SQL file using psql or your DB tool (replace `DATABASE_URL`):

```bash
export DATABASE_URL="postgresql://user:pass@host:port/dbname"
psql "$DATABASE_URL" -f supabase/migrations/0001_add_uuid_defaults.sql
```

2) Optionally re-run the full schema:

```bash
psql "$DATABASE_URL" -f supabase/schema.sql
```

If you want, I can run these commands now if you provide a `DATABASE_URL`.
