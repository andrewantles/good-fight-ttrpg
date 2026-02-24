# Test-Driven Development Plan

## Testing Concepts

### Unit Tests vs. Integration Tests

**Unit tests** verify a single function or module in isolation. You give it known inputs and assert it produces the expected outputs. Nothing else in the system is involved.

Example: Testing that `crackdown.js` selects the correct penalty tier for a roll of 35:
```js
// Unit test — just the tier selection function, nothing else
assert(getCrackdownTier(35) === 'training_ground_raid');
```

The function doesn't touch the game state, render anything, or call other modules. You're testing one piece of logic.

**Integration tests** verify that multiple modules work together correctly as a connected system. They exercise real interactions between components rather than testing each one in isolation.

Example: Testing that completing a Recruit Attempt operation actually moves a card from the recruit pool to the initiates list, deducts the operative's availability, and logs the event:
```js
// Integration test — state + operations + deck working together
setupTestGame({ recruitPool: [aceOfSpades], operatives: [kingOfHearts] });
await executeOperation('recruit_attempt', { target: aceOfSpades, assignedOperative: kingOfHearts, diceResult: 15 });
assert(state.recruitPool.length === 0);
assert(state.initiates.length === 1);
assert(state.initiates[0].card === aceOfSpades);
assert(state.initiates[0].turnsRemaining === 2);
assert(isOperativeTapped(kingOfHearts));
```

Multiple modules had to coordinate — the operation logic called into state management, which updated the personnel lists, which triggered the log. If any link in that chain is broken, the test fails.

**The spectrum:**
| | Unit Test | Integration Test |
|---|---|---|
| Scope | One function/module | Multiple modules working together |
| Speed | Very fast | Still fast (no server, all in-browser) |
| What breaks it | A bug in that one function | A bug in how modules communicate |
| Example | "Does this formula calculate correctly?" | "Does completing a turn properly advance initiates, free detained operatives, and check for crackdown?" |

### What Is a "Modal Flow"?

A **modal** is a UI overlay/popup that appears on top of the main screen and requires the player to interact with it before continuing. In our app, modals are used for:

- **Dice roll resolution**: "You rolled a 73 against a target of 45. Success!" → player clicks "Confirm"
- **Crackdown resolution**: "Crackdown! Roll was 55 — Safehouse Raid. You lose 1 operative." → player selects which operative → clicks "Confirm"
- **Physical dice entry**: "Roll a d100 and enter your result:" → player types number → clicks "Submit"
- **Card picker**: "Draw a card from your deck:" → player selects suit and rank → clicks "Submit"

A **modal flow** is a sequence of modals that chain together. For example, a Significant Vandalism operation might produce:
1. Modal: "Roll d100 for operation check" → result shown
2. Modal (if success): "2 recruits gained — draw 2 cards" → cards shown
3. Modal (if failure): "1 operative detained — select which one" → player chooses

Testing modal flows manually means clicking through each step. Automating them means programmatically simulating that sequence.

### How We Automate Integration Tests

Since our app is vanilla JS with no framework, we have a clean option: **separate the logic from the DOM**. The game engine (state, operations, turns, crackdown) is pure JavaScript that returns data. The UI layer reads that data and renders it. Tests exercise the engine directly without touching the DOM.

For the few cases where we want to test UI interactions (like modal flows), we can:

1. **Programmatically call the same functions the UI calls**, skipping the DOM entirely. If the modal's "Confirm" button calls `resolveOperation(result)`, our test just calls `resolveOperation(result)` directly.

2. **Use a test harness page** (`tests.html`) that loads the app modules and runs scripted scenarios against them.

This works because of a key design decision: **the input mode abstraction**. Since `dice.js` and `deck.js` use an async API, tests can provide a mock input provider that returns predetermined values — no UI interaction needed.

```js
// In tests, override the input provider to return known values
dice.setProvider((dieType) => Promise.resolve(73));  // always "rolls" 73
deck.setProvider((count) => Promise.resolve([{ suit: 'spades', rank: 'A', value: 15 }]));

// Now run the full operation flow — no modals, no DOM, no clicking
await executeOperation('minor_vandalism', { assignedOperatives: [op1] });
// Assert the outcome based on the known roll of 73
```

---

## Test Execution Environment

### Prerequisites

