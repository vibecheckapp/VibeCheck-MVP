# TODO - Spotify Playback Fixes

## Task: Fix Spotify playback stuttering and multiple restarts

### Issues Identified:

1. **Scoreboard auto-play conflict**: Winner song auto-plays while lobby transition starts simultaneously
2. **Race in `waitForRoundAndPlay`**: Multiple rapid play attempts on new player turn
3. **Polling state conflicts**: 2-second polling updates state during transitions
4. **No debounce on state changes**: Multiple setRoundState calls cause UI flicker
5. **Missing playback state cleanup**: No proper reset when scoreboard shows

### Fixes Implemented:

1. [x] Add `autoPlayInProgressRef` in RoomClient.tsx to prevent multiple simultaneous auto-play calls
2. [x] Add playback state cleanup when entering scoreboard (`setPlaybackActive(false)`, `setCurrentPlayingUri(null)`)
3. [x] Add `suppressPolling` function in useSpotifyPlayer.ts to skip polling during critical transitions
4. [x] Call `suppressPolling(true)` during auto-play in `playTrackUri`, `playWinner`, and `handlePlayPause`
5. [x] Add delay before re-enabling polling (1.5s) to prevent state conflicts

### Next Steps:
- Test playback flow on new player turn
- Test playback flow on scoreboard display
- Monitor for any remaining stuttering issues
