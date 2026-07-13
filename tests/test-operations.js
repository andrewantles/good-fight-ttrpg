/**
 * Tests for operations.js (Phase 3+) and Phase 2 recruitment logic in app.js.
 *
 * Phase 2 scope (this file):
 *   - Influence die tier helper (getInfluenceDie)
 *   - Leader skill level updates (updateLeaderSkill)
 *   - Recruitment pipeline: attemptRecruit
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

  TestRunner.test('updateLeaderSkill stays at 0 with no operatives and no prior high-water mark', function () {
    const state = bootTestGame();
    state.operatives = [];
    App.updateLeaderSkill();
    TestRunner.assertEqual(App.getState().leaderSkillLevel, 0);
  });

  TestRunner.test('updateLeaderSkill retains prior high-water mark when operatives drop to zero', function () {
    const state = bootTestGame();
    state.operatives = [{ suit: 'spades', rank: 'K', value: 13 }];
    App.updateLeaderSkill();
    TestRunner.assertEqual(App.getState().leaderSkillLevel, 13);

    // All operatives lost/detained/captured
    state.operatives = [];
    App.updateLeaderSkill();
    TestRunner.assertEqual(App.getState().leaderSkillLevel, 13, 'ratchet: must not reset to 0');
  });

  TestRunner.test('updateLeaderSkill leaves leaderSkillLevel unchanged after losing the highest-value operative', function () {
    const state = bootTestGame();
    state.operatives = [
      { suit: 'hearts', rank: 'A', value: 15 },
      { suit: 'clubs',  rank: '9', value: 9  },
    ];
    App.updateLeaderSkill();
    TestRunner.assertEqual(App.getState().leaderSkillLevel, 15);

    // Remove the highest-value operative (e.g. lost, detained, or captured)
    state.operatives.splice(0, 1);
    App.updateLeaderSkill();
    TestRunner.assertEqual(App.getState().leaderSkillLevel, 15, 'ratchet: level must not drop');
  });

});

// ─── Suite 3: Recruitment Pipeline ────────────────────────────────────────────

TestRunner.describe('app.js — Recruitment Pipeline', function () {

  // ── Helper: pick a base die from the recruitDieChoice modal ────────────────
  function chooseBaseDie(die) {
    const overlay = document.querySelector('.modal-overlay');
    overlay.querySelector(`button[data-choice="${die}"]`).click();
  }

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
    const promise = App.attemptRecruit(0);
    chooseBaseDie('d10');
    await promise;
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
    const promise = App.attemptRecruit(0);
    chooseBaseDie('d10');
    await promise;
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
    const promise = App.attemptRecruit(0);
    chooseBaseDie('d10');
    await promise;
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
    const promise = App.attemptRecruit(0);
    chooseBaseDie('d10');
    await promise;
    Dice.setProvider(null);

    const appState = App.getState();
    TestRunner.assertEqual(appState.recruitPool.length, 1,
      'card should stay in pool — roll of 5 is below card value 8');
    TestRunner.assertEqual(appState.initiates.length, 0,
      'no card should be added to initiates on a failed roll');
  });

  // ── Base die: d10 vs d12 (Supply-spend) ─────────────────────────────────────

  TestRunner.test('choosing d12 spends 1 Supply and rolls a d12', async function () {
    const state = bootTestGame({ supplies: 5 });
    const target = { suit: 'clubs', rank: '3', value: 3 };
    state.recruitPool = [target];

    let rolledDie = null;
    Dice.setProvider((dieType) => {
      rolledDie = dieType;
      return Promise.resolve(7);
    });
    const promise = App.attemptRecruit(0);
    chooseBaseDie('d12');
    await promise;
    Dice.setProvider(null);

    TestRunner.assertEqual(rolledDie, 'd12', 'base die should be d12');
    TestRunner.assertEqual(App.getState().supplies, 4, 'spending d12 costs 1 Supply');
  });

  TestRunner.test('choosing d10 does not spend a Supply', async function () {
    const state = bootTestGame({ supplies: 5 });
    const target = { suit: 'clubs', rank: '3', value: 3 };
    state.recruitPool = [target];

    Dice.setProvider(() => Promise.resolve(7));
    const promise = App.attemptRecruit(0);
    chooseBaseDie('d10');
    await promise;
    Dice.setProvider(null);

    TestRunner.assertEqual(App.getState().supplies, 5, 'choosing d10 spends no Supply');
  });

  TestRunner.test('d12 choice is disabled when the player has no Supplies', async function () {
    const state = bootTestGame({ supplies: 0 });
    const target = { suit: 'clubs', rank: '3', value: 3 };
    state.recruitPool = [target];

    Dice.setProvider(() => Promise.resolve(7));
    const promise = App.attemptRecruit(0);
    const overlay = document.querySelector('.modal-overlay');
    const d12Button = overlay.querySelector('button[data-choice="d12"]');
    TestRunner.assert(d12Button.disabled, 'd12 option should be disabled with 0 Supplies');
    chooseBaseDie('d10');
    await promise;
    Dice.setProvider(null);
  });

  // ── Eligibility (issue #12, bullet 4) ───────────────────────────────────────
  // SPEC: The Leader can always attempt Recruitment (CONTEXT.md), regardless of
  // leaderSkillLevel or the value of any current Operatives. This flow has no
  // per-Operative attempter selection, so a low-value roster never blocks the
  // attempt — only the dice roll vs. the card's value determines success.
  TestRunner.test('[spec] recruit attempt is never blocked by low-value Operatives or Leader skill', async function () {
    const state = bootTestGame({ leaderSkillLevel: 0 });
    const target = { suit: 'hearts', rank: '10', value: 10 };
    state.recruitPool = [target];
    state.operatives  = [{ suit: 'clubs', rank: '2', value: 2 }];

    Dice.setProvider(() => Promise.resolve(10));
    const promise = App.attemptRecruit(0);
    chooseBaseDie('d10');
    await promise;
    Dice.setProvider(null);

    const appState = App.getState();
    TestRunner.assertEqual(appState.recruitPool.length, 0,
      'attempt should proceed and succeed despite leaderSkillLevel=0 and a low-value Operative');
    TestRunner.assertEqual(appState.initiates.length, 1);
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
    TestRunner.assertEqual(state.operatives.length, 1, 'detained operative removed from operatives');
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
    TestRunner.assertEqual(state.operatives.length, 2, '2 detained operatives removed from operatives');
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
    TestRunner.assertEqual(state.operatives.length, 3, '1 detained operative removed from operatives');
    // supplies: -5 (operation cost) -2 (chosen penalty) = 3
    TestRunner.assertEqual(state.supplies, 3, 'supplies: -5 cost + -2 second penalty');
  });

  TestRunner.test('getSecondPenaltyChoice callback: invoked on failure, its resolved choice is applied', async function () {
    const state = bootTestGame({ heat: 90, influence: 0, supplies: 10 });
    const ops = Array.from({ length: 4 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
    state.operatives = [...ops];
    let callbackInvoked = false;
    const getSecondPenaltyChoice = async () => {
      callbackInvoked = true;
      return 'supplies';
    };
    // d100=99 (failure)
    Dice.setProvider(() => Promise.resolve(99));
    await Operations.resolveSignificantVandalism(state, ops, { getSecondPenaltyChoice });
    Dice.setProvider(null);
    TestRunner.assert(callbackInvoked, 'callback was invoked on failure');
    TestRunner.assertEqual(state.detainedOperatives.length, 1, 'only 1 operative detained (bullet 1)');
    TestRunner.assertEqual(state.supplies, 3, 'supplies penalty from callback-resolved choice applied');
  });

  TestRunner.test('getSecondPenaltyChoice callback: NOT invoked on success', async function () {
    const state = bootTestGame({ heat: 10, influence: 0, supplies: 10 });
    const ops = Array.from({ length: 4 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
    state.operatives = [...ops];
    let callbackInvoked = false;
    const getSecondPenaltyChoice = async () => {
      callbackInvoked = true;
      return 'supplies';
    };
    // d100=5 (success: 5 <= 90)
    Dice.setProvider(() => Promise.resolve(5));
    await Operations.resolveSignificantVandalism(state, ops, { getSecondPenaltyChoice });
    Dice.setProvider(null);
    TestRunner.assert(!callbackInvoked, 'callback was NOT invoked when the operation succeeds');
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

// ─── Suite: Operations — Mid-Game Operation execution ─────────────────────────

TestRunner.describe('operations.js — Mid-Game Operation execution', function () {

  function sixOps() {
    return Array.from({ length: 6 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
  }

  TestRunner.test('canExecuteMidGameOp: requires 6 operatives, 10 supplies, and difficulty threshold', function () {
    const state = bootTestGame({ difficulty: 'medium', influence: 45, supplies: 10 });
    state.operatives = sixOps();
    TestRunner.assert(Operations.canExecuteMidGameOp(state, state.operatives), 'meets all reqs at medium (45)');
  });

  TestRunner.test('canExecuteMidGameOp: blocked below the difficulty-appropriate Influence threshold', function () {
    const state = bootTestGame({ difficulty: 'medium', influence: 44, supplies: 10 });
    state.operatives = sixOps();
    TestRunner.assert(!Operations.canExecuteMidGameOp(state, state.operatives), '44 < 45 threshold at medium');
  });

  TestRunner.test('canExecuteMidGameOp: threshold scales with difficulty (easy 30 / hard 60)', function () {
    const easy = bootTestGame({ difficulty: 'easy', influence: 30, supplies: 10 });
    easy.operatives = sixOps();
    TestRunner.assert(Operations.canExecuteMidGameOp(easy, easy.operatives), 'easy passes at 30');

    const hard = bootTestGame({ difficulty: 'hard', influence: 30, supplies: 10 });
    hard.operatives = sixOps();
    TestRunner.assert(!Operations.canExecuteMidGameOp(hard, hard.operatives), 'hard blocked at 30 (needs 60)');
  });

  TestRunner.test('canExecuteMidGameOp: blocked with too few operatives or supplies', function () {
    const fewOps = bootTestGame({ difficulty: 'medium', influence: 45, supplies: 10 });
    fewOps.operatives = sixOps().slice(0, 5);
    TestRunner.assert(!Operations.canExecuteMidGameOp(fewOps, fewOps.operatives), '5 operatives is not enough');

    const lowSupplies = bootTestGame({ difficulty: 'medium', influence: 45, supplies: 9 });
    lowSupplies.operatives = sixOps();
    TestRunner.assert(!Operations.canExecuteMidGameOp(lowSupplies, lowSupplies.operatives), '9 supplies is not enough');
  });

});

// ─── Suite: Operations — Mid-Game Operation resolution ────────────────────────

TestRunner.describe('operations.js — Mid-Game Operation resolution', function () {

  function sixOps() {
    // values 2..7, sum = 27
    return Array.from({ length: 6 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
  }

  // Force success: opSum=27, heat=10 -> target=117, any roll succeeds.
  function bootSuccess(type, overrides) {
    const state = bootTestGame(Object.assign({ heat: 10, influence: 0, supplies: 50 }, overrides));
    state.operatives = sixOps();
    const op = { tableRoll: 0, type };
    state.availableMidGameOps = [op];
    return { state, op };
  }

  TestRunner.test('resolveMidGameOp: consumes 10 Supplies on execution', async function () {
    const { state, op } = bootSuccess('embed_mole', { supplies: 50 });
    Dice.setProvider(() => Promise.resolve(5));
    await Operations.resolveMidGameOp(state, op, state.operatives);
    Dice.setProvider(null);
    // embed_mole has no supplies effect, so only the -10 execution cost applies.
    TestRunner.assertEqual(state.supplies, 40, '10 supplies consumed');
  });

  TestRunner.test('resolveMidGameOp: success removes the fulfilled opportunity', async function () {
    const { state, op } = bootSuccess('embed_mole');
    Dice.setProvider(() => Promise.resolve(5));
    const res = await Operations.resolveMidGameOp(state, op, state.operatives);
    Dice.setProvider(null);
    TestRunner.assert(res.success, 'succeeds');
    TestRunner.assertEqual(state.availableMidGameOps.length, 0, 'opportunity consumed on success');
  });

  TestRunner.test('embed_mole success: -35 Heat', async function () {
    const { state, op } = bootSuccess('embed_mole', { heat: 40 });
    Dice.setProvider(() => Promise.resolve(5));
    await Operations.resolveMidGameOp(state, op, state.operatives);
    Dice.setProvider(null);
    TestRunner.assertEqual(state.heat, 5, '40 - 35 = 5');
  });

  TestRunner.test('hack_comm_tower success: +25 Influence, -15 Heat', async function () {
    const { state, op } = bootSuccess('hack_comm_tower', { heat: 40, influence: 10 });
    Dice.setProvider(() => Promise.resolve(5));
    await Operations.resolveMidGameOp(state, op, state.operatives);
    Dice.setProvider(null);
    TestRunner.assertEqual(state.influence, 35, '10 + 25 influence');
    TestRunner.assertEqual(state.heat, 25, '40 - 15 heat');
  });

  TestRunner.test('industry_strike success: -35 Heat', async function () {
    const { state, op } = bootSuccess('industry_strike', { heat: 50 });
    Dice.setProvider(() => Promise.resolve(5));
    await Operations.resolveMidGameOp(state, op, state.operatives);
    Dice.setProvider(null);
    TestRunner.assertEqual(state.heat, 15, '50 - 35 heat');
  });

  TestRunner.test('break_out success: +2 Operatives drawn directly to Operatives, +10 Heat', async function () {
    const { state, op } = bootSuccess('break_out', { heat: 10 });
    const before = state.operatives.length;
    Deck.setProvider((count) => Promise.resolve(
      Array.from({ length: count }, (_, i) => ({ suit: 'clubs', rank: 'K', value: 13, tag: i }))
    ));
    Dice.setProvider(() => Promise.resolve(5));
    await Operations.resolveMidGameOp(state, op, state.operatives);
    Dice.setProvider(null);
    Deck.setProvider(null);
    TestRunner.assertEqual(state.operatives.length, before + 2, '2 operatives added directly');
    TestRunner.assertEqual(state.recruitPool.length, 0, 'bypasses recruit pool');
    TestRunner.assertEqual(state.initiates.length, 0, 'bypasses initiates');
    TestRunner.assertEqual(state.heat, 20, '10 + 10 heat');
  });

  TestRunner.test('intercept_supply success: +15 Supplies, +10 Heat', async function () {
    const { state, op } = bootSuccess('intercept_supply', { heat: 10, supplies: 50 });
    Dice.setProvider(() => Promise.resolve(5));
    await Operations.resolveMidGameOp(state, op, state.operatives);
    Dice.setProvider(null);
    // 50 - 10 (cost) + 15 (effect) = 55
    TestRunner.assertEqual(state.supplies, 55, '-10 cost then +15 effect');
    TestRunner.assertEqual(state.heat, 20, '10 + 10 heat');
  });

  TestRunner.test('clandestine_goods success: +50 Influence', async function () {
    const { state, op } = bootSuccess('clandestine_goods', { influence: 10 });
    Dice.setProvider(() => Promise.resolve(5));
    await Operations.resolveMidGameOp(state, op, state.operatives);
    Dice.setProvider(null);
    TestRunner.assertEqual(state.influence, 60, '10 + 50 influence');
  });

  TestRunner.test('failure: captures 1 assigned operative, card recycled to Recruitment Deck (not detained)', async function () {
    // opSum=27, heat=99 -> target = 100 - 99 + 27 = 28. Roll 90 fails.
    const state = bootTestGame({ heat: 99, influence: 0, supplies: 50 });
    state.operatives = sixOps();
    const deckBefore = state.recruitDeck.length;
    const op = { tableRoll: 0, type: 'clandestine_goods' };
    state.availableMidGameOps = [op];

    Dice.setProvider(() => Promise.resolve(90));
    const res = await Operations.resolveMidGameOp(state, op, state.operatives);
    Dice.setProvider(null);

    TestRunner.assert(!res.success, 'operation failed');
    TestRunner.assertEqual(state.operatives.length, 5, '1 operative removed from Op Team');
    TestRunner.assertEqual(state.detainedOperatives.length, 0, 'NOT detained — this is capture');
    TestRunner.assertEqual(state.recruitDeck.length, deckBefore + 1, 'captured card recycled into Recruitment Deck');
    TestRunner.assertEqual(state.influence, 0, 'no success effect applied on failure');
  });

  TestRunner.test('failure: opportunity remains available (not consumed)', async function () {
    const state = bootTestGame({ heat: 99, influence: 0, supplies: 50 });
    state.operatives = sixOps();
    const op = { tableRoll: 0, type: 'clandestine_goods' };
    state.availableMidGameOps = [op];

    Dice.setProvider(() => Promise.resolve(90));
    await Operations.resolveMidGameOp(state, op, state.operatives);
    Dice.setProvider(null);

    TestRunner.assertEqual(state.availableMidGameOps.length, 1, 'opportunity left available after failure');
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
    TestRunner.assertEqual(state.operatives.length, 0, '4 assigned operatives removed from operatives');
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

  TestRunner.test('resolveScout success: tags the opportunity with a d6-rolled type name', async function () {
    const state = bootTestGame({ heat: 10, supplies: 10 });
    const ops = Array.from({ length: 4 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
    state.operatives = [...ops];
    // opSum=14, target=104 (always succeeds). d100=5, d6=4 -> Break Out Operatives.
    let i = 0;
    Dice.setProvider(() => Promise.resolve([5, 4][i++]));
    await Operations.resolveScout(state, ops);
    Dice.setProvider(null);
    TestRunner.assertEqual(state.availableMidGameOps[0].tableRoll, 4, 'table roll stored');
    TestRunner.assertEqual(state.availableMidGameOps[0].type, 'break_out', 'd6=4 tags break_out type');
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
    TestRunner.assertEqual(state.operatives.length, 2, '2 detained operatives removed from operatives');
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
    TestRunner.assertEqual(state.operatives.length, 3, '1 detained operative removed from operatives');
    TestRunner.assertEqual(state.supplies, 8, '-2 supplies as 2nd penalty');
  });

  TestRunner.test('resolveScout success after startScout: assigned operatives return to state.operatives', async function () {
    const state = bootTestGame({ heat: 10, supplies: 10 });
    const ops = Array.from({ length: 4 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
    state.operatives = [...ops];
    Operations.startScout(state, ops);
    TestRunner.assertEqual(state.operatives.length, 0, 'operatives tapped for the op');

    const assigned = state.multiTurnOps[0].assignedOperatives;
    // opSum = 2+3+4+5=14, target = 100-10+14 = 104 (always succeeds)
    let i = 0;
    Dice.setProvider(() => Promise.resolve([5, 3][i++]));
    await Operations.resolveScout(state, assigned);
    Dice.setProvider(null);

    TestRunner.assertEqual(state.operatives.length, 4, 'all 4 assigned operatives return on success');
  });

  TestRunner.test('resolveScout failure after startScout: non-detained assigned operatives return to state.operatives', async function () {
    const state = bootTestGame({ heat: 99, supplies: 10 });
    const ops = Array.from({ length: 4 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
    state.operatives = [...ops];
    Operations.startScout(state, ops);

    const assigned = state.multiTurnOps[0].assignedOperatives;
    // opSum=14, target = 100-99+14 = 15. Roll 90 fails.
    Dice.setProvider(() => Promise.resolve(90));
    await Operations.resolveScout(state, assigned, { secondPenaltyChoice: 'supplies' });
    Dice.setProvider(null);

    TestRunner.assertEqual(state.detainedOperatives.length, 1, 'only 1 operative detained');
    TestRunner.assertEqual(state.operatives.length, 3, '3 non-detained assigned operatives return to the pool');
  });

});

// ─── Suite 11: Operations — Late-Game Scout ───────────────────────────────────

TestRunner.describe('operations.js — Late-Game Scout', function () {

  TestRunner.test('startLateGameScout: creates a 3-turn multiTurnOp, consumes 8 supplies, taps 6 operatives', function () {
    const state = bootTestGame({ supplies: 12 });
    const ops = Array.from({ length: 6 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
    state.operatives = [...ops];
    Operations.startLateGameScout(state, ops);
    TestRunner.assertEqual(state.multiTurnOps.length, 1, '1 multi-turn op created');
    TestRunner.assertEqual(state.multiTurnOps[0].operation, 'late_game_scout', 'tagged late_game_scout');
    TestRunner.assertEqual(state.multiTurnOps[0].turnsRemaining, 3, '3 turns remaining');
    TestRunner.assertEqual(state.multiTurnOps[0].assignedOperatives.length, 6, '6 ops assigned');
    TestRunner.assertEqual(state.supplies, 4, '8 supplies consumed');
    TestRunner.assertEqual(state.operatives.length, 0, '6 assigned operatives removed from operatives');
  });

  TestRunner.test('resolveLateGameScout success: adds a d6-typed late-game opportunity', async function () {
    const state = bootTestGame({ heat: 10, supplies: 12 });
    const ops = Array.from({ length: 6 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
    state.operatives = [...ops];
    // opSum = 2+3+4+5+6+7 = 27, target = 100-10+27 = 117 (always succeeds).
    // d100=5 (success), d6=4 -> Liberate Prison Facilities.
    const dieTypesRolled = [];
    let i = 0;
    Dice.setProvider((dieType) => {
      dieTypesRolled.push(dieType);
      return Promise.resolve([5, 4][i++]);
    });
    await Operations.resolveLateGameScout(state, ops);
    Dice.setProvider(null);
    TestRunner.assertEqual(state.availableLateGameOps.length, 1, '1 late-game op unlocked');
    TestRunner.assertEqual(state.availableLateGameOps[0].tableRoll, 4, 'table roll stored');
    TestRunner.assertEqual(state.availableLateGameOps[0].type, 'liberate_prison', 'd6=4 tags liberate_prison type');
    TestRunner.assertEqual(dieTypesRolled[1], 'd6',
      'the table roll uses a d6 (rulebook prints "d8" for this table, but only defines 6 rows — a misprint)');
  });

  TestRunner.test('resolveLateGameScout success: re-rolls a d6 type already held/completed', async function () {
    const state = bootTestGame({ heat: 10, supplies: 12 });
    const ops = Array.from({ length: 6 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
    state.operatives = [...ops];
    // liberate_prison already available (d6=4) and neutralize_leadership already
    // completed (d6=1). opSum=27, target=117 (always succeeds).
    state.availableLateGameOps = [{ tableRoll: 4, type: 'liberate_prison' }];
    state.completedLateGameOps = [{ type: 'neutralize_leadership' }];
    // d100=5 (success), d6=4 (held -> reroll), d6=1 (completed -> reroll), d6=2 (news_agency).
    let i = 0;
    Dice.setProvider(() => Promise.resolve([5, 4, 1, 2][i++]));
    await Operations.resolveLateGameScout(state, ops);
    Dice.setProvider(null);
    TestRunner.assertEqual(state.availableLateGameOps.length, 2, 'a distinct opportunity added');
    TestRunner.assertEqual(state.availableLateGameOps[1].type, 'news_agency', 'rerolled to news_agency');
  });

  TestRunner.test('resolveLateGameScout failure + player chooses detain: 3 operatives detained for 2 turns', async function () {
    const state = bootTestGame({ heat: 99, supplies: 12 });
    const ops = Array.from({ length: 6 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
    state.operatives = [...ops];
    // opSum=27, target = 100-99+27 = 28. Roll 90 fails.
    Dice.setProvider(() => Promise.resolve(90));
    await Operations.resolveLateGameScout(state, ops, { secondPenaltyChoice: 'detain' });
    Dice.setProvider(null);
    TestRunner.assertEqual(state.detainedOperatives.length, 3, '2 unconditional + 1 chosen = 3 detained');
    TestRunner.assert(
      state.detainedOperatives.every(d => d.turnsRemaining === 2),
      'all detained for 2 turns'
    );
    TestRunner.assertEqual(state.operatives.length, 3, '3 detained operatives removed; 3 survivors returned');
    TestRunner.assertEqual(state.supplies, 12, 'supplies unchanged');
  });

  TestRunner.test('resolveLateGameScout failure + player chooses supplies: 2 detained, -4 supplies', async function () {
    const state = bootTestGame({ heat: 99, supplies: 12 });
    const ops = Array.from({ length: 6 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
    state.operatives = [...ops];
    // opSum=27, target = 28. Roll 90 fails.
    Dice.setProvider(() => Promise.resolve(90));
    await Operations.resolveLateGameScout(state, ops, { secondPenaltyChoice: 'supplies' });
    Dice.setProvider(null);
    TestRunner.assertEqual(state.detainedOperatives.length, 2, 'only the 2 unconditional detained');
    TestRunner.assertEqual(state.operatives.length, 4, '2 detained removed; 4 survivors returned');
    TestRunner.assertEqual(state.supplies, 8, '-4 supplies as 2nd penalty');
  });

  TestRunner.test('resolveLateGameScout success after startLateGameScout: assigned operatives return to pool', async function () {
    const state = bootTestGame({ heat: 10, supplies: 12 });
    const ops = Array.from({ length: 6 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
    state.operatives = [...ops];
    Operations.startLateGameScout(state, ops);
    TestRunner.assertEqual(state.operatives.length, 0, 'operatives tapped for the op');

    const assigned = state.multiTurnOps[0].assignedOperatives;
    // opSum=27, target=117 (always succeeds). d100=5, d6=3.
    let i = 0;
    Dice.setProvider(() => Promise.resolve([5, 3][i++]));
    await Operations.resolveLateGameScout(state, assigned);
    Dice.setProvider(null);
    TestRunner.assertEqual(state.operatives.length, 6, 'all 6 assigned operatives return on success');
  });

});

// ─── Suite: Operations — Late-Game Operation execution ────────────────────────

TestRunner.describe('operations.js — Late-Game Operation execution', function () {

  function twelveOps() {
    // values 2..13, sum = 90
    return Array.from({ length: 12 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
  }

  // Force success: opSum=90, heat=10 -> target=180, any roll succeeds.
  function bootSuccess(type, overrides) {
    const state = bootTestGame(Object.assign({ heat: 10, influence: 200, supplies: 50 }, overrides));
    state.operatives = twelveOps();
    const op = { tableRoll: 0, type };
    state.availableLateGameOps = [op];
    return { state, op };
  }

  // ── canExecute / thresholds ──

  TestRunner.test('canExecuteLateGameOp: requires 12 operatives, 20 supplies, and difficulty threshold', function () {
    const state = bootTestGame({ influence: 90, supplies: 20, difficulty: 'medium' });
    state.operatives = twelveOps();
    TestRunner.assert(Operations.canExecuteLateGameOp(state, state.operatives), 'meets all reqs at medium (90)');
  });

  TestRunner.test('canExecuteLateGameOp: blocked below the difficulty-appropriate Influence threshold', function () {
    const state = bootTestGame({ influence: 89, supplies: 20, difficulty: 'medium' });
    state.operatives = twelveOps();
    TestRunner.assert(!Operations.canExecuteLateGameOp(state, state.operatives), '89 < 90 threshold at medium');
  });

  TestRunner.test('canExecuteLateGameOp: threshold scales with difficulty (easy 60 / hard 120)', function () {
    const easy = bootTestGame({ influence: 60, supplies: 20, difficulty: 'easy' });
    easy.operatives = twelveOps();
    TestRunner.assert(Operations.canExecuteLateGameOp(easy, easy.operatives), 'easy passes at 60');

    const hard = bootTestGame({ influence: 60, supplies: 20, difficulty: 'hard' });
    hard.operatives = twelveOps();
    TestRunner.assert(!Operations.canExecuteLateGameOp(hard, hard.operatives), 'hard blocked at 60 (needs 120)');
  });

  TestRunner.test('canExecuteLateGameOp: blocked with too few operatives or supplies', function () {
    const fewOps = bootTestGame({ influence: 200, supplies: 20, difficulty: 'medium' });
    fewOps.operatives = twelveOps().slice(0, 11);
    TestRunner.assert(!Operations.canExecuteLateGameOp(fewOps, fewOps.operatives), '11 operatives is not enough');

    const lowSupplies = bootTestGame({ influence: 200, supplies: 19, difficulty: 'medium' });
    lowSupplies.operatives = twelveOps();
    TestRunner.assert(!Operations.canExecuteLateGameOp(lowSupplies, lowSupplies.operatives), '19 supplies is not enough');
  });

  // ── startLateGameOp (3-turn multi-turn op) ──

  TestRunner.test('startLateGameOp: creates a 3-turn multiTurnOp, consumes 20 supplies, taps 12 operatives', function () {
    const { state, op } = bootSuccess('neutralize_leadership', { supplies: 50 });
    Operations.startLateGameOp(state, op, state.operatives);
    TestRunner.assertEqual(state.supplies, 30, '20 supplies consumed at start');
    TestRunner.assertEqual(state.operatives.length, 0, '12 operatives tapped');
    TestRunner.assertEqual(state.multiTurnOps.length, 1, '1 multi-turn op created');
    TestRunner.assertEqual(state.multiTurnOps[0].operation, 'late_game_op', 'tagged late_game_op');
    TestRunner.assertEqual(state.multiTurnOps[0].turnsRemaining, 3, '3 turns remaining');
    TestRunner.assertEqual(state.multiTurnOps[0].assignedOperatives.length, 12, '12 ops assigned');
    TestRunner.assertEqual(state.multiTurnOps[0].opportunity, op, 'the opportunity is carried on the op');
  });

  // ── Success effects (d8/d6 Late-Game Operations table) ──

  TestRunner.test('neutralize_leadership success: -50 Heat', async function () {
    const { state, op } = bootSuccess('neutralize_leadership', { heat: 60 });
    Dice.setProvider(() => Promise.resolve(5));
    await Operations.resolveLateGameOp(state, op, state.operatives);
    Dice.setProvider(null);
    TestRunner.assertEqual(state.heat, 10, '60 - 50 = 10');
  });

  TestRunner.test('news_agency success: +50 Influence, -15 Heat', async function () {
    const { state, op } = bootSuccess('news_agency', { heat: 40, influence: 100 });
    Dice.setProvider(() => Promise.resolve(5));
    await Operations.resolveLateGameOp(state, op, state.operatives);
    Dice.setProvider(null);
    TestRunner.assertEqual(state.influence, 150, '100 + 50 influence');
    TestRunner.assertEqual(state.heat, 25, '40 - 15 heat');
  });

  TestRunner.test('establish_militia success: -50 Heat', async function () {
    const { state, op } = bootSuccess('establish_militia', { heat: 70 });
    Dice.setProvider(() => Promise.resolve(5));
    await Operations.resolveLateGameOp(state, op, state.operatives);
    Dice.setProvider(null);
    TestRunner.assertEqual(state.heat, 20, '70 - 50 heat');
  });

  TestRunner.test('liberate_prison success: +5 Operatives drawn directly to Operatives, +15 Heat', async function () {
    const { state, op } = bootSuccess('liberate_prison', { heat: 10 });
    const before = state.operatives.length; // 12
    Deck.setProvider((count) => Promise.resolve(
      Array.from({ length: count }, (_, i) => ({ suit: 'clubs', rank: 'K', value: 13, tag: i }))
    ));
    Dice.setProvider(() => Promise.resolve(5));
    await Operations.resolveLateGameOp(state, op, state.operatives);
    Dice.setProvider(null);
    Deck.setProvider(null);
    TestRunner.assertEqual(state.operatives.length, before + 5, '5 operatives added directly');
    TestRunner.assertEqual(state.recruitPool.length, 0, 'bypasses recruit pool');
    TestRunner.assertEqual(state.initiates.length, 0, 'bypasses initiates');
    TestRunner.assertEqual(state.heat, 25, '10 + 15 heat');
  });

  TestRunner.test('control_supply success: +25 Supplies, +15 Heat', async function () {
    const { state, op } = bootSuccess('control_supply', { heat: 10, supplies: 50 });
    Dice.setProvider(() => Promise.resolve(5));
    await Operations.resolveLateGameOp(state, op, state.operatives);
    Dice.setProvider(null);
    TestRunner.assertEqual(state.supplies, 75, '50 + 25 supplies (execution does not consume supplies)');
    TestRunner.assertEqual(state.heat, 25, '10 + 15 heat');
  });

  TestRunner.test('provisional_government success: +50 Influence', async function () {
    const { state, op } = bootSuccess('provisional_government', { influence: 100 });
    Dice.setProvider(() => Promise.resolve(5));
    await Operations.resolveLateGameOp(state, op, state.operatives);
    Dice.setProvider(null);
    TestRunner.assertEqual(state.influence, 150, '100 + 50 influence');
  });

  // ── Success bookkeeping ──

  TestRunner.test('success: removes fulfilled opportunity, records completion, returns operatives to pool', async function () {
    const { state, op } = bootSuccess('neutralize_leadership', { heat: 60 });
    Dice.setProvider(() => Promise.resolve(5));
    const res = await Operations.resolveLateGameOp(state, op, state.operatives);
    Dice.setProvider(null);
    TestRunner.assert(res.success, 'succeeds');
    TestRunner.assertEqual(state.availableLateGameOps.length, 0, 'opportunity consumed on success');
    TestRunner.assertEqual(state.completedLateGameOps.length, 1, 'completion recorded');
    TestRunner.assertEqual(state.completedLateGameOps[0].type, 'neutralize_leadership', 'correct type recorded');
    TestRunner.assertEqual(state.operatives.length, 12, 'all 12 assigned operatives return on success');
  });

  // ── Failure ──

  TestRunner.test('failure: captures 2 assigned operatives (recycled to Recruitment Deck, not detained), opportunity remains', async function () {
    // 12 ops of value 2 -> opSum=24, heat=99 -> target = 100-99+24 = 25. Roll 90 fails.
    const state = bootTestGame({ heat: 99, influence: 200, supplies: 50 });
    state.operatives = Array.from({ length: 12 }, () => ({ suit: 'spades', rank: '2', value: 2 }));
    const deckBefore = state.recruitDeck.length;
    const op = { tableRoll: 0, type: 'provisional_government' };
    state.availableLateGameOps = [op];

    Dice.setProvider(() => Promise.resolve(90));
    const res = await Operations.resolveLateGameOp(state, op, state.operatives);
    Dice.setProvider(null);

    TestRunner.assert(!res.success, 'operation failed');
    TestRunner.assertEqual(state.detainedOperatives.length, 0, 'NOT detained — this is capture');
    TestRunner.assertEqual(state.recruitDeck.length, deckBefore + 2, '2 captured cards recycled into Recruitment Deck');
    TestRunner.assertEqual(state.operatives.length, 10, '2 captured removed; 10 survivors returned');
    TestRunner.assertEqual(state.availableLateGameOps.length, 1, 'opportunity left available after failure');
    TestRunner.assertEqual(state.completedLateGameOps.length, 0, 'no completion on failure');
    TestRunner.assert(!state.victory, 'no victory on failure');
    TestRunner.assertEqual(state.operativesLost, 2, 'captured operatives counted as lost (for the Victory screen)');
  });

  // ── Victory ──

  TestRunner.test('completing a 3rd distinct Late-Game Operation type sets the Victory flag', async function () {
    const state = bootSuccess('neutralize_leadership', { heat: 10 }).state;
    const opA = { tableRoll: 1, type: 'neutralize_leadership' };
    const opB = { tableRoll: 2, type: 'news_agency' };
    const opC = { tableRoll: 6, type: 'provisional_government' };
    state.availableLateGameOps = [opA, opB, opC];

    Dice.setProvider(() => Promise.resolve(5)); // always succeeds
    await Operations.resolveLateGameOp(state, opA, state.operatives);
    TestRunner.assert(!state.victory, 'no victory after 1 completed');
    await Operations.resolveLateGameOp(state, opB, state.operatives);
    TestRunner.assert(!state.victory, 'no victory after 2 completed');
    await Operations.resolveLateGameOp(state, opC, state.operatives);
    Dice.setProvider(null);

    TestRunner.assertEqual(state.completedLateGameOps.length, 3, '3 distinct completions');
    TestRunner.assert(state.victory, 'victory set on 3rd distinct completed type');
  });

  // ── Integration with the turn lifecycle ──

  TestRunner.test('Turn.processEndOfTurn resolves a late_game_op when its 3-turn timer expires', async function () {
    const { state, op } = bootSuccess('neutralize_leadership', { heat: 60 });
    Operations.startLateGameOp(state, op, state.operatives);
    // Advance two turns: still in flight.
    Dice.setProvider(() => Promise.resolve(5));
    await Turn.processEndOfTurn(state);
    await Turn.processEndOfTurn(state);
    TestRunner.assertEqual(state.multiTurnOps.length, 1, 'still in flight after 2 turns');
    // Third turn: resolves.
    await Turn.processEndOfTurn(state);
    Dice.setProvider(null);
    TestRunner.assertEqual(state.multiTurnOps.length, 0, 'op resolved and removed after 3rd turn');
    TestRunner.assertEqual(state.completedLateGameOps.length, 1, 'completion recorded via turn lifecycle');
    TestRunner.assertEqual(state.heat, 10, '60 - 50 heat applied on resolution');
    TestRunner.assertEqual(state.operatives.length, 12, 'operatives returned to pool');
  });

});
