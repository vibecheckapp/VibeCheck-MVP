# Visual Overhaul Implementation Plan

## Overview
Complete visual redesign of globals.css to match modern party-game aesthetics (like "Splash!") - BUNT, MINIMALISTISCH, KLAR, and GAMIFIED while maintaining existing structural layout.

---

## Information Gathered from CSS Analysis

### Current Structure (MUST NOT CHANGE):
- All Flexbox containers, grids, and layouts remain identical
- Dimensions (max-width: 440px, padding, margins) stay the same
- Component ordering and HTML structure unchanged

### Key CSS Elements to Modify:
1. **:root & body** - Background colors and glow blobs
2. **.track-card.scenario-2, .card.rating-box-card** - Card styling
3. **.button, .pause-button, .next-button, .submit-vote-button** - Action buttons
4. **.rating-slider** - Slider components
5. **.round-header, .timer-badge, scenario badges** - Header/status elements

---

## Detailed Implementation Plan

### 1. Farbpalette & Hintergrund (body & :root)

#### Current:
- Background: `radial-gradient(circle at 50% 50%, #2c115c 0%, #13042b 100%)`
- body::before: Orange (#ffaa00), opacity 0.35
- body::after: Spotify Green (#1db954), opacity 0.35

#### Target:
- Deep dark blue/violet: `#0a0612` (near-black with purple undertone)
- body::before: Cyan (#00f0ff), opacity 0.5 (increased from 0.35)
- body::after: Magenta (#ff007f), opacity 0.5 (increased from 0.35)

---

### 2. Karten-Look (.track-card.scenario-2, .card.rating-box-card)

#### Current:
- Background: `rgba(255, 255, 255, 0.03)`
- Border: 1px solid rgba(255, 255, 255, 0.08)
- backdrop-filter: blur(16px) (in hero)
- Border-radius: 24px/16px

#### Target:
- Background: `rgba(10, 6, 18, 0.8)` (very clean dark)
- Border: 1px solid rgba(255, 255, 255, 0.1) (ultra-fine bright edge)
- backdrop-filter: blur(8px) (minimal, flat look)
- Border-radius: 20px (slightly reduced for cleaner look)

---

### 3. Action-Buttons

#### Primary Button (.button)

##### Current:
- Background: #1db954 (Spotify green)
- text-transform: none
- font-weight: 700
- Box-shadow with green glow
- 3D hover effect with translateY(-2px)

##### Target:
- Background: #ff007f (Neon-Pink/Magenta) for primary action
- text-transform: uppercase
- font-weight: 800
- letter-spacing: 0.05em (game look)
- No 3D effect - flat modern app style
- Subtle glow: `0 4px 20px rgba(255, 0, 127, 0.4)`
- Hover: slight lift with stronger glow

#### "Reveal Results / Next"-Button (.next-button)

##### Current:
- Background: #1db954 !important

##### Target:
- Background: #ff007f (Neon-Pink/Magenta) with white text
- Border-radius: 50px
- Saturated app-style, no 3D effect

#### Pause Button (.pause-button)

##### Current:
- Background: rgba(255, 255, 255, 0.1)
- Color: #fff
- Border: 1px solid rgba(255, 255, 255, 0.2)

##### Target:
- Background: rgba(255, 0, 127, 0.15) (tinted pink)
- Border: 1px solid rgba(255, 0, 127, 0.3)
- Color: #ff007f (matching neon)
- Flat, modern look with subtle glow

#### Submit Vote Button (.submit-vote-button)

##### Current:
- Background: rgba(255, 255, 255, 0.04)
- Border: 1px solid rgba(255, 255, 255, 0.1)
- Color: rgba(255, 255, 255, 0.3)
- Voted state: #1db954

##### Target:
- Background: rgba(0, 240, 255, 0.1) (Cyan tint)
- Border: 1px solid rgba(0, 240, 255, 0.3)
- Color: #00f0ff (Cyan)
- Voted state: #ff007f (Pink to contrast with voted)
- Neon glow effect

---

### 4. Gamifizierter Slider (.rating-slider)

#### Current:
- Track: rgba(255, 255, 255, 0.1) solid
- Thumb: transparent (uses background image)
- thumb-value: #1db954 with green shadow

#### Target:
- Track: Linear gradient from #ff007f (Pink) to #00f0ff (Cyan)
- OR: Dashed appearance via repeating-linear-gradient
- Thumb: Full round design with neon glow
- thumb-value: #00f0ff (Cyan) with bright neon glow
- Positioned prominently, larger (32px)

#### Implementation Details:
```css
.rating-slider {
  background: linear-gradient(90deg, #ff007f, #00f0ff);
  /* OR for dashed line effect */
  background: repeating-linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.3) 0px,
    rgba(255, 255, 255, 0.3) 4px,
    transparent 4px,
    transparent 8px
  );
}

.slider-thumb-value {
  background: #00f0ff;
  box-shadow: 0 0 15px rgba(0, 240, 255, 0.8), 0 0 30px rgba(0, 240, 255, 0.4);
  width: 32px;
  height: 32px;
}
```

---

### 5. Header & Status-Anzeigen (.round-header, .timer-badge)

#### Current:
- timer-badge: green (#1db954) background
- scenario badges: various styles

#### Target:
- Unified pill design
- Dark background: rgba(10, 6, 18, 0.8)
- Fine outline: 1px solid rgba(255, 255, 255, 0.15)
- HIGH CONTRAST text

#### Unified Badge Requirements:
- "Votes X/Y" always fixed on RIGHT side
- Round title always fixed on LEFT side
- If title too long: auto-scroll slowly in single line
- Scrolling animation: 5-8 seconds, linear ease-in-out

#### CSS Implementation:
```css
.round-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.round-title-container {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.round-title {
  display: inline-block;
  animation: scroll-title 8s linear infinite;
}

@keyframes scroll-title {
  0% { transform: translateX(100%); }
  100% { transform: translateX(-100%); }
}

.timer-badge, .vote-count-badge {
  background: rgba(10, 6, 18, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 0.4rem 0.75rem;
  border-radius: 999px;
  font-weight: 600;
  color: #00f0ff;
}
```

---

## Files to Be Edited

1. **app/globals.css** - Single file containing all styles

---

## Implementation Steps

1. Update :root and body backgrounds
2. Update glow blobs (body::before, body::after)
3. Update card styles (.track-card.scenario-2, .card.rating-box-card)
4. Update button styles (.button, .next-button, .pause-button, .submit-vote-button)
5. Update slider styles (.rating-slider, .slider-thumb-value)
6. Update header/status elements (.round-header, .timer-badge, vote badges)
7. Add scroll animation for long titles

---

## Testing Considerations

- All layouts must remain identical (Flexbox/Grid)
- Buttons must remain clickable and accessible
- Slider must be usable on touch devices
- Colors must have sufficient contrast for accessibility
- Neon effects should not cause seizure issues (subtle animations only)

---

## Final Quality Checks

- [ ] Background is deep dark blue/violet
- [ ] Glow blobs are Cyan and Magenta
- [ ] Cards have dark transparent background with bright edge
- [ ] Primary buttons are Neon-Pink with uppercase text
- [ ] Slider has gradient/dashed track with glowing thumb
- [ ] Header badges are unified dark with fine outline
- [ ] Votes always fixed on right, title on left
- [ ] Long titles auto-scroll
