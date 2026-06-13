# Fix Plan - Spotify Autoplay Issue

## Problem
When Spotify is not open and host clicks Play, the current displayed song is not played. The user needs to manually retry after opening Spotify.

## Root Cause
- When Spotify app is not running, there is no active device
- After opening Spotify, the playback doesn't automatically retry
- The wrong song might be played

## Solution Steps

### 1. Improve Error Handling in useSpotifyPlayer.ts
- Better error message when no device found: "Bitte starte Spotify und klicke erneut"
- Add auto-retry logic when Spotify opens

### 2. Ensure Correct Track URI is Used
- The play function should use the track URI from currentPick
- Ensure the URI is passed correctly from RoomClient

### 3. Add Device Detection Refresh
- After error, refresh device list and retry automatically

## Implementation

1. [x] Analyze the files
2. [x] Update useSpotifyPlayer.ts - improve error handling and add retry
3. [ ] Test the implementation