**Playing the game requires nothing** — open `index.html` in any browser. No installs, no dependencies, no build step.

**Running tests and simulations** requires a development environment:

```bash
# One-time setup
brew install node       # or download from nodejs.org (~30–50MB)
npm install             # installs happy-dom (~2MB) from package.json
```

That's it. Two commands.

### How Tests Run

Tests can execute in two ways:

1. **Terminal** (primary, automated): `node tests/run-node.js` — uses happy-dom to provide a complete browser-like environment (`window`, `document`, `localStorage`, events) so all game modules run unmodified. Fast, scriptable, CI-friendly.

2. **Browser** (visual, manual): open `tests/tests.html` — runs the same test files natively with a styled results dashboard. Useful for visual inspection but not automated.

Both run the exact same test files. The test logic is environment-agnostic.

### Why happy-dom?

happy-dom is a fast, lightweight, JS-only implementation of browser APIs. It provides `window`, `document`, `localStorage`, DOM events, and more — without downloading or launching an actual browser. This means our game modules (which reference `localStorage`, `document`, etc.) work in Node without any custom mocks or shims.

At ~2MB installed, it's the right tool for a project where the game code is browser-native but we want terminal-based test execution.

### Progression Pathway

If we eventually need to test actual rendering, canvas, CSS behavior, or complex UI interaction flows, the next step is a headless browser:

| Stage | Tool | Install Size | What It Gives You | When to Switch |
|-------|------|-------------|-------------------|----------------|
| **Current** | happy-dom | ~2MB (npm) | Full DOM, `localStorage`, events — covers all non-rendering browser APIs | Now |
| **Future (if needed)** | Puppeteer or Playwright | ~200–300MB (npm) | Real browser engine — canvas, CSS, network, Web Workers, everything | When you need to test actual rendering, animations, or complex UI flows |

**Puppeteer** (Google) downloads and controls a headless Chromium instance. Most popular headless browser tool, battle-tested, excellent documentation.

**Playwright** (Microsoft) is similar but supports Chromium, Firefox, and WebKit out of the box. Growing rapidly in popularity, arguably better API design, and useful if cross-browser testing matters.

Either would work. The migration is simple: because our test runner outputs results to DOM elements (`#test-summary`, `#test-output`), a headless browser just loads `tests.html`, waits for tests to finish, and reads those elements. Roughly 10 lines of setup code.

---

## Test Infrastructure

### File Structure

```
/
├── package.json              — Dev dependency: happy-dom
├── tests/
│   ├── run-node.js           — Node + happy-dom test harness (terminal runner)
│   ├── tests.html            — Browser test runner (open in browser to run all tests)
│   ├── test-runner.js         — Minimal assertion library + test registration
│   ├── test-deck.js           — Deck module unit tests
│   ├── test-dice.js           — Dice module unit tests
│   ├── test-state.js          — State management unit tests
│   ├── test-operations.js     — Operation logic unit + integration tests
│   ├── test-crackdown.js      — Crackdown resolution unit tests
│   ├── test-turn.js           — Turn lifecycle integration tests
│   └── test-scenarios.js      — Full game scenario integration tests
```

### Test Runner (`test-runner.js`)

A minimal, no-dependency test framework:

```js
const tests = [];
let passed = 0, failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

async function runAll() {
  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      log(`PASS: ${t.name}`);
    } catch (e) {
      failed++;
      log(`FAIL: ${t.name} — ${e.message}`);
    }
  }
  log(`\n${passed} passed, ${failed} failed, ${tests.length} total`);
}
```

### Test Harness (`tests.html`)

```html
<!DOCTYPE html>
<html>
<head><title>The Good Fight — Tests</title></head>
<body>
  <pre id="output"></pre>
  <script type="module">
    // Load game modules + test files, run all tests
  </script>
</body>
</html>
```

Open `tests.html` in a browser → all tests run automatically → results displayed on page. No npm, no Node, no build step.

---

## Test Plan by Module

### `deck.js` — Unit Tests

