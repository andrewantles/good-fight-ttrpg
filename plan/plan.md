# The Good Fight TTRPG — Browser Implementation Plan

## Overview

A fully static, client-side web application that serves as an interactive game tracker and play interface for *The Good Fight* solo TTRPG. No backend required — all game state lives in the browser (with localStorage persistence). The app can fully replace the physical card deck, dice, and paper tracking with a digital interface — or the player can use their own physical dice and cards and enter results manually. A global **Input Mode** toggle lets the player switch between digital and physical at any time.

---

## Tech Stack

- **HTML/CSS/JS** — vanilla, no frameworks. Single `index.html` + supporting files.
- **localStorage** — save/load game state, support multiple save slots.
- **No build step** — open `index.html` in a browser and play.

### Environment Requirements

| Activity | Requirements |
|----------|-------------|
| **Playing the game** | Any modern browser. Zero installs. |
| **Running tests** | Node.js + happy-dom (`npm install`) |
| **Running simulations** | Node.js + happy-dom (`npm install`) |

The game itself has no runtime dependencies. Node and happy-dom are **development-only** tools for automated testing and simulation — they are not needed to play.

---

## Core Architecture

### File Structure

```
/
├── index.html          — Entry point, app shell
├── package.json        — Dev dependency: happy-dom (for tests/simulations only)
├── css/
│   └── style.css       — All styling (dark, thematic aesthetic)
├── js/
│   ├── app.js          — App initialization, screen routing
│   ├── state.js        — Game state object, save/load (localStorage)
│   ├── deck.js         — Virtual 52-card deck (shuffle, draw, return)
│   ├── dice.js         — Dice rolling engine (d4, d6, d8, d10, d12, d20, d100)
│   ├── operations.js   — Operation definitions, requirements, resolution logic
│   ├── crackdown.js    — Crackdown table and resolution
│   ├── turn.js         — Turn lifecycle (assign → execute → crackdown → advance)
│   └── ui.js           — DOM rendering helpers, modals, notifications
├── tests/
│   ├── run-node.js     — Node + happy-dom test harness (terminal runner)
│   ├── tests.html      — Browser test runner (visual dashboard)
│   ├── test-runner.js  — Minimal assertion library + test registration
│   └── test-*.js       — Test files per module
```

### Input Mode — Digital vs. Physical

A core architectural concept: every randomized input (dice rolls and card draws) passes through an **input provider** abstraction. The player chooses their preferred mode, and can switch at any time.

#### Settings (stored in game state)

```js
{
  inputMode: {
    dice: 'digital' | 'physical',   // global default for all dice
    cards: 'digital' | 'physical',  // global default for card draws
  }
}
```

- **Digital mode** (default): The app generates results automatically via `Math.random()`. Dice rolls show an animation; card draws pull from the virtual deck.
- **Physical mode**: Whenever a dice roll or card draw is needed, the app pauses and presents a manual entry prompt instead of generating a result.

#### How It Works — Dice (Physical Mode)

When the game needs a roll (e.g., d100 for an operation check):
1. The resolution modal shows: **"Roll a d100 and enter your result:"**
2. A number input field appears with min/max validation for the die type (e.g., 1–100 for d100, 1–10 for d10)
3. Player enters their physical roll → clicks "Submit"
4. Game continues with that value as if it had been rolled digitally

For operations requiring multiple rolls (e.g., Gather Supplies = 3 rolls, or recruit attempt with bonus dice), each roll is prompted individually in sequence.

#### How It Works — Cards (Physical Mode)

When the game needs a card draw (e.g., recruiting to the pool):
1. The draw modal shows: **"Draw a card from your deck and enter it:"**
2. A card picker appears: select **Suit** (Hearts/Diamonds/Clubs/Spades) and **Rank** (2–10, J, Q, K, A)
3. Player enters the card they physically drew → clicks "Submit"
4. The app tracks that card as being in play (to prevent duplicates and maintain deck consistency)

