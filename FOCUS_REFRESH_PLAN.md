# Focus/Visibility Refresh Implementation Plan

## Objective
When a player temporarily leaves the page (page not in foreground) and returns, they should immediately see the latest version of the game state. This requires live detection of player activity status and automatic refresh when returning to the page.

## Current State Analysis

### Existing Code (roomSync.ts)
- Has `visibilitychange` event listener that triggers `fetchSnapshot()` when visibility === 'visible'
- Has `focus` event listener that triggers `fetchSnapshot()`
- Safety sync every 15 seconds
- Heartbeat every 8 seconds (tells server player is alive)

### Gap
1. No tracking of WHEN the user became hidden (could be used for delta sync)
2. No visual feedback when returning after being away
3. The current fetchSnapshot is triggered, but could add explicit "fresh sync" indicator

## Implementation Plan

### Step 1: Enhance roomSync.ts - Track visibility timestamps
- Track `lastHiddenAt` timestamp when page becomes hidden
- On visibility change to 'visible', compare timestamps and log
- Add explicit "refreshing on return" flag for UI feedback

### Step 2: Add visual indicator in RoomClient.tsx
- Add state for `isRefreshingOnFocus` 
- Show brief loading indicator when returning after being away
- Auto-hide after snapshot is applied

### Step 3: Test with Page Visibility API
- Verify the visibilitychange event fires correctly
- Test focus and blur behavior

## Files to Modify
1. `lib/roomSync.ts` - Add timestamp tracking and logging
2. `components/RoomClient.tsx` - Add refresh indicator state and UI

## Validation
- Player returns to tab → visible indicator → fresh data loads
- Focus window → snapshot refreshes
- Check console for visibility events
