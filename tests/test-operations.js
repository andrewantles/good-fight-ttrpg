/**
 * Tests for operations.js (Phase 3+) and Phase 2 recruitment logic in app.js.
 *
 * Phase 2 scope (this file):
 *   - Influence die tier helper (getInfluenceDie)
 *   - Leader skill level updates (updateLeaderSkill)
 *   - Recruitment pipeline: drawToPool, attemptRecruit
 *
 * NOTE: Several tests below are written against the CORRECT spec and will
 * FAIL with the current buggy implementation of attemptRecruit. That is
 * expected TDD behavior — they define what needs to be fixed.
 *
 * Known bugs in current attemptRecruit (see questions.md):
 *   1. Leader is blocked when leaderSkillLevel === 0 && operatives.length === 0,
 *      but the leader should always be able to attempt recruitment.
 *   2. The roll formula adds leaderSkillLevel to the dice total; the correct
 *      check is: dice result alone >= card.value (skill only gates whether
 *      an attempt is allowed, not the roll result).
 *   3. No supply-burn option to upgrade d10 → d12 is implemented.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Set up minimal DOM elements that renderGameState / renderPersonnel require.
 * Guards against throws during state mutation tests.
 */
function setupGameDOM() {
  const app = document.getElementById('app');
  if (!app) return;
  app.innerHTML = `
    <div data-screen="title"></div>
    <div data-screen="game">
      <span id="val-influence"></span>
      <span id="val-heat"></span>
      <span id="val-supplies"></span>
      <span id="val-turn"></span>
      <span id="val-leader"></span>
      <div id="section-recruit-pool"><div class="card-list"></div></div>
      <div id="section-initiates"><div class="card-list"></div></div>
      <div id="section-operatives"><div class="card-list"></div></div>
      <div id="section-detained"><div class="card-list"></div></div>
      <div id="turn-log"></div>
    </div>
  `;
}

/**
 * Bootstrap a game state via App.continueGame() and return the live
 * state reference so tests can mutate it before calling App methods.
 *
 * @param {object} [overrides] - Key/value pairs merged onto the initial state.
 * @returns {object} Live game state reference used by App internally.
 */
function bootTestGame(overrides) {
  // Do NOT call localStorage.clear() here.
  // In the Node runner, localStorage is already an isolated happy-dom mock.
  // In the browser runner, clear() would wipe real game saves.
  // GameState.save() below overwrites only the slot under test.
  setupGameDOM();
  const state = GameState.createInitial();
  state.recruitDeck = Deck.createDeck();
  Deck.shuffle(state.recruitDeck);
  if (overrides) Object.assign(state, overrides);
  GameState.save(state, 'current');
  App.continueGame();
  return App.getState();
}

// ─── Suite 1: Influence Die Tiers ─────────────────────────────────────────────

TestRunner.describe('app.js — Influence Die Tiers', function () {

  TestRunner.test('returns null when influence is 0', function () {
    TestRunner.assertEqual(App.getInfluenceDie(0), null);
  });

  TestRunner.test('returns null when influence is below 50', function () {
    TestRunner.assertEqual(App.getInfluenceDie(49), null);
  });

  TestRunner.test('returns d4 at exactly 50 influence', function () {
    TestRunner.assertEqual(App.getInfluenceDie(50), 'd4');
  });

  TestRunner.test('returns d4 up to 99 influence', function () {
    TestRunner.assertEqual(App.getInfluenceDie(99), 'd4');
  });

  TestRunner.test('returns d6 at 100 influence', function () {
    TestRunner.assertEqual(App.getInfluenceDie(100), 'd6');
  });

  TestRunner.test('returns d8 at 150 influence', function () {
    TestRunner.assertEqual(App.getInfluenceDie(150), 'd8');
  });

  TestRunner.test('returns d10 at 200 influence', function () {
    TestRunner.assertEqual(App.getInfluenceDie(200), 'd10');
  });

  TestRunner.test('returns d12 at 250 influence', function () {
    TestRunner.assertEqual(App.getInfluenceDie(250), 'd12');
  });

  TestRunner.test('returns d20 at exactly 300 influence', function () {
    TestRunner.assertEqual(App.getInfluenceDie(300), 'd20');
  });

  TestRunner.test('returns d20 above 300 influence', function () {
    TestRunner.assertEqual(App.getInfluenceDie(500), 'd20');
  });

});

