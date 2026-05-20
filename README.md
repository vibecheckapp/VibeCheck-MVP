# Vibecheck MVP

A real-time multiplayer Spotify party game built with Next.js App Router, TypeScript, Supabase, and the Spotify Web API.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env.local` file with:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret
```

3. Create the required Supabase tables using `supabase/schema.sql` in the Supabase SQL editor.

4. Run the app:

```bash
npm run dev
```

## Project structure

- `app/` — Next.js App Router pages and API routes
- `components/` — client UI for room interactions
- `lib/` — reusable Spotify and Supabase utilities
