# Fix Plan - VibeCheck MVP

## Issues to Fix

### Problem 1: Play/Pause Button State
- The button should show "Pause" when a song is playing and "Play" when paused
- When skipping to next player, the button should always show "Pause" because the new song auto-plays
- Current issue: After pausing, then skipping, button shows "Play" and user has to click twice

### Problem 2: Winner Song Auto-Play
- Winner song should auto-play when round ends (status === 'finished')
- Currently finds winner by score_total instead of average rating
- Might not trigger if round was already finished when component mounted

## Implementation Steps

### Step 1: Fix handleNextPlayer - ensure isPlaying is always set correctly
- After calling spotify.play(), always set isPlaying(true)
- Also reset playback state: set currentPlayingUri to the new URI

### Step 2: Fix winner song selection logic
- Calculate average rating: score_total / vote_count
- Find pick with highest average rating
- Trigger when round status changes to 'finished'

### Step 3: Add better state synchronization  
- Add playback state tracking with currentPlayingUri
- Ensure button always reflects actual state after any transition

## Files to Edit
- components/RoomClient.tsx - main logic changes