// ─── Suite 2: Leader Skill Level ──────────────────────────────────────────────

TestRunner.describe('app.js — Leader Skill Level', function () {

  TestRunner.test('updateLeaderSkill sets to max operative card value', function () {
    const state = bootTestGame();
    state.operatives = [
      { suit: 'hearts',   rank: '5', value: 5  },
      { suit: 'spades',   rank: 'K', value: 13 },
      { suit: 'diamonds', rank: '8', value: 8  },
    ];
    App.updateLeaderSkill();
    TestRunner.assertEqual(App.getState().leaderSkillLevel, 13);
  });

  TestRunner.test('updateLeaderSkill reflects the single operative when only one exists', function () {
    const state = bootTestGame();
    state.operatives = [{ suit: 'clubs', rank: 'J', value: 11 }];
    App.updateLeaderSkill();
    TestRunner.assertEqual(App.getState().leaderSkillLevel, 11);
  });

  TestRunner.test('updateLeaderSkill sets to 0 when no operatives', function () {
    const state = bootTestGame();
    state.operatives = [];
    App.updateLeaderSkill();
    TestRunner.assertEqual(App.getState().leaderSkillLevel, 0);
  });

  TestRunner.test('updateLeaderSkill recalculates after operative removal', function () {
    const state = bootTestGame();
    state.operatives = [
      { suit: 'hearts', rank: 'A', value: 15 },
      { suit: 'clubs',  rank: '9', value: 9  },
    ];
    App.updateLeaderSkill();
    TestRunner.assertEqual(App.getState().leaderSkillLevel, 15);

    // Remove the highest-value operative
    state.operatives.splice(0, 1);
    App.updateLeaderSkill();
    TestRunner.assertEqual(App.getState().leaderSkillLevel, 9);
  });

});

// ─── Suite 3: Recruitment Pipeline ────────────────────────────────────────────

