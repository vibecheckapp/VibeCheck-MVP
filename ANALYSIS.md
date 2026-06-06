# VibeCheck-MVP Architecture Analysis

## Current Architecture Overview

### Client Side (RoomClient.tsx)
- **State Management**: React useState + Supabase Realtime subscriptions
- **Room Lookup**: Fetches room, players, currentPlayer on load
- **Round State**: Fetches and caches round data with retry logic
- **Sync Protection**: Has `suppressRoundSync` and `isTransitioning` states to prevent race conditions
- **Heartbeat**: Updates last_seen every 15 seconds

### Server Side APIs
1. `/api/rooms/lookup` - Returns room, players with spotify_connected, last_seen
2. `/api/rounds/start` - Creates round, shuffles player order, fetches initial track
3. `/api/rounds/[id]` - Returns round state with votes and scoreboard
4. `/api/rounds/[id]/next-track` - Advances player, fetches new track
5. `/api/votes` - Records votes with upsert logic
6. `/api/rooms/heartbeat` - Updates last_seen timestamp
7. `/api/rooms/[roomCode]/settings` - Host-only settings management
8. `/api/scenario-suggestions` - Stores/retrieves scenario suggestions

### Database Schema (schema.sql)
- `users` - Player accounts with Spotify tokens
- `rooms` - Room metadata with host_id, active_round_id, settings (jsonb)
- `room_players` - Player-room associations with last_seen
- `rounds` - Round state with player_order (jsonb), current_turn_index, current_pick_id
- `round_picks` - Individual track submissions
- `votes` - Player votes per pick
- `room_notifications` - Event broadcasting
- `scenario_suggestions` - Player-submitted suggestions

---

## Issue Analysis

### 1. Random Song Selection Investigation
**Finding**: Songs ARE fetched fresh at round start and each player turn:
- `start/route.ts`: `getRandomTrackForUser(firstPlayerId)` fetches at round creation
- `next-track/route.ts`: `getRandomTrackForUser(nextPlayerId)` fetches when advancing

**Potential Issue**: `getRandomTrackForUser` uses `fetchUserSavedTracks(playerId)` which:
1. Fetches total track count
2. Generates random offset: `Math.floor(Math.random() * total)`
3. Fetches 50 tracks from that offset

**Risk**: If a player has songs with duplicate track IDs in their library, the same song **could** repeat within a session. The randomness is per-request, not persistent across rounds.

**Recommendation**: Add a `played_track_ids` tracking in the round to exclude recently played songs.

### 2. Voting Flow - Race Condition
**Finding**: Already has protection:
- Server-side: `next-track/route.ts` checks `currentVotes.data.length < totalPlayers`
- Client-side: `isTransitioning` state prevents button re-enable during transition

**Status**: Adequately protected, but can be improved with stronger server-side enforcement.

### 3. Scoreboard Display
**Finding**: API returns BOTH `score_total` and `score_average`:
```typescript
score_total: currentPickVotes.reduce((sum, vote) => sum + vote.score, 0),
score_average: currentPickVotes.length > 0 ? sum / length : 0,
```
**Issue**: UI only displays `score_total` - needs to be updated to show averages.

### 4. Anonymous Voting
**Finding**: Schema has settings field with `anonymous_voting: false` default, but:
- No client-side implementation to hide names
- No API filters to anonymize submissions during voting

**Status**: Needs implementation.

### 5. Back To Lobby Flow
**Finding**: Current behavior:
- Host clicks "Back to Lobby" → immediate return
- Uses `return_to_lobby` notification for broadcast

**Issue**: No transition timer phase, no prevention of quick rejoin. Needs:
- 5-second transition timer
- Block during transition
- Auto-rejoin for players who stayed

### 6. Multiplayer Synchronization
**Finding**: Has Supabase Realtime subscriptions for:
- Room changes (active_round_id, host_id)
- Round changes
- Votes changes
- Player join/leave

**Missing**: No explicit sync on page focus/visibility change or reconnect.

**Status**: Can be improved with visibility API and explicit re-sync.

### 7. Pause Game
**Finding**: No pause functionality exists.

**Status**: Needs implementation (add `paused_at` to rounds table is already present in schema).

### 8. Player Disconnect Handling
**Finding**: Tracks `last_seen` with heartbeat every 15 seconds, but:
- No disconnect detection during active gameplay
- No badge or state recalculation
- No adjustment of votes_needed or active players

**Status**: Needs implementation.

### 9. Rejoin Support
**Finding**: Implementation exists:
- Player ID stored in localStorage
- /api/rooms/lookup returns currentPlayer if playerId matches existing player
- RoomClient fetches round if active_round_id exists

**Status**: Already functional.

### 10. Host Settings Menu
**Finding**: Settings exist in schema but no UI. Room code display is in lobby only.

**Status**: Needs UI implementation.

### 11. Scenario Suggestions
**Finding**: Already implemented in `/api/scenario-suggestions/route.ts`:
- POST: Submit suggestion (validated)
- GET: Retrieve suggestions with player names

**Status**: API exists, needs UI integration.

### 12. Automatic Round Progression
**Finding**: No auto-advance implementation. Settings exist (`auto_advance`, `auto_advance_delay`).

**Status**: Needs implementation.

### 13. Spotify Playback SDK
**Finding**: Current implementation uses server-side Spotify API (REST):
- `/api/spotify/play` - Server sends play command via Spotify API
- `/api/spotify/pause` - Server sends pause command
- Requires Spotify app to be open on user's device

**Issue**: Cannot use Web Playback SDK without Premium - need to verify this is a requirement.

### 14. Spotify Playlist Save Feature
**Finding**: Not implemented. API has:
- `getSpotifyAccessTokenForUser` with scopes including `playlist-read-private`, `user-library-read`

**Status**: Analysis needed - can be implemented with `playlist-modify-public` scope + `user-library-modify`.

---

## Summary of Required Changes (Priority Order)

### P0 - Critical Fixes
1. Scoreboard: Show averages instead of sums
2. Voting Flow: Move "Next Player" button below Play/Pause
3. Race Condition: Ensure no re-enable window

### P1 - Stability
4. Multiplayer Sync: Add visibility/focus sync
5. Back to Lobby: Add transition timer
6. Player Disconnect: Track and show badge
7. Pause Game: Add pause functionality
8. Rejoin: Verify during gameplay

### P2 - New Features
9. Anonymous Voting: Implement hiding
10. Auto Progression: Add timer-driven advance
11. Host Settings: Add settings menu + room code
12. Scenario Suggestions: UI integration

### P3 - Investigation/Planning
13. Spotify Web Playback SDK: Investigation + plan
14. Spotify Playlist Save: Investigation + plan