When cards are returned to the deck (captured operatives), the app shows a reminder: **"Return these cards to your physical deck and shuffle: [card list]"**

#### Hybrid Use

The two toggles (dice / cards) are independent — a player could use the virtual deck but roll physical dice, or vice versa. The toggle is accessible from a settings gear icon in the top bar and can be changed mid-game at any time.

#### Implementation Detail

Both `dice.js` and `deck.js` expose the same API regardless of mode. In digital mode they return results immediately (via Promise). In physical mode they return a Promise that resolves when the player submits their input. The rest of the game logic doesn't need to know which mode is active — it just `await`s the result.

```js
// dice.js
async function roll(dieType) {
  if (state.inputMode.dice === 'digital') {
    return digitalRoll(dieType);   // Math.random()
  } else {
    return manualDiceInput(dieType); // show prompt, await user entry
  }
}

// deck.js
async function draw(count) {
  if (state.inputMode.cards === 'digital') {
    return digitalDraw(count);      // pop from virtual deck
  } else {
    return manualCardInput(count);   // show card picker, await user entry
  }
}
```

---

### Game State Object

```js
{
  // Setup
  resistanceValues: [],       // chosen theme values (flavor)
  regimeType: [],             // chosen regime type (flavor)

  // Input Mode
  inputMode: {
    dice: 'digital',          // 'digital' | 'physical'
    cards: 'digital',         // 'digital' | 'physical'
  },

  // Resources
  influence: 0,               // 0–500
  heat: 0,                    // 0–100
  supplies: 0,

  // Deck & Personnel
  recruitDeck: [],            // array of card objects {suit, rank, value}
  recruitPool: [],            // drawn but unvetted
  initiates: [],              // {card, turnsRemaining: 2}
  operatives: [],             // ready for assignment
  detainedOperatives: [],     // {card, turnsRemaining: 1}
  leaderSkillLevel: 0,        // mirrors highest operative value

  // Turn
  currentTurn: 1,
  assignments: [],            // this turn's operative → operation mappings
  multiTurnOps: [],           // {operation, turnsRemaining, assignedOperatives}

  // Operations
  availableMidGameOps: [],    // scouted opportunities {id, name, difficulty}
  availableLateGameOps: [],   // scouted opportunities {id, name, difficulty}
  completedLateGameOps: [],   // win condition: length >= 3

  // Log
  turnLog: []                 // history of events per turn
}
```

---

## Screens / Views

### 1. Title Screen
- New Game / Continue / Load Save
- Brief thematic intro text

### 2. Game Setup Screen
- Pick Resistance Values (checkboxes, 1+)
- Pick Regime Type (checkboxes, 1+)
- Optional: name your Resistance cell
- **Input Mode selection**: toggle for Dice (Digital / Physical) and Cards (Digital / Physical), with brief explanation of each
- "Begin" button → initializes deck, sets starting state

### 3. Main Game Screen (primary interface)

**Layout** — single-page dashboard with these panels:

#### Top Bar — Resource Counters
- Influence (with progress markers at 50-point thresholds showing die upgrade tier)
- Heat (color-coded: green < 25, yellow < 50, orange < 75, red ≥ 75)
- Supplies
- Current Turn number
- Leader Skill Level
- Settings gear icon (access Input Mode toggle + save/load)

#### Left Panel — Personnel
- **Recruit Pool**: list of cards with values, "Attempt Recruit" button per card
- **Initiates**: cards with turn countdown badges (e.g., "Ready in 1 turn")
- **Operatives**: cards available for assignment (draggable or click-to-assign)
- **Detained**: cards with turn countdown
- Visual card representations (suit icon + rank + value)

#### Center Panel — Operations
- List of available operations, each showing:
  - Name & description
  - Requirements (operatives needed, supplies cost, influence threshold)
  - Whether requirements are currently met (green/red indicators)
  - "Assign & Execute" button (or multi-turn "Begin" / "Continue")
