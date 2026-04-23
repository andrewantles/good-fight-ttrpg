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
      <div id="operations-list"></div>
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

// ─── Suite 4: Operations.canExecute() — Requirements ──────────────────────────

TestRunner.describe('operations.js — canExecute Requirements', function () {

  TestRunner.test('Minor Vandalism: true with 1 operative', function () {
    const state = bootTestGame({ supplies: 0 });
    const ops = [{ suit: 'hearts', rank: '5', value: 5 }];
    TestRunner.assert(Operations.canExecute('minor_vandalism', state, ops));
  });

  TestRunner.test('Minor Vandalism: false with 0 operatives', function () {
    const state = bootTestGame();
    TestRunner.assert(!Operations.canExecute('minor_vandalism', state, []));
  });

  TestRunner.test('Average Vandalism: true with 2 operatives + 3 supplies', function () {
    const state = bootTestGame({ supplies: 3 });
    const ops = [
      { suit: 'hearts', rank: '5', value: 5 },
      { suit: 'clubs',  rank: '6', value: 6 },
    ];
    TestRunner.assert(Operations.canExecute('average_vandalism', state, ops));
  });

  TestRunner.test('Average Vandalism: false with 1 operative', function () {
    const state = bootTestGame({ supplies: 3 });
    const ops = [{ suit: 'hearts', rank: '5', value: 5 }];
    TestRunner.assert(!Operations.canExecute('average_vandalism', state, ops));
  });

  TestRunner.test('Average Vandalism: false with insufficient supplies', function () {
    const state = bootTestGame({ supplies: 2 });
    const ops = [
      { suit: 'hearts', rank: '5', value: 5 },
      { suit: 'clubs',  rank: '6', value: 6 },
    ];
    TestRunner.assert(!Operations.canExecute('average_vandalism', state, ops));
  });

  TestRunner.test('Significant Vandalism: true with 4 operatives + 5 supplies', function () {
    const state = bootTestGame({ supplies: 5 });
    const ops = Array.from({ length: 4 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
    TestRunner.assert(Operations.canExecute('significant_vandalism', state, ops));
  });

  TestRunner.test('Scout: true with 4 operatives + 5 supplies', function () {
    const state = bootTestGame({ supplies: 5 });
    const ops = Array.from({ length: 4 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
    TestRunner.assert(Operations.canExecute('scout', state, ops));
  });

  TestRunner.test('Scout: false with 3 operatives', function () {
    const state = bootTestGame({ supplies: 5 });
    const ops = Array.from({ length: 3 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
    TestRunner.assert(!Operations.canExecute('scout', state, ops));
  });

  TestRunner.test('Mid-Game Op: true with 6 operatives + 10 supplies + 30 influence', function () {
    const state = bootTestGame({ supplies: 10, influence: 30 });
    const ops = Array.from({ length: 6 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
    TestRunner.assert(Operations.canExecute('mid_game_op', state, ops, { influenceThreshold: 30 }));
  });

  TestRunner.test('Mid-Game Op: false with 29 influence', function () {
    const state = bootTestGame({ supplies: 10, influence: 29 });
    const ops = Array.from({ length: 6 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
    TestRunner.assert(!Operations.canExecute('mid_game_op', state, ops, { influenceThreshold: 30 }));
  });

  TestRunner.test('Late-Game Op: true with 12 operatives + 20 supplies + 60 influence', function () {
    const state = bootTestGame({ supplies: 20, influence: 60 });
    const ops = Array.from({ length: 12 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
    TestRunner.assert(Operations.canExecute('late_game_op', state, ops, { influenceThreshold: 60 }));
  });

  TestRunner.test('Late-Game Op: false with 11 operatives', function () {
    const state = bootTestGame({ supplies: 20, influence: 60 });
    const ops = Array.from({ length: 11 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
    TestRunner.assert(!Operations.canExecute('late_game_op', state, ops, { influenceThreshold: 60 }));
  });

});

// ─── Suite 5: Operations — Check Formulas ─────────────────────────────────────

TestRunner.describe('operations.js — Check Formulas', function () {

  TestRunner.test('checkBasic: succeeds when roll <= 100 - heat', function () {
    TestRunner.assert(Operations.checkBasic(80, { heat: 20 }), 'roll 80 at target 80');
    TestRunner.assert(Operations.checkBasic(1,  { heat: 20 }), 'roll 1 at target 80');
    TestRunner.assert(!Operations.checkBasic(81, { heat: 20 }), 'roll 81 exceeds target');
  });

  TestRunner.test('checkBasic: heat 0 means any d100 roll succeeds', function () {
    TestRunner.assert(Operations.checkBasic(100, { heat: 0 }), 'roll 100 at target 100');
  });

  TestRunner.test('checkBasic: heat 100 means no roll can succeed', function () {
    TestRunner.assert(!Operations.checkBasic(1, { heat: 100 }), 'roll 1 fails at target 0');
  });

  TestRunner.test('checkGatherSupplies: target = 100 - heat + floor(influence / 2)', function () {
    // heat=20, influence=40: target = 100 - 20 + 20 = 100
    TestRunner.assert(Operations.checkGatherSupplies(100, { heat: 20, influence: 40 }), 'boundary');
    TestRunner.assert(!Operations.checkGatherSupplies(101, { heat: 20, influence: 40 }), 'over boundary');
    // heat=60, influence=0: target = 40
    TestRunner.assert(Operations.checkGatherSupplies(40,  { heat: 60, influence: 0 }), 'roll 40 at target 40');
    TestRunner.assert(!Operations.checkGatherSupplies(41, { heat: 60, influence: 0 }), 'roll 41 fails');
  });

  TestRunner.test('checkGatherSupplies: influence floors at half (odd values)', function () {
    // heat=0, influence=41: target = 100 + floor(41/2) = 120
    TestRunner.assert(Operations.checkGatherSupplies(120, { heat: 0, influence: 41 }));
    TestRunner.assert(!Operations.checkGatherSupplies(121, { heat: 0, influence: 41 }));
  });

  TestRunner.test('checkWithOperatives: target = 100 - heat + sum of op values', function () {
    const ops = [{ value: 8 }, { value: 12 }]; // sum = 20, heat=50, target=70
    TestRunner.assert(Operations.checkWithOperatives(70, { heat: 50 }, ops), 'roll 70 at target 70');
    TestRunner.assert(!Operations.checkWithOperatives(71, { heat: 50 }, ops), 'roll 71 fails');
  });

  TestRunner.test('checkWithOperatives: high op values can guarantee success', function () {
    const ops = [{ value: 13 }, { value: 13 }, { value: 13 }, { value: 13 }]; // sum=52
    // heat=50, target = 100 - 50 + 52 = 102 (any d100 roll succeeds)
    TestRunner.assert(Operations.checkWithOperatives(100, { heat: 50 }, ops));
  });

});

// ─── Suite 6: Operations — Minor Vandalism Resolution ─────────────────────────

TestRunner.describe('operations.js — Minor Vandalism', function () {

  TestRunner.test('success: +1 influence, +1 heat', async function () {
    const state = bootTestGame({ heat: 20, influence: 0 });
    state.operatives = [{ suit: 'hearts', rank: '5', value: 5 }];
    // d100=10 (success: 10 <= 80), d4=2 (no recruit)
    let i = 0;
    Dice.setProvider(() => Promise.resolve([10, 2][i++]));
    await Operations.resolveMinorVandalism(state, state.operatives);
    Dice.setProvider(null);
    TestRunner.assertEqual(state.influence, 1, '+1 influence');
    TestRunner.assertEqual(state.heat, 21, '+1 heat');
  });

  TestRunner.test('failure: no change to influence or heat', async function () {
    const state = bootTestGame({ heat: 90, influence: 5 });
    state.operatives = [{ suit: 'hearts', rank: '5', value: 5 }];
    // d100=95 (failure: 95 > 10)
    Dice.setProvider(() => Promise.resolve(95));
    await Operations.resolveMinorVandalism(state, state.operatives);
    Dice.setProvider(null);
    TestRunner.assertEqual(state.influence, 5, 'influence unchanged');
    TestRunner.assertEqual(state.heat, 90, 'heat unchanged');
  });

  TestRunner.test('success with d4=1: draws 1 card to recruit pool', async function () {
    const state = bootTestGame({ heat: 0, influence: 0 });
    state.operatives = [{ suit: 'hearts', rank: '5', value: 5 }];
    const poolBefore = state.recruitPool.length;
    // d100=1 (success), d4=1 (recruit triggered)
    let i = 0;
    Dice.setProvider(() => Promise.resolve([1, 1][i++]));
    await Operations.resolveMinorVandalism(state, state.operatives);
    Dice.setProvider(null);
    TestRunner.assertEqual(state.recruitPool.length, poolBefore + 1, 'recruit pool +1');
  });

  TestRunner.test('success with d4>1: no recruit pool change', async function () {
    const state = bootTestGame({ heat: 0, influence: 0 });
    state.operatives = [{ suit: 'hearts', rank: '5', value: 5 }];
    const poolBefore = state.recruitPool.length;
    // d100=1 (success), d4=3 (no recruit)
    let i = 0;
    Dice.setProvider(() => Promise.resolve([1, 3][i++]));
    await Operations.resolveMinorVandalism(state, state.operatives);
    Dice.setProvider(null);
    TestRunner.assertEqual(state.recruitPool.length, poolBefore, 'recruit pool unchanged');
  });

});

// ─── Suite 7: Operations — Average Vandalism Resolution ───────────────────────

TestRunner.describe('operations.js — Average Vandalism', function () {

  TestRunner.test('success: consumes 3 supplies, +3 influence, +3 heat, +1 recruit pool', async function () {
    const state = bootTestGame({ heat: 20, influence: 0, supplies: 5 });
    const ops = [
      { suit: 'hearts', rank: '5', value: 5 },
      { suit: 'clubs',  rank: '6', value: 6 },
    ];
    state.operatives = [...ops];
    const deckBefore = state.recruitDeck.length;
    // d100=10 (success: 10 <= 80)
    Dice.setProvider(() => Promise.resolve(10));
    await Operations.resolveAverageVandalism(state, ops);
    Dice.setProvider(null);
    TestRunner.assertEqual(state.supplies, 2, 'supplies -3');
    TestRunner.assertEqual(state.influence, 3, '+3 influence');
    TestRunner.assertEqual(state.heat, 23, '+3 heat');
    TestRunner.assertEqual(state.recruitPool.length, 1, '+1 recruit pool');
    TestRunner.assertEqual(state.recruitDeck.length, deckBefore - 1, 'deck -1');
  });

  TestRunner.test('failure: consumes 3 supplies, 1 operative detained for 1 turn', async function () {
    const state = bootTestGame({ heat: 90, influence: 0, supplies: 5 });
    const ops = [
      { suit: 'hearts', rank: '5', value: 5 },
      { suit: 'clubs',  rank: '6', value: 6 },
    ];
    state.operatives = [...ops];
    // d100=99 (failure: 99 > 10)
    Dice.setProvider(() => Promise.resolve(99));
    await Operations.resolveAverageVandalism(state, ops);
    Dice.setProvider(null);
    TestRunner.assertEqual(state.supplies, 2, 'supplies still consumed on failure');
    TestRunner.assertEqual(state.detainedOperatives.length, 1, '1 operative detained');
    TestRunner.assertEqual(state.detainedOperatives[0].turnsRemaining, 1, 'detained for 1 turn');
  });

});

// ─── Suite 8: Operations — Significant Vandalism Resolution ───────────────────

TestRunner.describe('operations.js — Significant Vandalism', function () {

  TestRunner.test('success: consumes 5 supplies, +10 influence, +10 heat, +2 recruit pool', async function () {
    const state = bootTestGame({ heat: 10, influence: 0, supplies: 10 });
    const ops = Array.from({ length: 4 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
    state.operatives = [...ops];
    const deckBefore = state.recruitDeck.length;
    // d100=5 (success: 5 <= 90)
    Dice.setProvider(() => Promise.resolve(5));
    await Operations.resolveSignificantVandalism(state, ops);
    Dice.setProvider(null);
    TestRunner.assertEqual(state.supplies, 5, 'supplies -5');
    TestRunner.assertEqual(state.influence, 10, '+10 influence');
    TestRunner.assertEqual(state.heat, 20, '+10 heat');
    TestRunner.assertEqual(state.recruitPool.length, 2, '+2 recruit pool');
    TestRunner.assertEqual(state.recruitDeck.length, deckBefore - 2, 'deck -2');
  });

  TestRunner.test('failure + player chooses detain: 2 operatives detained for 2 turns', async function () {
    const state = bootTestGame({ heat: 90, influence: 0, supplies: 10 });
    const ops = Array.from({ length: 4 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
    state.operatives = [...ops];
    // d100=99 (failure: 99 > 10)
    Dice.setProvider(() => Promise.resolve(99));
    await Operations.resolveSignificantVandalism(state, ops, { secondPenaltyChoice: 'detain' });
    Dice.setProvider(null);
    TestRunner.assertEqual(state.supplies, 5, 'supplies: only -5 operation cost');
    TestRunner.assertEqual(state.detainedOperatives.length, 2, '2 operatives detained');
    TestRunner.assert(
      state.detainedOperatives.every(d => d.turnsRemaining === 2),
      'both detained for 2 turns'
    );
  });

  TestRunner.test('failure + player chooses supplies: 1 detained, -2 supplies as 2nd penalty', async function () {
    const state = bootTestGame({ heat: 90, influence: 0, supplies: 10 });
    const ops = Array.from({ length: 4 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
    state.operatives = [...ops];
    // d100=99 (failure)
    Dice.setProvider(() => Promise.resolve(99));
    await Operations.resolveSignificantVandalism(state, ops, { secondPenaltyChoice: 'supplies' });
    Dice.setProvider(null);
    TestRunner.assertEqual(state.detainedOperatives.length, 1, 'only 1 operative detained');
    // supplies: -5 (operation cost) -2 (chosen penalty) = 3
    TestRunner.assertEqual(state.supplies, 3, 'supplies: -5 cost + -2 second penalty');
  });

});

// ─── Suite 9: Operations — Gather Supplies Resolution ─────────────────────────

TestRunner.describe('operations.js — Gather Supplies', function () {

  TestRunner.test('3 successful rolls: +3 supplies', async function () {
    const state = bootTestGame({ heat: 0, influence: 0, supplies: 0 });
    state.operatives = [{ suit: 'hearts', rank: '5', value: 5 }];
    // All rolls = 10, target = 100 - 0 + 0 = 100 → always succeed
    Dice.setProvider(() => Promise.resolve(10));
    await Operations.resolveGatherSupplies(state, state.operatives);
    Dice.setProvider(null);
    TestRunner.assertEqual(state.supplies, 3, '+3 supplies from 3 successes');
  });

  TestRunner.test('all 3 rolls fail: no supplies gained', async function () {
    const state = bootTestGame({ heat: 99, influence: 0, supplies: 2 });
    state.operatives = [{ suit: 'hearts', rank: '5', value: 5 }];
    // target = 100 - 99 + 0 = 1. Roll 50 always fails.
    Dice.setProvider(() => Promise.resolve(50));
    await Operations.resolveGatherSupplies(state, state.operatives);
    Dice.setProvider(null);
    TestRunner.assertEqual(state.supplies, 2, 'supplies unchanged');
  });

  TestRunner.test('mixed rolls: +1 supply per success only', async function () {
    const state = bootTestGame({ heat: 60, influence: 0, supplies: 2 });
    state.operatives = [{ suit: 'hearts', rank: '5', value: 5 }];
    // target = 100 - 60 + 0 = 40. Rolls: 30 (pass), 50 (fail), 20 (pass)
    let i = 0;
    Dice.setProvider(() => Promise.resolve([30, 50, 20][i++]));
    await Operations.resolveGatherSupplies(state, state.operatives);
    Dice.setProvider(null);
    TestRunner.assertEqual(state.supplies, 4, '+2 supplies (2 successes)');
  });

  TestRunner.test('influence bonus raises target threshold', async function () {
    const state = bootTestGame({ heat: 60, influence: 40, supplies: 0 });
    state.operatives = [{ suit: 'hearts', rank: '5', value: 5 }];
    // target = 100 - 60 + 20 = 60. Roll 55 succeeds (would fail at target 40 without influence).
    Dice.setProvider(() => Promise.resolve(55));
    await Operations.resolveGatherSupplies(state, state.operatives);
    Dice.setProvider(null);
    TestRunner.assertEqual(state.supplies, 3, '+3 supplies (all 3 succeed with influence bonus)');
  });

});

// ─── Suite 10: Operations — Scout ─────────────────────────────────────────────

TestRunner.describe('operations.js — Scout', function () {

  TestRunner.test('startScout: creates multiTurnOp with 2 turns remaining and consumes 5 supplies', function () {
    const state = bootTestGame({ supplies: 10 });
    const ops = Array.from({ length: 4 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
    state.operatives = [...ops];
    Operations.startScout(state, ops);
    TestRunner.assertEqual(state.multiTurnOps.length, 1, '1 multi-turn op created');
    TestRunner.assertEqual(state.multiTurnOps[0].turnsRemaining, 2, '2 turns remaining');
    TestRunner.assertEqual(state.multiTurnOps[0].assignedOperatives.length, 4, '4 ops assigned');
    TestRunner.assertEqual(state.supplies, 5, '5 supplies consumed');
  });

  TestRunner.test('resolveScout success: adds mid-game opportunity to state', async function () {
    const state = bootTestGame({ heat: 10, supplies: 10 });
    const ops = Array.from({ length: 4 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
    state.operatives = [...ops];
    // opSum = 2+3+4+5=14, target = 100-10+14 = 104 (always succeeds)
    // d100=5 (success), d6=3 (mid-game table roll)
    let i = 0;
    Dice.setProvider(() => Promise.resolve([5, 3][i++]));
    await Operations.resolveScout(state, ops);
    Dice.setProvider(null);
    TestRunner.assertEqual(state.availableMidGameOps.length, 1, '1 mid-game op unlocked');
    TestRunner.assertEqual(state.availableMidGameOps[0].tableRoll, 3, 'correct table roll stored');
  });

  TestRunner.test('resolveScout failure + player chooses detain: 2 operatives detained for 1 turn', async function () {
    const state = bootTestGame({ heat: 99, supplies: 10 });
    const ops = Array.from({ length: 4 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
    state.operatives = [...ops];
    // opSum=14, target = 100-99+14 = 15. Roll 90 fails.
    Dice.setProvider(() => Promise.resolve(90));
    await Operations.resolveScout(state, ops, { secondPenaltyChoice: 'detain' });
    Dice.setProvider(null);
    TestRunner.assertEqual(state.detainedOperatives.length, 2, '2 operatives detained');
    TestRunner.assert(
      state.detainedOperatives.every(d => d.turnsRemaining === 1),
      'both detained for 1 turn'
    );
    TestRunner.assertEqual(state.supplies, 10, 'supplies unchanged');
  });

  TestRunner.test('resolveScout failure + player chooses supplies: 1 detained, -2 supplies', async function () {
    const state = bootTestGame({ heat: 99, supplies: 10 });
    const ops = Array.from({ length: 4 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
    state.operatives = [...ops];
    // opSum=14, target = 15. Roll 90 fails.
    Dice.setProvider(() => Promise.resolve(90));
    await Operations.resolveScout(state, ops, { secondPenaltyChoice: 'supplies' });
    Dice.setProvider(null);
    TestRunner.assertEqual(state.detainedOperatives.length, 1, 'only 1 operative detained');
    TestRunner.assertEqual(state.supplies, 8, '-2 supplies as 2nd penalty');
  });

});
