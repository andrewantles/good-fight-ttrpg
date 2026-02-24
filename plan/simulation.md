# Game Simulation & Analysis Plan

## Overview

A headless simulation layer that runs the game engine without UI, using AI player strategies to make decisions. Simulations can run a single game or thousands, collecting detailed metrics at every turn. Results are explored via an interactive dashboard with charts and filters.

The simulation reuses the exact same game logic modules (`state.js`, `deck.js`, `dice.js`, `operations.js`, `crackdown.js`, `turn.js`) as the playable game — no parallel implementation, no drift. The only difference is that decisions come from a strategy function instead of a human clicking buttons.

---

## Architecture

### File Structure

```
/
├── js/
│   ├── ... (existing game modules)
│   └── simulation/
│       ├── simulator.js        — Headless game loop, runs one full game
│       ├── strategies.js       — AI player decision-making functions
│       ├── metrics.js          — Per-turn and per-game data collection
│       └── batch.js            — Run N games, aggregate results
├── simulate.html               — Simulation launcher + results dashboard
├── css/
│   └── simulate.css            — Dashboard-specific styling
```

### How It Works

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  batch.js   │────▶│ simulator.js │────▶│  strategy   │
│  (run N     │     │ (one game    │     │  (decides    │
│   games)    │     │  loop)       │     │   actions)   │
└─────────────┘     └──────────────┘     └─────────────┘
       │                    │
       │                    ▼
       │            ┌──────────────┐
       │            │  metrics.js  │
       │            │ (record each │
       │            │   turn)      │
       │            └──────────────┘
       │
       ▼