- Sections:
  - Standard Operations (Vandalism/Propaganda tiers, Gather Supplies, Recruit, Scout)
  - Available Mid-Game Operations (from scouting)
  - Available Late-Game Operations (from scouting)

#### Right Panel — Turn Log / History
- Scrollable log of this turn's events
- Expandable history of previous turns

#### Bottom Bar — Turn Controls
- "End Turn" button → triggers:
  1. Advance initiate timers
  2. Free detained operatives whose timer expires
  3. Advance multi-turn operation timers
  4. Crackdown check (animated d100 roll)
  5. Subtract crackdown roll from Heat
  6. Update leader skill level
  7. Increment turn counter

### 4. Operation Resolution Modal
- Shows the operation being attempted
- Animated dice roll(s) with result
- Displays target number, modifiers, and outcome
- Success/failure effects applied with clear breakdown
- "Confirm" to apply results to state

### 5. Crackdown Resolution Modal
- d100 roll animation
- If crackdown triggers: show which tier, apply penalties with clear breakdown
- Heat reduction shown
- "Confirm" to proceed

### 6. Victory Screen
- Triggered when 3 Late-Game Operations completed
- Summary stats (turns taken, operatives lost, peak influence, etc.)

### 7. Game Over / Unwinnable Advisory
- Optional soft warning if the player has no operatives, no recruits, and an empty deck

---

## Testing Strategy

This project follows **test-driven development (TDD)** — tests are written before implementation code for each module. The full testing plan, including test infrastructure, per-module test tables, and the TDD workflow, is documented in **[test-driven-development.md](test-driven-development.md)**.

Key points:
- Tests run in the browser (`tests/tests.html`) with no build step or dependencies
- Game logic modules (`deck.js`, `dice.js`, `state.js`, `operations.js`, `crackdown.js`, `turn.js`) are all unit-testable
- The async input provider abstraction allows injecting known dice/card values in tests
- Integration tests verify multi-module flows (recruitment pipeline, turn lifecycle, full game scenarios)
- Each implementation phase below has corresponding tests written first (see TDD doc for mapping)

### TDD Order Rule (enforced from Phase 3 onward)

> **Tests must be written before the implementation, not after.**

Phase 2 deviated from this — implementation (items 8–12) was written first, which allowed rule interpretation bugs to go undetected until tests were written retroactively. Starting with Phase 3, the strict TDD cycle applies to every item:

1. Write the test — define inputs and expected outputs against the spec
2. Run it — confirm it **fails** (a test that passes before implementation is written is not testing anything)
3. Write the minimal implementation to make it pass
4. Run it — confirm it **passes**
5. Refactor if needed, keeping tests green
6. Move to the next item

If implementation already exists for some reason (e.g., a spike or prototype), treat it as suspect: write tests against the spec, watch them reveal any divergence, then fix.

### Test Isolation and localStorage

Test helpers that set up game state must **not** call `localStorage.clear()`. Reasons:

- In the Node/happy-dom runner, `localStorage` is already an isolated in-memory mock (a fresh `happy-dom` `Window` instance per run) — there is no real browser storage to worry about, but `clear()` is still a bad habit to normalize.
- In the browser runner (`tests.html`), `localStorage` is the **real** browser storage — a `clear()` call would wipe the player's actual game saves.

The correct pattern is to call `GameState.save(testState, 'current')`, which overwrites only the specific slot under test. If a test needs a clean slate, construct a fresh `GameState.createInitial()` and save it — don't clear the whole store.

## Simulation & Analysis

A headless simulation layer runs the game engine with AI player strategies to playtest at scale — single games or batches of thousands. Results are explored via an interactive dashboard (`simulate.html`) with charts powered by Chart.js. The full plan is documented in **[simulation.md](simulation.md)**.

