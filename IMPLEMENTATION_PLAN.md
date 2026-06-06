# Implementation Plan for VibeCheck-MVP Tasks

## Tasks Overview

### Task 1: Spotify Connect Button in Lobby
- Replace the static Spotify status indicator in each player card with a clickable button
- When clicked, it should open a modal (similar to Settings modal) where users can connect Spotify
- The button should only be clickable by the current player themselves (or if not connected)

### Task 2: Suggestions as Modal Button
- Convert the inline suggestions section into a clickable button in the lobby header
- Clicking opens a modal (like Settings) with the suggestions input and list
- Should work identically to the Settings modal

### Task 3: Real-time Suggestion Updates
- Add Supabase Realtime subscription for scenario_suggestions table
- When a suggestion is added by any player, all clients should automatically refresh

### Task 4: Song Card Spacing Adjustment
- Reduce spacing in `.track-stack` from 0.75rem to 0.5rem
- Reduce spacing in `.track-text-stacked` from 0.5rem 0 0 0.75rem to 0.25rem 0 0.5rem
- Reduce padding in `.track-card.scenario-2` from 1.25rem to 1rem

---

## Detailed Implementation

### File: components/RoomClient.tsx

#### Task 1 Changes:
1. Add new state: `showSpotifyModal` (boolean)
2. In the lobby header, add a Spotify connect button (🎵 icon) next to Settings
3. Create a Spotify connection modal that acts like Settings modal
4. Update player card to show clickable Spotify button for current player only

#### Task 2 Changes:
1. Add new state: `showSuggestionsModal` (boolean) - reuse existing `showSuggestions` or rename
2. Convert inline suggestions section to use a modal instead of inline display
3. Add button in lobby header for Suggestions (like Settings)

#### Task 3 Changes:
1. Add a new useEffect for scenario_suggestions table realtime subscription
2. Trigger refresh when INSERT events happen on scenario_suggestions

#### Task 4 Changes:
1. No JS changes needed - only CSS

---

### File: app/globals.css

#### Task 4 CSS Changes:
```css
/* Track stack - reduce gap */
.track-stack {
  gap: 0.5rem; /* Was 0.75rem */
}

/* Track text stacked - reduce margin */
.track-text-stacked {
  margin: 0.25rem 0 0.5rem 0; /* Was 0.5rem 0 0.75rem 0 */
}

/* Track card - reduce padding */
.track-card.scenario-2 {
  padding: 1rem; /* Was 1.25rem */
}
```

---

## Dependencies

- `lib/supabase-client.ts` - already imported and used for realtime
- No new API routes needed

---

## Implementation Order

1. First, implement Task 4 (CSS only) - quickest
2. Then implement Tasks 1 & 2 (UI changes + modals)
3. Then implement Task 3 (realtime)

Wait for user confirmation before proceeding.
