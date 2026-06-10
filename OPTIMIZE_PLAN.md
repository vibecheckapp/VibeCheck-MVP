# VibeCheck App - Layout & Visual Optimization Plan

## Task Understanding

The user wants to optimize the VibeCheck app with:
- **Retro-Yellow (#FFD166)** as third highlight color
- **Compacter spacing & padding** in modals and main containers
- **Sharper visual hierarchy & contrast**
- **Preserving** neubrutalist thick borders and asymmetric shadows

---

## Information Gathered

### Current CSS (globals.css):
- Retro-Yellow already defined: `--retro-yellow: #FFD166`
- Main container: `.hero` with `padding: 1.5rem 1.25rem`
- Card background: `#3F7553` (light green)
- Box background: `#2E5A3E` (medium console green)
- Score display uses: `.score-total-pts` in yellow color (already!)
- Checkmark button: `.submit-vote-button` with `.voted` state in yellow
- Player cards: `.player-card` with light green background
- Rating box: `.rating-box-card` with compact mode
- Slider labels: `.slider-label-left` and `.slider-label-right`
- Modal content: `.modal-content` with `padding: 1.5rem`

### Current RoomClient.tsx:
- Score display: `<span className="score-total-pts">{row.vote_count > 0 ? (row.score_total / row.vote_count).toFixed(1) : '0.0'}</span>`
- Checkmark button in voting section
- Spotify icon in player cards
- Three scenario buttons: "Saved", "Custom", "Suggestions"
- Rating slider with labels "1" and "10"

---

## Implementation Plan

### Phase 1: Retro-Yellow Applications

#### 1.1 Score Display - Already in Yellow!
✅ The `.score-total-pts` already uses `var(--retro-yellow)` - no change needed!

#### 1.2 Checkmark Button (Ingame-Screen)
- Currently: `.submit-vote-button.voted` uses `--retro-yellow` as background but text color may need verification
- Need to ensure text color is deep black (#0F172A) when voted
- CSS: `.submit-vote-button.voted { background: var(--retro-yellow); color: #0F172A; }`

#### 1.3 Spotify Icon Badge
- Currently: `.spotify-status-icon.connected` uses `var(--retro-yellow)` for connected state
- This is already correct! ✅

#### 1.4 Result Screen Score Color
- The score number "8.0" already uses `.score-total-pts { color: var(--retro-yellow); }`
- Already implemented! ✅

---

### Phase 2: Spacing & Padding Compacting

#### 2.1 Modals (Custom, Suggestions)
- Current: `.modal-content { padding: 1.5rem; }`
- Change to: Reduce vertical padding
- Target: Reduce gap after input fields
- Add: `.modal-content { padding: 1.25rem 1.5rem; }` - slightly less vertical
- Add: `.custom-scenario-input-section { margin-bottom: 0.75rem; }`
- Add: `.suggestions-modal-list { gap: 0.5rem; }`

#### 2.2 Players Box (Main Page)
- Current: `.card { padding: 1.25rem; }`
- Change: Increase to `padding: 1.5rem 1.25rem;` for more vertical breathing room

#### 2.3 Suggestions Input Alignment
- Current: `.suggestion-input-row { display: flex; gap: 0.5rem; }`
- Need to ensure height match with ADD button
- Add: `.suggestion-input-row input, .suggestion-input-row .button { height: 42px; }`
- Add: `.suggestion-input-row { align-items: center; }`

---

### Phase 3: Visual Hierarchy & Contrast

#### 3.1 Small Buttons Background
- Currently: Three scenario buttons use default `.scenario-button` background `#3F7553`
- Change: Lighter green already in place
- But need to verify: These buttons already use light green

#### 3.2 REVEAL RESULTS Button Text Color
- When orange (active): Force deep black text
- CSS: `.next-button { color: #0F172A; }` - already black!
- Add explicit: `.next-button.btn-primary { color: #0F172A; }`

#### 3.3 Slider Numbers Inward Adjustment
- Current: `.slider-label-left, .slider-label-right { min-width: 20px; text-align: center; }`
- Add: Margin adjustment to push inward
- Add: `.slider-label-left { margin-right: 4px; }`
- Add: `.slider-label-right { margin-left: 4px; }`
- Also add padding to align with slider track ends

---

## Dependent Files

### Files to Edit:
1. **app/globals.css** - All CSS changes
2. **components/RoomClient.tsx** - May need some structural adjustments

---

## Implementation Steps

### Step 1: Update globals.css with all spacing and hierarchy changes
- Apply padding adjustments to modals
- Increase Players box padding
- Fix suggestion input alignment
- Adjust slider labels
- Add explicit button text colors

### Step 2: Review RoomClient.tsx
- Verify retro-yellow applied to score display (already done)
- Verify checkmark styling (already in CSS)
- Verify Spotify icon (already connected to yellow)

---

## Expected Outcome
- Retro-Yellow used for score display, checkmark, Spotify icon
- Compact modals with less vertical space
- Players box with more breathing room
- Properly aligned suggestion input
- Clearer visual hierarchy with lighter button backgrounds
- Slider numbers properly aligned with track
- All neubrutalist borders and shadows preserved
