## Problem Statement

The Good Fight browser tracker has its foundation built (Setup, Personnel, Recruitment, Vandalism, Gather Supplies, Scout-start) with 118 passing tests, but the game isn't playable end-to-end yet: there's no Recruit Attempt implementation, no Turn lifecycle, no Crackdown, no Mid/Late-Game Operations, no Victory, and no headless simulation layer. Development so far also produced a known bug (Leader Skill Level drops when it shouldn't) and a testing gap (no test verifies a UI button actually reaches its engine call).

## Solution

Complete the core game engine and UI wiring so a full game (setup → recruit → operate → crackdown → victory) is playable, fix the Leader Skill bug, backfill DOM-wiring tests per ADR-0002, then build the headless simulation layer (reusing the same engine modules, per `plan/simulation.md`'s original architecture) so batches of AI-driven playthroughs can run for balance analysis.

Domain vocabulary throughout follows `CONTEXT.md`. Rule interactions follow the source rulebook (`The Good Fight Mini-TTRPG (Solo).pdf`) plus the clarifications below, which resolve places where the rulebook was ambiguous or where `plan.md`/the current code diverged from it.

## User Stories

1. As a player, I want my Leader Skill Level to never decrease once raised, so that losing my best Operative doesn't erase my Leader's progress (fixes the current `Math.max`-mirror bug in `updateLeaderSkill`).
2. As a player, I want every button that triggers a game action to reliably reach its engine logic, so that a wiring mistake can't silently do nothing (per ADR-0002 — DOM-wiring test for every engine-calling button, including the ones already shipped).
3. As a player, I want the in-flight Scout bug fixed, so that starting a Scout operation correctly removes my assigned Operatives from the available pool until it resolves.
4. As a player, I want to attempt Recruitment with the correct dice math, so that my base d10 (or d12 if I spend a Supply) plus my Influence-tier bonus die is summed and compared against the Recruit's card value.
5. As a player, I want to end my turn and have initiate timers advance, detained Operatives return on schedule, and multi-turn Operations advance or resolve, so that the turn lifecycle matches the rulebook.
6. As a player, I want a Crackdown check every end of turn (d100 ≤ Heat), with the correct 5-tier penalty table and cascade substitution (Operative → Initiate → Supplies, each missing unit converting to 2 of the next type down), so that Crackdown consequences are correctly enforced.
7. As a player, I want Operatives and Initiates lost to a Crackdown to be shuffled back into the Recruitment Deck, so the population pool stays consistent.
8. As a player, I want Heat reduced by the Crackdown roll's value every turn regardless of whether it triggered, so Heat naturally cools over time.
9. As a player, I want to run a Late-Game Scout (3-turn Multi-turn Operation, harsher failure penalties than Scout) so that I can uncover Late-Game Operation opportunities.
10. As a player, I want to choose a Difficulty (easy/medium/hard) once at game setup, so the Influence threshold for all my Mid-Game (30/45/60) and Late-Game (60/90/120) Operation attempts for that game is fixed accordingly.
11. As a player, I want to execute an available Mid-Game Operation and roll on the d6 outcome table for its effect, so that scouted opportunities pay off.
12. As a player, I want a failed Mid-Game or Late-Game Operation to capture (not detain) the assigned Operative(s) involved, shuffling their cards back into the Recruitment Deck, matching the rulebook's Operation-tier failure consequence.
13. As a player, I want to execute an available Late-Game Operation and roll on the d8 outcome table, so that completing 3 distinct Late-Game Operations triggers Victory.
14. As a player, I want re-rolling a duplicate Late-Game Operation type on the outcome table to also exclude types I currently have available-but-unexecuted (not just already-completed types), so I never hold two opportunities of the same type at once — a deliberate deviation from the rulebook's literal wording (which only excludes completed types).
15. As a player, I want a Victory screen when I complete 3 Late-Game Operations, summarizing turns taken, operatives lost, and peak Influence.
16. As a player, I want a non-blocking Unwinnable Advisory when I have no Operatives, no Recruit Pool, and an empty Recruitment Deck, so I know my position is likely stuck without being forced to quit.
17. As a player, I want to save/load multiple game slots and see a scrollable turn history log, so I can pick up a game later and review what happened.
18. As a developer, I want a headless simulator that runs one full game using the real engine modules (no DOM), accepting an AI strategy function and a Difficulty setting, so simulation never drifts from the playable game's rules.
19. As a developer, I want Cautious/Aggressive/Balanced/Random AI strategies, each with a hard-coded rule for the Compound Failure choice (detain vs. lose Supplies) reflecting that strategy's personality (e.g. Cautious protects headcount and picks −Supplies; Aggressive protects Supplies and picks detain; Balanced picks whichever resource it currently has more slack in; Random picks randomly).
20. As a developer, I want to run a batch of N games for one Strategy + Difficulty pair and get an aggregate summary (win rate, turn-count stats, resource stats, crackdown stats), so I can compare strategies and difficulties against each other.
21. As a developer, I want per-turn and per-game metrics collected during simulation, so a single game can be drilled into turn-by-turn.
22. As a developer, I want a dashboard (`simulate.html`) with the chart set from `plan/simulation.md` (win rate, turn-count histogram, resource curves, crackdown analysis, operative lifecycle funnel, operation completion heatmap, milestone timeline, single-game drilldown) so results are explorable without reading raw JSON.
23. As a developer, I want CSV/JSON export of simulation results, so I can analyze runs outside the browser.

## Implementation Decisions

- **Leader Skill Level is a ratchet.** It only ever increases to match the highest card value any current or past Operative has reached; it must never be recomputed as a live `Math.max` over currently-available Operatives. Confirmed by the source PDF's Turns section ("your skill doesn't go down if Operative is lost").
- **Recruit Attempt roll = base die + bonus die, summed.** Base die is d10, or d12 if the player spends 1 Supply. Bonus die is 0 (no die) below 50 Influence, then d4 at 50, incrementing (d6/d8/d10/d12/d20) every 50 Influence thereafter, capped at d20. Sum compared to the Recruit's card value; roll ≥ value succeeds.
- **Difficulty is a new game-wide setting**, chosen once at the Setup screen alongside Resistance Values/Regime Type/Input Mode (unlike those, Difficulty has real mechanical effect — it is not flavor). It fixes which Influence threshold (30/45/60 for Mid-Game, 60/90/120 for Late-Game) gates Operation attempts for the rest of that game.
- **Crackdown Cascade is a chained multiplier**, not a flat fallback: for a penalty requiring N of personnel-type A, each of the N not available converts to 2 units of the next type down (Operative → Initiate → Supplies), and this conversion can chain a second time (missing Initiates → Supplies) if the intermediate type is also unavailable. Worked example: Warehouse raid (roll 61–80) with 1 Operative and 0 Initiates available → −1 Operative (all that's available) + the 1 missing Operative converts to 2 Initiates owed → 0 Initiates available converts that to 2×2 = −4 Supplies. Net: −1 Operative, −4 Supplies.
- **Compound Failure's second penalty is a genuine free player choice** (detain vs. lose Supplies), not availability-gated — this was previously fixed correctly (see `questions.md`) and stays as-is; do not rework `resolveSignificantVandalism`/`resolveScout`/etc.
- **Mid-Game/Late-Game Operation failure captures, not detains.** Per the PDF's Operations table, failure captures (permanently loses, card recycled to the Recruitment Deck) the assigned Operative(s) — this is a different consequence than the Detained-Operative penalty used by Vandalism/Scout failures. Do not reuse the Detained code path for these.
- **Late-Game Operations table is rolled with a d6, not the PDF's printed "d8"** — confirmed misprint: the table only defines 6 rows (matching the Mid-Game Operations table, correctly labeled d6 for its own 6 rows), and the rulebook has no rows 7–8. When rolling this table (on a successful Late-Game Scout), re-roll if the resulting type is already completed *or* already sitting unexecuted in `availableLateGameOps`. This dedup rule is broader than the PDF's literal "already been successfully executed" wording — a deliberate deviation, worth a one-line comment at the reroll site pointing back to this decision.
- **Testing seam**, per ADR-0001/ADR-0002: engine modules (`state`/`deck`/`dice`/`operations`/`crackdown`/`turn`) are tested as pure async functions with injected Dice/Deck providers (existing pattern in `test-operations.js`). Every button/handler that calls into an engine module additionally gets a DOM-wiring test (happy-dom, existing pattern in `test-app.js`/`test-ui.js`) asserting the click reaches that call — including buttons already shipped in Phases 1–2, which currently lack this coverage.
- **Simulation reuses the engine modules with zero parallel implementation** (per `plan/simulation.md`) — `simulator.js`/`strategies.js`/`metrics.js`/`batch.js` under `js/simulation/`, with Input Mode always forced to digital.
- **Difficulty is a batch-level simulation parameter**, selectable like Strategy — a batch runs N games at one Strategy + Difficulty pair; comparing difficulties means running separate batches and overlaying results, the same pattern already used for comparing strategies.
- **Turn lifecycle order** (unchanged from `plan.md`, not contradicted by the PDF): advance initiate timers → release expired Detained Operatives → advance Multi-turn Operations (resolving any that complete) → Crackdown check (roll d100 ≤ Heat) → reduce Heat by the roll's value → update Leader Skill (ratchet) → increment turn counter.

## Testing Decisions

- Tests verify behavior through public interfaces, never internal state shape or private helpers — a test should keep passing across a refactor that doesn't change observable behavior.
- Tracer-bullet TDD throughout (ADR-0001): one seam confirmed, one failing test written, minimal implementation, green, repeat. No batch-writing a module's full test suite before any implementation exists.
- Engine-level tests: prior art is `test-operations.js` — inject known Dice/Deck results via `Dice.setProvider`/`Deck.setProvider`, call the engine function, assert on the returned/mutated state.
- DOM-wiring tests: prior art is `test-app.js`'s screen-router tests and `test-ui.js`'s modal tests — construct the DOM via happy-dom, dispatch the click, assert the expected engine function was invoked (or its observable effect occurred).
- Simulation correctness is engine-level too: `simulator.js` calling the same `operations.js`/`crackdown.js`/`turn.js` functions as the playable game means no separate rule-correctness tests are needed for simulation — only strategy-decision and metrics-aggregation logic need their own tests.

## Out of Scope

- Dice-roll and Crackdown-roll UI animation polish (cosmetic, `plan.md` Phase 6 item, not gameplay-blocking).
- Undo-last-action.
- Keyboard shortcuts.
- Mobile-responsive layout (desktop/tablet is the target).
- Puppeteer/Playwright migration (only needed if real-browser rendering tests become necessary later).

## Further Notes

`plan/` (plan.md, questions.md, simulation.md, test-driven-development.md, 2026-02-23-dev-log.md) is being mined into this PRD, `CONTEXT.md`, and `docs/adr/`, then deleted — this PRD plus the to-tickets breakdown that follows it are the new source of truth for remaining work, replacing the phase-based plan.
