# TODO: Implementation Tasks

## Task 1: Spotify Connect Button in Lobby
- [ ] Replace static Spotify status icon in player card with clickable button
- [ ] Button should redirect to `/api/spotify/auth?playerId=xxx` when clicked
- [ ] Only the current player can click their own button

## Task 2: Suggestions as Modal Button
- [ ] Add Suggestions button in lobby header (next to "Waiting for Host" badge)
- [ ] When clicked, opens modal with suggestions input and list
- [ ] Modal should work identically to Settings modal

## Task 3: Real-time Suggestion Updates
- [ ] Add Supabase Realtime subscription for scenario_suggestions table
- [ ] When INSERT event occurs, refresh suggestions automatically for all clients
- [ ] Verify schema has realtime enabled for scenario_suggestions

## Task 4: Song Card Spacing Adjustment
- [ ] Reduce `.track-stack` gap from 0.75rem to 0.5rem
- [ ] Reduce `.track-text-stacked` margin from 0.5rem 0 0.75rem 0 to 0.25rem 0 0.5rem 0
- [ ] Reduce `.track-card.scenario-2` padding from 1.25rem to 1rem

---

## Implementation Order

1. Task 4 (CSS only) - Quickest
2. Task 1 (RoomClient.tsx - player card changes)
3. Task 2 (RoomClient.tsx - suggestions modal + button)
4. Task 3 (RoomClient.tsx - realtime subscription)

---

## Notes

- For Task 3, Supabase Realtime requires the table to be in a PUBLICATION. The existing code uses `supabase.channel()` which should work if realtime is configured in Supabase dashboard.
- If realtime doesn't work, I'll provide SQL to enable it.
