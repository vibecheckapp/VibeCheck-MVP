# Spotify Playback Fix Plan

## Issues Identified:

### 1. 404 "Device not found" Error
- **Root cause**: The device_id exists from Web Playback SDK but Spotify hasn't transferred playback to it OR it's not the active device
- The `/me/player/play` API returns 404 when the device_id is not currently active
- Need to ensure playback is transferred BEFORE attempting to play

### 2. No Music on Mobile
- **Root cause**: Spotify Web Playback SDK only works on desktop browsers (Chrome, Safari macOS, Edge)
- Mobile browsers do NOT support the SDK
- This is a Spotify limitation, not a bug

### 3. Play/Pause Button Flickering
- **Root cause**: Optimistic UI update happens immediately, then Spotify state updates asynchronously
- No loading state during API calls
- Button shows wrong state during network latency

### 4. Crackling/Lags
- **Root cause**: Race conditions when making consecutive play/pause calls
- No debounce or proper state management between operations

## Fix Plan:

### Fix 1: Add device transfer before play + retry logic
1. Modify `useSpotifyPlayer.ts` to ensure device is active before playing
2. Add retry with delay when getting "device not found" (3 retries, 500ms delay each)
3. Add user-friendly error messages

### Fix 2: Add isLoading state for stable button
1. Add `playbackLoading` state to RoomClient
2. Minimum 300ms loading indicator for better UX
3. Only update button state after confirmed response

### Fix 3: Add mobile detection
1. Detect mobile browsers
2. Show helpful message directing users to play on their device via Spotify Connect

### Fix 4: Debounce playback operations
1. Add minimum delay between play/pause commands (500ms)
2. Queue operations to prevent overlapping calls
