# VibeCheck-MVP Error Fix Plan

## Status: COMPLETED - All Critical Issues Fixed

### Applied Fixes

#### Fixed #1: Database schema - Missing index on rooms.room_code ✅
- Added `create index if not exists idx_rooms_room_code on public.rooms(room_code);`
- This improves performance for room_code lookups used in JOIN/LOOKUP routes

#### Fixed #2: Spotify.ts - Added retry logic ✅
- Added `fetchWithRetry<T>()` helper function  
- Implements exponential backoff for 429 (rate limit) and 5xx server errors
- Applied to all Spotify API calls in the library

#### Fixed #3: votes_needed calculation ✅
- **Location**: app/api/rounds/[id]/route.ts
- **Changed from**: `players.length`
- **Changed to**: `playerOrder.length` 
- **Reason**: player_order reflects which players were actually in the round, not current room members

#### Fixed #4: Race condition in next-track (No action needed) ✅
- **Location**: app/api/rounds/[id]/next-track/route.ts
- **Analysis**: Code already fetches votes before checking count
- The `force` parameter correctly allows host override
- No code change required - logic was already correct

---

## Summary
- Fixed: 4 issues (2 critical, 1 functional, 1 analysis clarification)
- No remaining issues identified