Key points:
- Reuses the exact same game engine modules — no parallel implementation
- AI strategies (Cautious, Aggressive, Balanced, Random, Custom) make decisions each turn
- Per-turn snapshots capture every metric (resources, personnel, operations, crackdowns)
- Dashboard includes resource curves, win rate comparisons, crackdown analysis, single-game drilldown, and strategy comparison overlays
- CSV/JSON export for external analysis
- Runs entirely in-browser — 1,000 games in seconds, no server needed

---

## Implementation Phases

> **Current status**: Phase 1 complete. Phase 2 implementation complete (items 8–12); `test-operations.js` created with Phase 2 recruitment tests (18 tests: influence die tiers, leader skill, recruitment pipeline). Two tests intentionally fail against the current implementation — they document known rule bugs in `attemptRecruit()` that must be fixed before Phase 2 is fully done. See [2026-02-23-dev-log.md](2026-02-23-dev-log.md) for session-by-session history.

### Phase 1 — Foundation
1. ~~Set up file structure (index.html, css/, js/)~~ **DONE**
2. ~~Implement `state.js` — game state object, `save()` / `load()` / `reset()` via localStorage~~ **DONE** (10 tests passing)
3. ~~Implement `deck.js` — standard 52-card deck: `shuffle()`, `draw(n)`, `returnCards(cards)`, card value mapping (2-10 face, J=11, Q=12, K=13, A=15). Async API that supports both digital (auto-draw) and physical (manual card entry via picker) modes.~~ **DONE** (15 tests passing)
4. ~~Implement `dice.js` — `roll(dieType)` returning result, support d4/d6/d8/d10/d12/d20/d100. Async API that supports both digital (Math.random) and physical (manual entry with validation) modes.~~ **DONE** (11 tests passing)
5. ~~Implement manual input UI components — dice entry prompt (number input with min/max per die type) and card picker (suit + rank selector), used by physical mode~~ **DONE** (14 tests passing)
6. ~~Implement `app.js` — screen router (title → setup → game → victory)~~ **DONE** (13 tests passing)
7. ~~Basic HTML shell + CSS layout with placeholder panels~~ **DONE**

### Phase 2 — Game Setup & Personnel
8. ~~Title screen UI (New Game / Continue)~~ **DONE** — Continue button enabled/disabled based on saved state; `continueGame()` loads and renders saved game
9. ~~Setup screen (Resistance values, Regime type selection, Input Mode toggles)~~ **DONE** — Begin button captures selections, initializes state, creates/shuffles 52-card recruitment deck, syncs input providers, saves, transitions to game screen
10. ~~Personnel panel rendering (recruit pool, initiates, operatives, detained)~~ **DONE** — `renderPersonnel()` / `renderCardList()` render all four sections with timer badges; re-renders on any state change
11. ~~Card visual component (suit icon, rank, value display)~~ **DONE** — `renderCard()` produces suit icon + rank + numeric value with red/dark suit color coding; corresponding CSS added to `style.css`
12. ~~Recruitment flow: draw card → recruit pool → recruit attempt (dice roll with modifiers) → initiate (2-turn timer) → operative~~ **TESTS WRITTEN, BUGS PENDING** — `attemptRecruit()` and `drawToPool()` implemented in `app.js`; `test-operations.js` created with 18 Phase 2 tests; 2 tests intentionally failing to document known bugs in `attemptRecruit()` (leader block check incorrect, dice formula adds operative skill to roll instead of using roll alone). Fix bugs to complete Phase 2.

### Phase 3 — Operations Engine
13. Operation definitions data structure (requirements, check formulas, outcomes)
14. Operation availability checker (do you have enough operatives/supplies/influence?)
15. Operative assignment UI (select which operatives go on which operation)
16. Operation resolution logic:
    - Minor/Average/Significant Vandalism: d100 - Heat check, apply success/failure
    - Gather Supplies: 3x (d100 - Heat + ½ Influence) checks
    - Recruit Attempt: d10 (+ upgrade dice from influence/supplies) vs card value
    - Scout/Recon: d100 - Heat + operative values, 2-turn assignment
    - Late-Game Scout: d100 - Heat + operative values, 3-turn assignment
