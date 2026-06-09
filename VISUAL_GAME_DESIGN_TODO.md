# Visual Game Design TODO - VibeCheck Party App

## Phase 1: Core Visual Overhaul (Priority: HIGH)

### 1.1 ✅ Completed
- [x] Farbpalette & Hintergrund (Deep Dark #0a0612 + Neon Glow Blobs Cyan/Magenta)
- [x] Karten-Look (Clean Dark Cards with Bright Edges)
- [x] Action Buttons (Neon-Pink, Uppercase, Flat Style)
- [x] Slider (Gradient Track Pink→Cyan + Glowing Cyan Thumb)
- [x] Header & Status (Unified Dark Badges)

### 1.2 ✅ Completed - Feedback Fixes Applied
- [x] Button hover: Removed translateY movement - only color change
- [x] Button click: Only color changes (darker pink on active)
- [x] Background: Lighter dark (#120d1a)
- [x] Cards: Brighter opacity (rgba(18, 12, 26, 0.85))
- [x] Glow blobs: Reduced opacity (0.35)

---

## User-New: Per-Player Dark/Light Mode (Priority: MEDIUM)

### Implementation Required:
- [ ] Add `theme_preference` column to players table (default: 'dark')
- [ ] Create API endpoint to update player preference
- [ ] Add theme toggle button in settings/player UI
- [ ] Add light-mode CSS variables alongside dark
- [ ] Apply theme class to root or body based on preference

### CSS Structure:
```css
:root { /* Dark mode - default */
  --bg-primary: #120d1a;
  --bg-card: rgba(18, 12, 26, 0.85);
  --text-primary: #f5f5f5;
  --accent-pink: #ff007f;
  --accent-cyan: #00f0ff;
}

:root.light { /* Light mode */
  --bg-primary: #f5f5f5;
  --bg-card: rgba(255, 255, 255, 0.9);
  --text-primary: #1a1a1a;
  --accent-pink: #e60073;
  --accent-cyan: #00b8d4;
}
```

---

## User Feedback Changes (Priority: HIGH)

### A. Button Interactions
- [ ] Remove translateY(-2px) on hover - subtle only or none
- [ ] On click: only color shift (slightly lighter/darker), no scale or translate
- [ ] Minimal box-shadow changes on hover

### B. Brightness Adjustments
- [ ] Background: Lighter dark (#120d1a instead of #0a0612)
- [ ] Cards: Increase opacity (rgba(10, 6, 18, 0.7) → rgba(18, 12, 26, 0.85))
- [ ] Text: Ensure high contrast for readability
- [ ] Reduce glow blob opacity if too dark (0.5 → 0.35)

---

## Phase 2: Enhanced Game-Like Elements (Priority: MEDIUM)

### 2.1 Button Micro-interactions
- [ ] Add satisfying "pop" animation on click (scale: 0.95 → 1)
- [ ] Subtle bounce effect on hover
- [ ] Glow pulse for primary action buttons

### 2.2 Scoreboard Gamification
- [ ] Add rank badges with colors (Gold #1, Silver #2, Bronze #3)
- [ ] Sparkle/confetti animation for first place
- [ ] Points counter with animated number transitions

### 2.3 Player Presence Indicators
- [ ] Pulsing dot for connected players
- [ ] Wave/explosion effect when someone votes
- [ ] "Hot" indicator for players currently rating

### 2.4 Round Transitions
- [ ] Slide-in animations for new tracks
- [ ] Flash effect when round starts
- [ ] Countdown timer with pulsing animation

### 2.5 Voting Feedback
- [ ] Star fill animation with stagger
- [ ] Checkmark burst effect on vote submit
- [ ] Progress bar showing votes received

---

## Phase 3: Audio-Visual Feedback (Priority: LOW)

### 3.1 Sound-Triggered Visuals
- [ ] Beat-synced background pulse (if audio data available)
- [ ] Visualizer bars representing audio levels

### 3.2 Ambient Effects
- [ ] Subtle floating particles in background
- [ ] Ambient glow that breathes/pulses slowly

---

## Phase 4: Polish & Accessibility (Priority: MEDIUM)

### 4.1 Focus & Navigation
- [ ] Enhanced focus states for keyboard navigation
- [ ] Larger touch targets for party environment
- [ ] Clear active/selected states

### 4.2 Loading States
- [ ] Custom spinner with game-brand colors
- [ ] Shimmer effect for loading cards
- [ ] Progress indicators with neon styling

### 4.3 Error States
- [ ] Red glow effects for errors
- [ ] Shake animation on validation fail
- [ ] Clear recovery actions

---

## Phase 5: Advanced Game Features (Priority: LOW)

### 5.1 Achievements Visual
- [ ] Badge unlock animations
- [ ] Streak counters with fire effect
- [ ] Leaderboard position changes (up/down arrows)

### 5.2 Power-ups & Modifiers
- [ ] Visual indicators for active modifiers
- [ ] Timer warnings (last 5 seconds pulsing red)

### 5.3 Social Features
- [ ] Reaction animations (emoji bursts)
- [ ] Player join/leave notifications
- [ ] Chat message animations

---

## Implementation Notes

### Color Scheme Reference
- Primary: #ff007f (Neon Pink/Magenta)
- Secondary: #00f0ff (Cyan)
- Accent: #ffdd00 (Gold for stars)
- Background: #0a0612 (Deep Dark)
- Success: #1db954 (Green)
- Warning: #ffc107 (Amber)

### Animation Guidelines
- Duration: 150-300ms for micro-interactions
- Easing: cubic-bezier(0.34, 1.56, 0.64, 1) for bounce
- Avoid: Seizure-inducing rapid flashes (max 3Hz)

### Accessibility Checklist
- [ ] Contrast ratio ≥ 4.5:1 for text
- [ ] Reduced motion support (@media prefers-reduced-motion)
- [ ] Screen reader friendly focus indicators
- [ ] Minimum 44px touch targets
