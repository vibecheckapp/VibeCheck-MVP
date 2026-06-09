# TODO: Auto-Play Implementation

## Task
Automate song playback:
1. Auto-play first song when round starts
2. Auto-play new song when skipping to next player  
3. Fix winner song selection (use score_total instead of vote_count)

## Implementation Steps

### Step 1: Fix winner selection logic (auto-play winner effect)
- [x] Read RoomClient.tsx
- [x] Fix comparison from vote_count to score_total in winner song selection

### Step 2: Add auto-play after round start
- [x] Modify handleStartRound() to auto-play after fetching round data
- [x] Set isPlaying to true for host

### Step 3: Add auto-play after next player
- [x] Modify handleNextPlayer() to auto-play after updating round state
- [x] Set isPlaying to true for host

## Notes
- Only the host controls playback
- Need to ensure spotify player is ready before playing
- Use existing spotify.play() method from useSpotifyPlayer hook