| # | Test | What It Verifies |
|---|------|-------------------|
| 1 | Fresh deck contains 52 cards | Initialization correctness |
| 2 | All cards are unique (no duplicate suit+rank combos) | Deck integrity |
| 3 | Card values: 2-10 face value, J=11, Q=12, K=13, A=15 | Value mapping |
| 4 | `draw(1)` removes one card from deck, returns it | Draw mechanics |
| 5 | `draw(5)` removes five cards, deck size decreases by 5 | Multi-draw |
| 6 | Drawing from empty deck returns empty array (or error) | Edge case |
| 7 | `returnCards([cards])` adds cards back and shuffles | Card return |
| 8 | After returning cards, deck size increases by returned count | Return integrity |
| 9 | Returned cards can be drawn again | Full cycle |
| 10 | Physical mode: provider function is called instead of auto-draw | Input mode routing |

### `dice.js` — Unit Tests

| # | Test | What It Verifies |
|---|------|-------------------|
| 1 | `roll('d6')` returns value between 1 and 6 (run 100x) | Range validation |
| 2 | `roll('d100')` returns value between 1 and 100 | Range validation |
| 3 | Each die type (d4, d6, d8, d10, d12, d20, d100) respects bounds | All die types |
| 4 | Physical mode: provider function is called with die type | Input mode routing |
| 5 | Provider receives correct die type string | Provider contract |

### `state.js` — Unit Tests

| # | Test | What It Verifies |
|---|------|-------------------|
| 1 | `reset()` produces valid initial state with all required fields | Initialization |
| 2 | `save()` + `load()` round-trips state without data loss | Persistence |
| 3 | Influence clamps to 0–500 range | Resource bounds |
| 4 | Heat clamps to 0–100 range | Resource bounds |
| 5 | Supplies cannot go below 0 | Resource bounds |
| 6 | Multiple save slots are independent | Slot isolation |
| 7 | Loading nonexistent slot returns null (or default state) | Edge case |
| 8 | Input mode persists across save/load | Settings persistence |

### `operations.js` — Unit Tests + Integration Tests

| # | Type | Test | What It Verifies |
|---|------|------|-------------------|
| 1 | Unit | Minor Vandalism requires 1 operative | Requirement check |
| 2 | Unit | Average Vandalism requires 2 operatives + 3 supplies | Requirement check |
| 3 | Unit | Significant Vandalism requires 4 operatives + 5 supplies | Requirement check |
| 4 | Unit | Scout requires 4 operatives + 5 supplies | Requirement check |
| 5 | Unit | Mid-Game Op requires 6 operatives + 10 supplies + influence threshold | Requirement check |
| 6 | Unit | Late-Game Op requires 12 operatives + 20 supplies + influence threshold | Requirement check |
| 7 | Unit | Requirement checker returns false when operatives insufficient | Validation |
| 8 | Unit | Requirement checker returns false when supplies insufficient | Validation |
| 9 | Unit | Requirement checker returns false when influence below threshold | Validation |
| 10 | Unit | Minor Vandalism success: +1 Influence, +1 Heat, ¼ chance recruit | Outcome math |
| 11 | Unit | Gather Supplies: each of 3 rolls checked against d100 - Heat + ½ Influence | Formula |
| 12 | Unit | Recruit attempt: d10 vs card value, upgrade dice at influence thresholds | Formula |
| 13 | Unit | Recruit attempt: operative must have higher value than target | Validation |
| 14 | Unit | Recruit attempt: leader can recruit any value | Leader exception |
| 15 | Integ | Successful recruit attempt moves card from pool → initiates with 2-turn timer | State flow |
| 16 | Integ | Failed Average Vandalism detains 1 random operative for 1 turn | Failure handling |
| 17 | Integ | Successful Scout: rolls on mid-game table, creates opportunity | Multi-module |
| 18 | Integ | Mid-Game Op success applies correct table result to state | Table + state |

### `crackdown.js` — Unit Tests

| # | Test | What It Verifies |
|---|------|-------------------|
| 1 | Roll ≤ 20 → tier 1 (stockpile raid, -3 supplies) | Tier selection |
| 2 | Roll 21–40 → tier 2 (training ground raid) | Tier selection |
| 3 | Roll 41–60 → tier 3 (safehouse raid) | Tier selection |
| 4 | Roll 61–80 → tier 4 (warehouse raid + -20 influence) | Tier selection |
| 5 | Roll 81–100 → tier 5 (HQ raid + -50 influence) | Tier selection |
| 6 | Tier 2 with no initiates → falls back to -4 supplies | Cascade logic |
| 7 | Tier 3 with no operatives → -2 initiates | Cascade logic |
| 8 | Tier 3 with no operatives AND no initiates → supplies penalty | Double cascade |
| 9 | Tier 4 cascade: missing operatives → initiates → supplies | Full cascade |
| 10 | Tier 5 cascade: missing operatives → initiates → supplies | Full cascade |
| 11 | Captured personnel cards returned to recruitment deck | Card recycling |

