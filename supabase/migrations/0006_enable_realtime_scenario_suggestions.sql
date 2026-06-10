-- Migration: Enable Supabase Realtime for real-time updates
-- This enables live updates for:
-- 1. scenario_suggestions - when players add/view suggestions in the lobby
-- 2. room_players - when players join/leave or connect Spotify

-- Enable realtime for scenario_suggestions table
ALTER PUBLICATION supabase_realtime ADD TABLE scenario_suggestions;

-- Enable realtime for room_players table (includes Spotify connection status updates)
ALTER PUBLICATION supabase_realtime ADD TABLE room_players;

-- Note: This must be done in Supabase SQL Editor
-- After running this, also ensure Realtime is enabled in Supabase Dashboard:
-- 1. Go to your project in Supabase Dashboard
-- 2. Navigate to Database → Replication
-- 3. Make sure "supabase_realtime" publication shows the tables are included
