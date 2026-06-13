# TODO: Fix Play/Pause Button Logic

## Task: Fix playback pause functionality - button pauses on click and resumes on second click

### Steps:
1. [x] Fix isPlaying state logic in handlePlayPause - when playing, click should pause and show "▶", when paused click should resume and show "⏸"
2. [x] Fix auto-play code to set correct initial state
3. [x] Update button display logic to use playbackActive instead of isPlaying
4. [x] Test the changes

### Files to Edit:
- components/RoomClient.tsx

### Summary:
The current Play/Pause button has inverted logic. Fixed it so:
- Click when music is playing → pauses and shows "▶" (Play/Resume icon)
- Click when music is paused → resumes and shows "⏸" (Pause icon)

### Changes Made:
1. handlePlayPause: Now uses playbackActive to determine state
2. Button display: Uses playbackActive ? '⏸' : '▶' instead of isPlaying
3. Auto-play code: Removed setIsPlaying() calls, only sets playbackActive