TestRunner.describe('app.js — Recruitment Pipeline', function () {

  TestRunner.test('drawToPool adds drawn cards to recruitPool', async function () {
    const state = bootTestGame();
    const deckSizeBefore = state.recruitDeck.length;

    Deck.setProvider(null); // digital mode
    await App.drawToPool(3);

    const appState = App.getState();
    TestRunner.assertEqual(appState.recruitPool.length, 3, 'recruitPool should have 3 cards');
    TestRunner.assertEqual(appState.recruitDeck.length, deckSizeBefore - 3,
      'deck should be 3 cards smaller');
    Deck.setProvider(null);
  });

  TestRunner.test('drawToPool appends when pool already has cards', async function () {
    const state = bootTestGame();
    state.recruitPool = [{ suit: 'hearts', rank: '2', value: 2 }];

    Deck.setProvider(null);
    await App.drawToPool(2);

    TestRunner.assertEqual(App.getState().recruitPool.length, 3);
    Deck.setProvider(null);
  });

  // ── Integration test #15 (TDD doc) ──────────────────────────────────────────
  // SPEC: Successful recruit attempt moves card from pool → initiates (2-turn timer).
  // This test uses a state with a high leaderSkillLevel to bypass the known
  // leader-block bug so it can test the state-transition path.
  TestRunner.test('successful recruit moves card from pool to initiates with 2-turn timer', async function () {
    const state = bootTestGame({ leaderSkillLevel: 5 });
    const target = { suit: 'clubs', rank: '3', value: 3 };
    state.recruitPool = [target];
    state.operatives  = [{ suit: 'hearts', rank: '5', value: 5 }];

    // d10 rolls 7 (>= card value 3 → success under either the correct or
    // current buggy formula when leaderSkillLevel = 5)
    Dice.setProvider(() => Promise.resolve(7));
    await App.attemptRecruit(0);
    Dice.setProvider(null);

    const appState = App.getState();
    TestRunner.assertEqual(appState.recruitPool.length, 0, 'pool should be empty after success');
    TestRunner.assertEqual(appState.initiates.length, 1, 'initiates should have 1 entry');
    TestRunner.assertEqual(appState.initiates[0].card.rank, '3', 'correct card in initiates');
    TestRunner.assertEqual(appState.initiates[0].turnsRemaining, 2, 'timer should be 2 turns');
  });

  TestRunner.test('failed recruit attempt leaves card in recruit pool', async function () {
    const state = bootTestGame({ leaderSkillLevel: 5 });
    const target = { suit: 'diamonds', rank: 'A', value: 15 };
    state.recruitPool = [target];
    state.operatives  = [{ suit: 'spades', rank: '5', value: 5 }];

    // d10 rolls 2; even with buggy leaderSkillLevel addition (2+5=7) that is
    // still < 15, so both correct and buggy logic should produce a failure
    Dice.setProvider(() => Promise.resolve(2));
    await App.attemptRecruit(0);
    Dice.setProvider(null);

    const appState = App.getState();
    TestRunner.assertEqual(appState.recruitPool.length, 1, 'card should remain in pool after failure');
    TestRunner.assertEqual(appState.initiates.length, 0, 'no card should be added to initiates');
  });

  // ── FAILING TEST (expected) — documents known bug #1 ────────────────────────
  // SPEC: The leader can always attempt recruitment, even when there are no
  // operatives and leaderSkillLevel is 0.
  // BUG: Current code blocks the attempt when operatives.length === 0 &&
  //      leaderSkillLevel === 0, preventing the leader from ever getting started.
  TestRunner.test('[spec] leader can attempt recruitment with no operatives', async function () {
    const state = bootTestGame();
    // Explicitly start with no operatives and leaderSkillLevel = 0
    state.operatives       = [];
    state.leaderSkillLevel = 0;
    const target = { suit: 'hearts', rank: '4', value: 4 };
    state.recruitPool = [target];

    // Roll 10 on d10 — should succeed (10 >= 4) if the attempt is allowed
    Dice.setProvider(() => Promise.resolve(10));
    await App.attemptRecruit(0);
    Dice.setProvider(null);

    const appState = App.getState();
    TestRunner.assertEqual(appState.recruitPool.length, 0,
      'card should move out of pool — leader can always recruit');
    TestRunner.assertEqual(appState.initiates.length, 1,
      'card should become an initiate');
  });

  // ── FAILING TEST (expected) — documents known bug #2 ────────────────────────
  // SPEC: The dice roll alone (d10 + optional influence die) is compared to the
  // card value. The recruiting operative's skill level is NOT added to the roll;
  // it only determines whether an attempt is permitted.
  // BUG: Current code adds leaderSkillLevel to the roll total, inflating results.
  TestRunner.test('[spec] recruit success is determined by dice roll alone, not roll + skill', async function () {
    const state = bootTestGame({ leaderSkillLevel: 10 });
    // Card value 8. With correct formula: roll must be >= 8.
    // With buggy formula: roll + leaderSkillLevel (10) >= 8 — always passes.
    const target = { suit: 'spades', rank: '8', value: 8 };
    state.recruitPool = [target];
    state.operatives  = [{ suit: 'clubs', rank: '10', value: 10 }];

    // Roll 5 on d10 — correct: 5 < 8 → FAIL; buggy: 5+10=15 >= 8 → SUCCESS
    Dice.setProvider(() => Promise.resolve(5));
    await App.attemptRecruit(0);
    Dice.setProvider(null);

    const appState = App.getState();
    TestRunner.assertEqual(appState.recruitPool.length, 1,
      'card should stay in pool — roll of 5 is below card value 8');
    TestRunner.assertEqual(appState.initiates.length, 0,
      'no card should be added to initiates on a failed roll');
  });

});