17. Dice roll resolution modal with animated rolls and result breakdown (digital mode) or manual entry prompts (physical mode)

### Phase 4 — Mid/Late-Game Operations & Win Condition
18. Mid-Game Operations table (d6 roll on success, 6 possible outcomes)
19. Late-Game Operations table (d8 roll on success, 6 possible outcomes, re-roll duplicates)
20. Multi-turn operation tracking (scout = 2 turns, late-game scout = 3 turns, late-game ops = 3 turns)
21. Victory check after each late-game operation success (3 completed = win)
22. Victory screen with game summary

### Phase 5 — Turn Lifecycle & Crackdown
23. "End Turn" flow:
    - Validate all assignments resolved
    - Advance initiate timers (2 → 1 → operative)
    - Release detained operatives (timer expired)
    - Advance multi-turn operations
    - Crackdown check: roll d100 (digital or manual), if ≤ Heat → resolve crackdown table
    - Subtract d100 roll from Heat
    - Update leader skill level
    - Increment turn
24. Crackdown resolution table (5 tiers based on roll range)
25. Crackdown modal showing penalties applied

### Phase 6 — Polish & UX
26. Save/load system with multiple slots
27. Turn history log (scrollable, per-turn event breakdown)
28. Dice roll animations (CSS + JS, rolling effect before revealing result) — digital mode only
29. Tooltips on operations explaining exact mechanics
30. Color-coded resource bars (Heat danger zones, Influence thresholds)
31. Responsive layout (works on tablet/desktop; mobile-friendly stretch goal)
32. Keyboard shortcuts for common actions
33. Undo last action (optional, within current turn only)
34. Physical mode reminders (e.g., "Shuffle these cards back into your deck: [list]")

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | Vanilla JS | No build step, opens directly in browser, minimal complexity |
| State persistence | localStorage | Fully client-side, survives page refresh, easy to implement |
| Card deck | Virtual array / manual | Digital mode simulates deck; physical mode prompts player to enter drawn cards. App tracks cards in play either way. |
| Dice | `Math.random()` / manual | Digital by default; physical mode prompts for manual entry. Async API abstracts the difference. |
| Operative assignment | Click-to-select | Simpler than drag-and-drop; select operatives then choose operation |
| Multi-turn tracking | State array | Each multi-turn op stored with turns remaining + assigned operatives locked |
| Layout | Dashboard panels | All info visible at once; no hidden tabs for critical game state |

---

## Rules Clarifications to Encode

- **Roll under for success** against the Requirements column, except where noted (Recruit Attempt is roll >= target). For failures, execute **all** bullet points in the failure column.
- Leader always counts as an operative; skill level = highest operative's card value
- Operatives can only be assigned to one operation per turn ("tapped")
- Initiates take exactly 2 turns before becoming operatives
- Detained operatives miss 1 turn then return
- Mid/Late-Game Operations require influence thresholds but do NOT consume influence
- Captured/killed operatives return their cards to the recruitment deck (shuffled in)
- Late-Game Operations table: re-roll if operation already completed
- Crackdown cascade: if not enough of required personnel type, substitute down (operative → initiate → supplies)
- Recruit attempts: operative must have higher value than recruit (or use leader)
- Influence die upgrade tiers: 50=+d4, 100=+d6, 150=+d8, 200=+d10, 250=+d12, 300+=+d20
- **Multi-bullet failures** (all bullets apply, not just one):
  - Significant Vandalism failure: (1) 1 operative detained 2 turns AND (2) 1 operative detained 2 turns OR -2 Supplies
  - Scout/Recon failure: (1) 1 operative detained next turn AND (2) 1 operative detained next turn OR -2 Supplies
  - Late-Game Scout failure: (1) 2 operatives detained 2 turns AND (2) 1 operative detained 2 turns OR -4 Supplies
