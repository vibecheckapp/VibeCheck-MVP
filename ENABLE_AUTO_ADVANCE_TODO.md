# Enable Auto-Advance as Default - Implementation TODO

## Task
Make `auto_advance` setting enabled by default for all new rooms, both in backend and frontend.

## Steps Completed
- [x] Analyze codebase structure
- [x] Understand how room settings work
- [x] Confirm implementation plan with user
- [x] Update database schema to set default settings with auto_advance: true

## Implementation
- File: `supabase/schema.sql`
- Changed the `settings` column default from `DEFAULT '{}'::jsonb` to:
```sql
DEFAULT '{"auto_advance": true, "auto_advance_delay": 10, "anonymous_voting": true, "auto_play_winner_song": true, "auto_play_winner_duration": 30}'::jsonb
```

## Result
All NEW rooms will now have auto-advance enabled by default:
- Backend: Database sets default settings when room is created
- Frontend: Settings load from database with auto_advance: true
