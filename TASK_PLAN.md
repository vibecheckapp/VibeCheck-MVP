# Task Plan: Winner Song Duration Setting

## Task Context
User wants to control how long the winner song plays at the end of a round (e.g., 10, 20, 30, or 60 seconds), instead of playing indefinitely.

## Current State Analysis

### RoomSettings Interface (RoomClient.tsx)
```typescript
interface RoomSettings {
  auto_advance: boolean;
  auto_advance_delay: number;
  anonymous_voting: boolean;
  auto_play_winner_song: boolean;
  auto_play_winner_delay: number;  // Delay BEFORE playing starts
  // MISSING: auto_play_winner_duration // Duration to PLAY
}
```

### Current Winner Song Playback Logic (RoomClient.tsx)
- Plays after `auto_play_winner_delay` seconds
- Uses `spotify.play(winnerUri)` 
- NO stop logic - plays indefinitely

## Implementation Plan

### Step 1: Add `auto_play_winner_duration` to RoomSettings state
- Add to `RoomSettings` interface with default value (e.g., 30 seconds)
- Add to initial state in `useState<RoomSettings>`

### Step 2: Add duration UI in Settings Modal
- In the "Auto-Play Winner Song" section under Settings
- Add option buttons for duration: 10s, 20s, 30s, 60s, "indefinite"/"continuous"
- This is only visible when `auto_play_winner_song` is enabled and for host only

### Step 3: Implement auto-stop logic
- When winner song starts playing, set a timeout to call `spotify.pause()` after the duration
- Need to track if the winner song is currently playing with auto-stop enabled
- Clear the timeout if user manually stops or advances

## Dependent Files to Edit
1. `components/RoomClient.tsx` - Main implementation

## Followup Steps
- Test the flow: end round → winner song plays → auto-stops after duration
