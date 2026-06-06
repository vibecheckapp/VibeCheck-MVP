# P1 Implementation TODO - Multiplayer Stability

## Task 1: Move "Next Player" button below Play/Pause button
- [x] Update RoomClient.tsx layout - button is now inside host-controls-stack
- [x] Position button below playback controls

## Task 2: Back to Lobby 5-second transition timer
- [x] Add transition timer state (lobbyTransitionSeconds)
- [x] Prevent leaving during transition
- [x] Start timer when host clicks "Back to Lobby"
- [x] Allow stay/leave after timer ends

## Task 3: Pause Game (host can pause during gameplay)
- [x] Add `paused_at` column to rounds table (schema)
- [x] Add API endpoint to pause/resume round
- [x] Add pause button in host UI
- [x] Broadcast pause state to all clients (via realtime)

## Status: ✅ COMPLETE
All P1 features implemented:
1. Schema: Added paused_at column
2. API: /api/rounds/[id]/pause route exists
3. UI: Pause button in host controls
4. Sync: useEffect syncs paused_at from roundState
