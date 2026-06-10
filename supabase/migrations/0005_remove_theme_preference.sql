-- Remove theme_preference column from room_players table
-- Run this in Supabase SQL Editor

-- Drop the theme_preference column if it exists
ALTER TABLE room_players DROP COLUMN IF EXISTS theme_preference;

-- Clean up any orphan indexes (if they exist)
DROP INDEX IF EXISTS idx_room_players_theme;