┌─────────────────┐
│  Dashboard UI   │
│  (charts, tables│
│   filters)      │
└─────────────────┘
```

1. `batch.js` spins up N games with a chosen strategy
2. Each game runs via `simulator.js` — a tight loop calling the real game engine, no DOM, no delays
3. The strategy function receives the current game state and returns which operations to execute this turn
4. `metrics.js` snapshots the state after every turn and records events
5. When the batch completes, all results are passed to the dashboard for visualization

### Performance

Since there's no DOM rendering, animations, or async UI waits, a single game should complete in under 10ms. A batch of 1,000 games should finish in seconds. For very large batches (10,000+), we use `setTimeout` chunking or a Web Worker to avoid freezing the browser tab.

```js
// batch.js — chunked execution to keep UI responsive
async function runBatch(count, strategy, onProgress) {
  const results = [];
  const CHUNK = 50;
  for (let i = 0; i < count; i += CHUNK) {
    for (let j = i; j < Math.min(i + CHUNK, count); j++) {
      results.push(runOneGame(strategy));
    }
    onProgress(Math.min(i + CHUNK, count), count);
    await new Promise(r => setTimeout(r, 0)); // yield to UI
  }
  return results;
}
```

---

## AI Player Strategies

Each strategy is a function: `(gameState) → Array<Action>` — given the current state, it returns what to do this turn. Strategies range from simple to sophisticated.

### Strategy 1: "Cautious" (Baseline)

Conservative, low-risk play. Prioritizes keeping Heat low and building a stable operative base.

```
Priority order each turn:
1. If Heat > 60: do nothing (hunker down, let crackdown reduce Heat)
2. Recruit attempts on any recruit pool cards (lowest value first)
3. Gather Supplies if supplies < 10
4. Minor Vandalism with spare operatives
5. Scout when 4+ operatives available AND Heat < 40
6. Execute mid/late-game ops only when requirements are comfortably exceeded
```

### Strategy 2: "Aggressive"

Maximizes Influence gain, tolerates high Heat. Pushes toward late-game operations ASAP.

```
Priority order each turn:
1. Highest-tier Vandalism affordable (Significant > Average > Minor)
2. Recruit attempts (highest value cards first — go for strong operatives)
3. Gather Supplies only when can't afford next operation
4. Scout as soon as possible
5. Execute mid/late-game ops as soon as requirements are met
```

### Strategy 3: "Balanced"

Middle ground — manages Heat actively while still progressing.

```
Priority order each turn:
1. If Heat > 50: prioritize Gather Supplies + Recruit only
2. If Heat < 30: push Vandalism (Average preferred)
3. Recruit attempts (mid-value cards, 6-10 range, for reliable success)
4. Scout when Heat < 40 AND 5+ operatives
5. Execute mid-game ops that reduce Heat (Embed Mole, Industry Strike)
6. Late-game ops when 14+ operatives (buffer above the 12 minimum)
```

### Strategy 4: "Random"

Makes legal random choices each turn. Useful as a control group — if Random wins 2% of the time, a strategy winning 40% is clearly doing something right.

```
Each turn:
1. List all operations whose requirements are currently met
2. Pick one at random
3. Assign random eligible operatives
4. Repeat until no more operatives or operations available
```

### Strategy 5: "Custom" (User-Defined)

The dashboard lets the user define simple strategy rules via dropdowns/sliders:
- Heat threshold for "hunker down" (slider: 0–100)
- Preferred Vandalism tier (Minor / Average / Significant / Highest Affordable)
- Recruit priority (Lowest Value First / Highest Value First / Random)
- Scout trigger (operative count threshold + Heat ceiling)
- Supply floor (minimum supplies before gathering more)

This lets users test hypotheses without writing code: "What if I never do Significant Vandalism?" or "What if I only scout when Heat is below 20?"

---

## Metrics Collected

### Per-Turn Snapshot

Captured after every turn resolution (including crackdown):

```js
{
  turn: 1,
  influence: 0,
  heat: 0,
  supplies: 0,
  operativeCount: 0,
  initiateCount: 0,
  recruitPoolSize: 0,
  detainedCount: 0,
  deckSize: 52,
  leaderSkillLevel: 0,
  operationsExecuted: [],       // what was attempted this turn
  operationResults: [],         // success/failure for each
  crackdownOccurred: false,
  crackdownRoll: null,
  crackdownTier: null,
  personnelLost: 0,             // operatives/initiates lost this turn
  suppliesSpent: 0,
  suppliesGained: 0,
  influenceGained: 0,
  influenceLost: 0,
  heatGained: 0,
  heatReduced: 0,              // from crackdown roll subtraction
  recruitsAttempted: 0,
  recruitsSucceeded: 0,
  midGameOpsAvailable: 0,
  lateGameOpsAvailable: 0,
  lateGameOpsCompleted: 0,
}
```

### Per-Game Summary

Computed when a game ends (win or stall):

```js
{
  gameId: 0,
  strategy: 'balanced',
  outcome: 'win' | 'stall',    // stall = no legal moves for 10 consecutive turns
  totalTurns: 0,
  finalInfluence: 0,
  finalHeat: 0,
  finalSupplies: 0,
  peakInfluence: 0,
  peakHeat: 0,
  peakOperatives: 0,
  totalOperativesRecruited: 0,
  totalOperativesLost: 0,
  totalCrackdowns: 0,
  crackdownsByTier: [0,0,0,0,0],
  totalSuppliesGathered: 0,
  totalSuppliesSpent: 0,
  midGameOpsCompleted: [],      // which ones
  lateGameOpsCompleted: [],     // which ones
  winningTurn: null,            // turn number of 3rd late-game op, if won
  turnSnapshots: [],            // full array of per-turn snapshots (for drill-down)

  // Derived timing
  firstOperativeTurn: 0,       // when did the first operative become available?
  firstScoutTurn: 0,           // when was first scout launched?
  firstMidGameOpTurn: 0,       // when was first mid-game op attempted?
  firstLateGameOpTurn: 0,      // when was first late-game op attempted?
}
```

### Batch Aggregate

Computed across all games in a batch:

```js
{
  totalGames: 0,
  strategy: 'balanced',
  wins: 0,
  winRate: 0.0,
  losses: 0,

  // Turn count stats
  turnCount: { min, max, mean, median, stdDev, p25, p75 },

  // Resource stats (at game end)
  finalInfluence: { min, max, mean, median },
  finalHeat: { min, max, mean, median },

  // Personnel stats
  peakOperatives: { min, max, mean, median },
  totalOperativesLost: { min, max, mean, median },

  // Crackdown stats
  crackdownsPerGame: { min, max, mean, median },
  crackdownTierDistribution: [0,0,0,0,0],  // total across all games

  // Operation completion rates
  midGameOpCompletionRate: {},    // per operation type
  lateGameOpCompletionRate: {},   // per operation type

  // Milestone timing
  avgFirstOperativeTurn: 0,
  avgFirstScoutTurn: 0,
  avgFirstMidGameOpTurn: 0,
  avgFirstLateGameOpTurn: 0,

  // Per-turn averages across all games (for trend charts)
  averageCurves: {
    influence: [],    // avg influence at turn 1, 2, 3, ...
    heat: [],
    supplies: [],
    operatives: [],
  },
}
```

---

## Dashboard (`simulate.html`)

A separate page from the main game. Interactive, chart-heavy, designed for exploration.

### Controls Panel (Top)

- **Strategy selector**: dropdown (Cautious / Aggressive / Balanced / Random / Custom)
- **Custom strategy editor**: collapsible panel with sliders and dropdowns (only when Custom selected)
- **Game count**: input field (default 100, max 10,000)
- **"Run Simulation" button**: starts batch, shows progress bar
- **"Compare Strategies" mode**: run same batch count with 2–4 strategies side-by-side

### Charts & Visualizations

All charts rendered with **Chart.js** (a copy of the library to be stored locally, no build step, MIT license). Lightweight, canvas-based, interactive tooltips and zoom built in.

#### 1. Win Rate Bar Chart
- Bar per strategy showing win percentage
- Error bars showing confidence interval (useful at lower game counts)
- Immediate answer to "which strategy is best?"

#### 2. Turn Count Distribution (Histogram)
- X-axis: number of turns to win (or stall)
- Y-axis: frequency
- Separate colors for wins vs stalls
- Shows whether games are consistently paced or wildly variable

#### 3. Resource Curves Over Time (Line Charts)
- X-axis: turn number
- Y-axis: resource value
- Four lines: Influence, Heat, Supplies, Operative count
- Shows the **average** across all games, with shaded bands for 25th–75th percentile
- Reveals the typical game arc — when does Influence take off? When does Heat peak?

#### 4. Crackdown Analysis
- **Frequency chart**: how many crackdowns per game (histogram)
- **Tier distribution**: pie or bar chart of which tiers hit most often
- **Crackdown timing**: scatter plot of turn number vs crackdown tier (do worse crackdowns cluster late?)

#### 5. Operative Lifecycle Funnel
- Sankey or stacked bar: total cards drawn → recruited → promoted to operative → lost to crackdown → survived to endgame
- Shows attrition rate at each stage

#### 6. Operation Completion Heatmap
- Grid: rows = operation types, columns = strategies
- Cell color = completion rate (red = rare, green = common)
- Quickly shows which operations each strategy tends to complete

#### 7. Milestone Timeline (Box Plot)
- One box plot per milestone: first operative, first scout, first mid-game op, first late-game op, victory
- Shows when key events typically happen and how much variance there is

#### 8. Single Game Drilldown
- Click any dot on a scatter plot (or select game ID from a list) to see the full turn-by-turn timeline
- Turn-by-turn table with expandable rows showing every event
- Mini line charts for that specific game's resource curves
- Useful for understanding *why* a particular game won or stalled

### Strategy Comparison View

When "Compare Strategies" mode is active:
- All charts show overlaid data with color-coded legends
- Side-by-side summary table:

| Metric | Cautious | Aggressive | Balanced | Random |
|--------|----------|------------|----------|--------|
| Win Rate | 34% | 18% | 41% | 3% |
| Avg Turns to Win | 42 | 31 | 38 | 67 |
| Avg Crackdowns | 4.2 | 8.7 | 5.1 | 6.3 |
| Avg Peak Operatives | 8 | 11 | 10 | 7 |
| ... | | | | |

---

## Export & Persistence

### Raw Data Export
- **"Export CSV" button**: downloads all per-game summaries as CSV for external analysis (Excel, Python, R)
- **"Export JSON" button**: full dataset including per-turn snapshots for programmatic use
- Column headers match the metric names above for easy mapping

### Save/Load Simulation Results
- Results saved to localStorage (keyed by strategy + timestamp)
- "History" panel shows past simulation runs with quick-load
- Allows comparing a run from today against one from after a rule change

---

## Implementation Phases

### Phase S1 — Simulation Core
1. `simulator.js` — headless game loop that runs one complete game using the existing engine modules, accepts a strategy function, returns per-game summary
2. `metrics.js` — per-turn snapshot collection, per-game summary computation
3. `strategies.js` — implement Cautious and Random strategies
4. `batch.js` — run N games with chunked execution, progress callback
5. Basic `simulate.html` with run button, progress bar, and text output of aggregate stats

### Phase S2 — Dashboard Charts
6. Integrate Chart.js (downloaded and stored locally, bundled with app repo)
7. Win rate bar chart
8. Turn count histogram
9. Resource curves (line chart with percentile bands)
10. Crackdown analysis charts

### Phase S3 — Advanced Strategies & Comparison
11. Implement Aggressive and Balanced strategies
12. Strategy comparison mode (multi-strategy overlay)
13. Summary comparison table
14. Operation completion heatmap

### Phase S4 — Drilldown & Polish
15. Single game drilldown view (turn-by-turn table + mini charts)
16. Milestone timeline box plots
17. Operative lifecycle funnel
18. Custom strategy editor (sliders/dropdowns)
19. CSV/JSON export
20. Results persistence (localStorage)

---

## Relationship to Main Game

The simulation layer is **additive** — it imports the game engine modules but doesn't modify them. If a rule changes in the game code, the simulation automatically reflects it. The only simulation-specific code is the strategy functions, metrics collection, and dashboard UI.

```
Game Engine (shared)          Simulation Layer (additive)
─────────────────────         ──────────────────────────
state.js                  ──▶ simulator.js (calls engine in a loop)
deck.js                   ──▶ strategies.js (makes decisions)
dice.js                   ──▶ metrics.js (records snapshots)
operations.js             ──▶ batch.js (runs N games)
crackdown.js              ──▶ simulate.html (dashboard)
turn.js
```

The input mode is always set to `digital` for simulations — dice and cards are auto-generated. The async API means the simulator just `await`s each roll/draw and gets instant results with no UI prompts.

### Environment Requirements

Simulations run in one of two ways:

- **Browser** (`simulate.html`): zero installs — open the file, configure, and run. Dashboard charts render in-page. Best for interactive exploration.
- **Terminal** (`node`): requires Node.js + happy-dom (`npm install`). Best for large batches (10,000+ games) or scripted/automated runs.

Both use the same game engine and simulation code. See the main [plan.md](plan.md) for full environment setup details.
