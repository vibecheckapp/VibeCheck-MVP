# IMPROVEMENT PLAN - Task List

## Overview
Implementing the following improvements to RoomClient.tsx and globals.css:

---

## Task 1: Host Controls Position
**Requirement**: Move host control buttons (Play/Pause + Next Player) above the voting block during rounds.

**Current**: 
- Host controls stack appears AFTER the rating-box-card (voting box)
- Located in `host-controls-stack` div

**Change Needed**:
- Move the entire `host-controls-stack` div to appear BEFORE the rating-box-card

---

## Task 2: Settings Persistence
**Requirement**: Settings should be saved until the room is dissolved.

**Current**: 
- Already working - settings are saved to Supabase via `handleUpdateSettings` and loaded via room lookup
- No change needed

---

## Task 3: Settings Visibility in Scoreboard
**Requirement**: Do NOT show settings in scoreboard (finished round), but show in game lobby.

**Current**:
- The ⚙️ button is in the round header and shows settings for all players when isHost is true
- Currently shows even when `roundState.status === 'finished'`

**Change Needed**:
- Hide the ⚙️ button in round header when `roundState.status === 'finished'`
- Settings modal should only appear when `roundState.status !== 'finished'`

---

## Task 4: Voting Button Position
**Requirement**: Move the confirmation button to the RIGHT of the slider to save vertical space. Shrink the voting box vertically.

**Current**:
- Voting box has:
  - Slider row (full width)
  - Rating value display (centered)
  - Submit button (centered below)
  - Vote status container (full width below)

**Change Needed**:
- Layout: slider in center, submit button to the right
- Remove/compact the rating value display
- Reduce vertical padding of rating-box-card

---

## Task 5: Remove Animation
**Requirement**: Remove the scoreboard reveal animation.

**Current**:
- `scoreboardRevealed` state triggers animation
- `visibleScoreRows` increments over 5 seconds
- CSS animation `scoreboardRevealed` with keyframes

**Change Needed**:
- Remove states: `scoreboardRevealed`, `visibleScoreRows`
- Remove useEffect that manages animation
- Remove CSS animation classes

---

## Task 6: Timer Behavior
**Requirement**: Start 5-second timer immediately when scoreboard is displayed, NOT on button click.

**Current**:
- Timer (`lobbyTransitionTime`) starts when clicking "Back to Lobby" button
- `handleReturnToLobby` initiates countdown

**Change Needed**:
- When `roundState.status === 'finished'`, immediately start the 5-second countdown
- Disable "Back to Lobby" button until timer completes (after 5 seconds)

---

## Implementation Order

### Phase 1: Layout Changes
1. Move host controls above voting box (Task 1)
2. Move voting submit button to right of slider (Task 4)

### Phase 2: Logic Changes  
3. Hide settings in scoreboard (Task 3)
4. Remove animation states/effects (Task 5)
5. Auto-start timer when scoreboard shown (Task 6)

### Phase 3: CSS Updates
6. Update layout styles for new positions
7. Compact voting box styling

---

## Files to Edit
- `components/RoomClient.tsx` - Main logic and layout
- `app/globals.css` - Layout and animation styles
