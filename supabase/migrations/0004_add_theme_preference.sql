-- Add theme_preference column to players table
-- Run this in Supabase SQL Editor

ALTER TABLE room_players 
ADD COLUMN IF NOT EXISTS theme_preference TEXT NOT NULL DEFAULT 'dark' 
CHECK (theme_preference IN ('dark', 'light'));

-- Optional: Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_room_players_theme ON room_players(room_id, user_id);

-- Note: Each player in a room can have their own theme preference
-- This is stored per-player not per-room, so players can customize their own view