### `turn.js` — Integration Tests

| # | Test | What It Verifies |
|---|------|-------------------|
| 1 | End turn advances initiate timers (2 → 1) | Timer decrement |
| 2 | Initiate with timer at 1 → becomes operative next end-of-turn | Promotion |
| 3 | Detained operative with timer at 1 → released next end-of-turn | Release |
| 4 | Multi-turn operation advances (turnsRemaining decrements) | Multi-turn tracking |
| 5 | Multi-turn op completing on final turn triggers resolution | Completion trigger |
| 6 | Crackdown triggers when d100 ≤ Heat | Crackdown check |
| 7 | Crackdown does NOT trigger when d100 > Heat | Crackdown check |
| 8 | Heat reduced by d100 roll value after crackdown check | Heat reduction |
| 9 | Heat does not go below 0 after reduction | Bounds check |
| 10 | Leader skill level updates to match highest operative value | Leader update |
| 11 | Leader skill level drops when highest operative is lost | Leader update |
| 12 | Turn counter increments | Basic lifecycle |
| 13 | Tapped operatives become untapped at start of new turn | Reset |

### `test-scenarios.js` — Full Game Integration Tests

These are longer tests that simulate multiple turns of gameplay to verify the system holds together:

| # | Scenario | What It Verifies |
|---|----------|-------------------|
| 1 | **Early game ramp**: Draw 3 recruits → recruit 2 → wait 2 turns → 2 operatives ready | Full recruitment pipeline |
| 2 | **Crackdown recovery**: Set Heat to 80, simulate crackdown, verify state consistent after losses | Crackdown + state integrity |
| 3 | **Mid-game operation flow**: Build to 6 operatives + 30 influence → scout (2 turns) → execute mid-game op | Multi-turn + operation chain |
| 4 | **Win condition**: Complete 3 late-game operations → victory state triggered | End-to-end win |
| 5 | **Physical mode round-trip**: Run operation with mock physical providers → same outcomes as digital | Input mode equivalence |
| 6 | **Save mid-game, reload, continue**: Save state after turn 5 → reload → verify all state intact including multi-turn ops | Persistence integrity |

---

## TDD Workflow

For each module, the development cycle is:

1. **Write the test first** — define what the function should do, with specific inputs and expected outputs
2. **Run it — watch it fail** — confirms the test is actually checking something (not a false pass)
3. **Write the minimal code** to make the test pass
4. **Run it — watch it pass**
5. **Refactor** if needed — clean up the implementation while keeping tests green
6. **Move to the next test**

### Phase Alignment with Main Plan

| Main Plan Phase | Tests Written First |
|-----------------|-------------------|
| Phase 1 — Foundation | `test-deck.js`, `test-dice.js`, `test-state.js`, test runner infrastructure |
| Phase 2 — Setup & Personnel | Recruitment pipeline tests in `test-operations.js` (#15) |
| Phase 3 — Operations Engine | `test-operations.js` (all), operation resolution integration tests |
| Phase 4 — Mid/Late-Game | Mid/late-game table tests, win condition tests in `test-scenarios.js` |
| Phase 5 — Turn & Crackdown | `test-crackdown.js`, `test-turn.js` (all) |
| Phase 6 — Polish | `test-scenarios.js` save/load tests, input mode equivalence tests |

Tests are written **before** the corresponding implementation code in each phase. The test file for a module is created at the start of the phase, populated with failing tests, then the implementation is built to satisfy them.

---

## What We Don't Test (and Why)

- **DOM rendering / CSS layout** — visual correctness is verified by looking at it. Automated DOM tests are brittle and low-value for a project this size.
- **Dice animation timing** — cosmetic, not functional.
- **Browser compatibility** — manual spot-check on Chrome, Firefox, Safari is sufficient. (Although Edge has sufficient market share to consider, it is Chromium-based.)
- **`Math.random()` distribution** — we trust the JS engine. We test that our code uses the result correctly, not that the randomness is fair.
