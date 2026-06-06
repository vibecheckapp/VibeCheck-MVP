# Implementation Plan: Settings & Scenario Suggestions

## Task Analysis

### Current State:
1. **Scenario Suggestions** - Only visible in Settings modal, only Host can submit
2. **Pause/Resume** - Works but Settings modal stays open after Resume

### Requirements:
1. Settings modal should auto-close when Host clicks "Resume Game"
2. Move scenario suggestions from Settings to Lobby - ALL players can submit
3. Host can select from: Preset scenarios, Custom input, or Community suggestions

---

## Implementation Plan

### Fix #1: Auto-close Settings on Resume

**File:** `components/RoomClient.tsx`

**Change:** Modify `handlePauseGame` to close settings modal when resuming:

```typescript
const handlePauseGame = async (action: 'pause' | 'resume') => {
  // ... existing code ...
  setIsPaused(action === 'pause');
  
  // NEW: Auto-close settings when resuming
  if (action === 'resume') {
    setShowSettings(false);
  }
};
```

### Fix #2: Move Scenario Suggestions to Lobby

**Design Approach:**

1. **New State Management:**
   - Keep local `customScenarios` state (array of suggestions)
   - Load suggestions on mount when in lobby
   - State: `customScenarios: { id: string, suggestion: string, player_name: string }[]`

2. **New UI Component in Lobby:**
   - Collapsible "Vorschläge" section below player cards
   - ALL players can submit suggestions (not just Host)
   - Input field + Submit button
   - Display list of submitted suggestions

3. **Integration with Scenario Selection:**
   - Host sees preset scenarios in dropdown (existing)
   - Add "Community Vorschläge" section below
   - Can select from suggestions as ready-to-use scenarios

**UI Mockup:**

```
┌─────────────────────────────────────┐
│ Players                    [⚙️]    │
│ ┌─────┐ ┌─────┐ ┌─────┐            │
│ │ 👤  │ │ 👤  │ │ 👤  │            │
│ └─────┘ └─────┘ └─────┘            │
│                                     │
│ ┌─ Suggestions (2) ──────────────┐│
│ │ + Add new suggestion              ││
│ ├─────────────────────────────────┤│
│ │ 🎵 Prosecco Afterparty — Max   ││
│ │ 🎵 Road Trip — Anna           ││
│ └─────────────────────────────────┘│
│                                     │
│ Scenario: [Prosecco Afterparty ▼] │
│ [or enter custom...]               │
│                                     │
│            [Start Round]           │
└─────────────────────────────────────┘
```

**Files to Modify:**
- `components/RoomClient.tsx` - Main changes for:
  1. Auto-close settings on resume
  2. New state: `customScenarios`
  3. New function: `loadCustomScenarios`
  4. New UI: Suggestion submission in lobby
  5. New UI: Host selection from suggestions

---

## Detailed Changes

### Step 1: Add State for Custom Scenarios

```typescript
// After suggestions state
const [customScenarios, setCustomScenarios] = useState<{ 
  id: string; 
  suggestion: string; 
  player_name: string 
}[]>([]);
const [showSuggestions, setShowSuggestions] = useState(false);
```

### Step 2: Load Custom Scenarios on Lobby Entry

```typescript
// Load suggestions when in lobby and room exists
useEffect(() => {
  if (!room?.id || room?.active_round_id) return;
  
  fetch(`/api/scenario-suggestions?roomId=${room.id}`)
    .then(res => res.json())
    .then(data => setCustomScenarios(data.suggestions ?? []));
}, [room?.id, room?.active_round_id]);
```

### Step 3: Add Submit Function

```typescript
const handleSubmitCustomScenario = async () => {
  if (!room?.id || !currentPlayer?.id || !customScenarioInput.trim()) return;
  // POST to /api/scenario-suggestions
  // Update local state after success
};
```

### Step 4: Modify Lobby UI

Add collapsible section after player cards:
- Toggle button "Vorschläge (X)"
- Input + Submit (ALL players)
- List of submitted suggestions

### Step 5: Modify Scenario Selection for Host

When Host selects scenario:
- Preset scenarios (dropdown)
- "Community Vorschläge" section showing suggestions
- Click to select as scenario

### Step 6: Auto-close Settings on Resume

```typescript
const handlePauseGame = async (action: 'pause' | 'resume') => {
  // ... existing pause/resume logic ...
  if (action === 'resume') {
    setShowSettings(false);  // Auto-close
  }
};
```

---

## Dependent Files

- `components/RoomClient.tsx` - Main implementation
- No new API routes needed (existing `/api/scenario-suggestions` works)

---

## Follow-up Steps

1. Test pause/resume - verify settings closes
2. Test suggestion submission as non-host player
3. Test host selecting suggestion as scenario
4. Verify smooth UX flow
