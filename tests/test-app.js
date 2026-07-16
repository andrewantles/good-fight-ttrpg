/**
 * Tests for app.js — screen router, setup, recruitment pipeline, and DOM wiring.
 */

// ─── Shared helpers ───────────────────────────────────────────────────────────

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
      <span class="resource-bar-fill" id="bar-influence"></span>
      <span class="resource-bar-fill" id="bar-heat"></span>
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

TestRunner.describe('app.js — Screen Router', function () {

  // Helper to set up screen containers in the DOM
  function setupScreens() {
    const container = document.getElementById('app');
    if (!container) return;
    container.innerHTML = `
      <div data-screen="title" class="screen">Title</div>
      <div data-screen="setup" class="screen">Setup</div>
      <div data-screen="game" class="screen">Game</div>
      <div data-screen="victory" class="screen">Victory</div>
    `;
  }

  TestRunner.test('showScreen shows the title screen and hides others', function () {
    setupScreens();
    App.showScreen('title');
    const title = document.querySelector('[data-screen="title"]');
    const setup = document.querySelector('[data-screen="setup"]');
    const game = document.querySelector('[data-screen="game"]');
    const victory = document.querySelector('[data-screen="victory"]');
    TestRunner.assert(title.classList.contains('active'), 'Title should be active');
    TestRunner.assert(!setup.classList.contains('active'), 'Setup should not be active');
    TestRunner.assert(!game.classList.contains('active'), 'Game should not be active');
    TestRunner.assert(!victory.classList.contains('active'), 'Victory should not be active');
  });

  TestRunner.test('showScreen shows the setup screen and hides others', function () {
    setupScreens();
    App.showScreen('setup');
    const title = document.querySelector('[data-screen="title"]');
    const setup = document.querySelector('[data-screen="setup"]');
    TestRunner.assert(!title.classList.contains('active'), 'Title should not be active');
    TestRunner.assert(setup.classList.contains('active'), 'Setup should be active');
  });

  TestRunner.test('showScreen shows the game screen and hides others', function () {
    setupScreens();
    App.showScreen('game');
    const game = document.querySelector('[data-screen="game"]');
    const setup = document.querySelector('[data-screen="setup"]');
    TestRunner.assert(game.classList.contains('active'), 'Game should be active');
    TestRunner.assert(!setup.classList.contains('active'), 'Setup should not be active');
  });

  TestRunner.test('showScreen shows the victory screen and hides others', function () {
    setupScreens();
    App.showScreen('victory');
    const victory = document.querySelector('[data-screen="victory"]');
    const game = document.querySelector('[data-screen="game"]');
    TestRunner.assert(victory.classList.contains('active'), 'Victory should be active');
    TestRunner.assert(!game.classList.contains('active'), 'Game should not be active');
  });

  TestRunner.test('currentScreen returns the active screen name', function () {
    setupScreens();
    App.showScreen('game');
    TestRunner.assertEqual(App.currentScreen(), 'game');
    App.showScreen('title');
    TestRunner.assertEqual(App.currentScreen(), 'title');
  });

  TestRunner.test('switching screens updates currentScreen', function () {
    setupScreens();
    App.showScreen('title');
    TestRunner.assertEqual(App.currentScreen(), 'title');
    App.showScreen('setup');
    TestRunner.assertEqual(App.currentScreen(), 'setup');
    App.showScreen('game');
    TestRunner.assertEqual(App.currentScreen(), 'game');
    App.showScreen('victory');
    TestRunner.assertEqual(App.currentScreen(), 'victory');
  });

});

TestRunner.describe('app.js — Setup Tables', function () {

  function setupSetupScreen() {
    const container = document.getElementById('app');
    if (!container) return;
    container.innerHTML = `
      <div data-screen="setup" class="screen">
        <input type="checkbox" name="resistance" value="1">
        <input type="checkbox" name="resistance" value="2">
        <input type="checkbox" name="resistance" value="3">
        <input type="checkbox" name="resistance" value="4">
        <input type="checkbox" name="resistance" value="5">
        <input type="checkbox" name="resistance" value="6">
        <input type="checkbox" name="regime" value="1">
        <input type="checkbox" name="regime" value="2">
        <input type="checkbox" name="regime" value="3">
        <input type="checkbox" name="regime" value="4">
        <input type="checkbox" name="regime" value="5">
        <input type="checkbox" name="regime" value="6">
      </div>
    `;
  }

  TestRunner.test('RESISTANCE_VALUES has 6 entries', function () {
    TestRunner.assertArrayLength(App.RESISTANCE_VALUES, 6);
  });

  TestRunner.test('REGIME_TYPES has 6 entries', function () {
    TestRunner.assertArrayLength(App.REGIME_TYPES, 6);
  });

  TestRunner.test('rollForSetup checks a resistance checkbox via d6 roll', async function () {
    setupSetupScreen();
    Dice.setProvider(() => Promise.resolve(3));
    await App.rollForSetup('resistance');
    const cb = document.querySelector('input[name="resistance"][value="3"]');
    TestRunner.assert(cb.checked, 'Checkbox for roll result 3 should be checked');
    Dice.setProvider(null);
  });

  TestRunner.test('rollForSetup checks a regime checkbox via d6 roll', async function () {
    setupSetupScreen();
    Dice.setProvider(() => Promise.resolve(5));
    await App.rollForSetup('regime');
    const cb = document.querySelector('input[name="regime"][value="5"]');
    TestRunner.assert(cb.checked, 'Checkbox for roll result 5 should be checked');
    Dice.setProvider(null);
  });

  TestRunner.test('multiple rolls accumulate selections', async function () {
    setupSetupScreen();
    let callCount = 0;
    Dice.setProvider(() => Promise.resolve(++callCount));
    await App.rollForSetup('resistance');
    await App.rollForSetup('resistance');
    const checked = document.querySelectorAll('input[name="resistance"]:checked');
    TestRunner.assertEqual(checked.length, 2);
    Dice.setProvider(null);
  });

  TestRunner.test('getSetupSelections returns selected resistance labels', function () {
    setupSetupScreen();
    document.querySelector('input[name="resistance"][value="1"]').checked = true;
    document.querySelector('input[name="resistance"][value="4"]').checked = true;
    const selected = App.getSetupSelections('resistance');
    TestRunner.assertArrayLength(selected, 2);
    TestRunner.assertEqual(selected[0], 'Liberty & Freedom');
    TestRunner.assertEqual(selected[1], 'Democratic Processes');
  });

  TestRunner.test('getSetupSelections returns selected regime labels', function () {
    setupSetupScreen();
    document.querySelector('input[name="regime"][value="6"]').checked = true;
    const selected = App.getSetupSelections('regime');
    TestRunner.assertArrayLength(selected, 1);
    TestRunner.assertEqual(selected[0], 'Kleptocracy');
  });

});

TestRunner.describe('app.js — Setup Difficulty', function () {

  // Set up the minimal DOM beginGame() touches: a difficulty select plus
  // the data-screen containers showScreen() toggles.
  function setupDifficultyScreen(difficulty) {
    const container = document.getElementById('app');
    if (!container) return;
    container.innerHTML = `
      <div data-screen="setup" class="screen">
        <select id="input-difficulty">
          <option value="easy">Easy</option>
          <option value="medium" selected>Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>
      <div data-screen="game" class="screen"></div>
    `;
    document.getElementById('input-difficulty').value = difficulty;
  }

  TestRunner.test('beginGame captures the selected difficulty into state', function () {
    setupDifficultyScreen('hard');
    App.beginGame();
    TestRunner.assertEqual(App.getState().difficulty, 'hard');
    GameState.deleteSave('current');
  });

  TestRunner.test('beginGame defaults difficulty to medium when no select present', function () {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="setup" class="screen"></div>
      <div data-screen="game" class="screen"></div>
    `;
    App.beginGame();
    TestRunner.assertEqual(App.getState().difficulty, 'medium');
    GameState.deleteSave('current');
  });

  TestRunner.test('chosen difficulty persists through save/load', function () {
    setupDifficultyScreen('easy');
    App.beginGame();
    const loaded = GameState.load('current');
    TestRunner.assertEqual(loaded.difficulty, 'easy');
    GameState.deleteSave('current');
  });

});

TestRunner.describe('app.js — End Turn wiring (#20)', function () {

  TestRunner.test('clicking End Turn runs processEndOfTurn then resolveCrackdown then increments the turn', async function () {
    // DOM: the End Turn button living inside a game screen container.
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="setup" class="screen"></div>
      <div data-screen="game" class="screen">
        <button id="btn-end-turn">End Turn</button>
      </div>
    `;

    App.init();      // wires the #btn-end-turn click handler
    App.beginGame(); // establishes gameState (currentTurn starts at 1)

    // Stub the two engine steps to record invocation order without side effects.
    const calls = [];
    const originalProcess = Turn.processEndOfTurn;
    const originalCrackdown = Crackdown.resolveCrackdown;
    Turn.processEndOfTurn = async function () { calls.push('turn'); };
    Crackdown.resolveCrackdown = async function () {
      calls.push('crackdown');
      return {
        roll: 0, triggered: false, tier: null,
        penalties: { operatives: 0, initiates: 0, supplies: 0, influence: 0 },
      };
    };

    try {
      document.getElementById('btn-end-turn').click();
      // Let the async handler chain settle (macrotask drains the microtask queue).
      await new Promise((resolve) => setTimeout(resolve, 0));

      TestRunner.assertEqual(calls.length, 2, 'both engine steps ran');
      TestRunner.assertEqual(calls[0], 'turn', 'timers/multi-turn resolved first');
      TestRunner.assertEqual(calls[1], 'crackdown', 'crackdown/heat reduction second');
      TestRunner.assertEqual(App.getState().currentTurn, 2, 'turn counter incremented after the sequence');
    } finally {
      Turn.processEndOfTurn = originalProcess;
      Crackdown.resolveCrackdown = originalCrackdown;
      GameState.deleteSave('current');
    }
  });

});

TestRunner.describe('app.js — Leader Skill high-water mark (#48)', function () {

  function setupGameTopBar() {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="game" class="screen">
        <span id="val-influence"></span>
        <span id="val-heat"></span>
        <span id="val-supplies"></span>
        <span id="val-turn"></span>
        <span id="val-leader"></span>
        <div id="operations-list"></div>
        <div id="section-recruit-pool"><div class="card-list"></div></div>
        <div id="section-initiates"><div class="card-list"></div></div>
        <div id="section-operatives"><div class="card-list"></div></div>
        <div id="section-detained"><div class="card-list"></div></div>
        <div id="turn-log"></div>
      </div>
      <div data-screen="victory" class="screen"><div id="victory-stats"></div></div>
    `;
  }

  TestRunner.test('top-bar #val-leader displays the high-water mark after an end-of-turn promotion', async function () {
    setupGameTopBar();
    App.beginGame();
    App.showScreen('game');
    const s = App.getState();
    // An Initiate about to finish training this turn.
    s.initiates = [{ card: { suit: 'spades', rank: 'K', value: 13 }, turnsRemaining: 1 }];

    try {
      await App.endTurn();
      TestRunner.assertEqual(s.leaderSkillLevel, 13, 'promotion raised the skill level');
      TestRunner.assertEqual(document.getElementById('val-leader').textContent, '13',
        'top bar shows the live high-water mark');
    } finally {
      GameState.deleteSave('current');
    }
  });

  TestRunner.test('App.updateLeaderSkill delegates to the engine (no competing implementation)', function () {
    setupGameTopBar();
    App.beginGame();
    const s = App.getState();
    s.operatives = [{ suit: 'clubs', rank: 'J', value: 11 }];
    App.updateLeaderSkill();
    TestRunner.assertEqual(s.leaderSkillLevel, 11);
    TestRunner.assertEqual(s.leader.value, 11, 'engine also synced leader.value');
    GameState.deleteSave('current');
  });

  TestRunner.test('continueGame syncs leader.value to a saved leaderSkillLevel (mid-game load)', function () {
    setupGameTopBar();
    const saved = GameState.createInitial();
    saved.leaderSkillLevel = 7;   // a mid-game high-water mark
    saved.leader.value = 0;       // an older save left this unsynced
    GameState.save(saved, 'current');

    App.continueGame();
    const s = App.getState();
    TestRunner.assertEqual(s.leader.value, 7, 'leader.value reflects the loaded skill level');
    GameState.deleteSave('current');
  });

});

TestRunner.describe('app.js — Victory screen (#22)', function () {

  TestRunner.test('End Turn that completes a 3rd Late-Game Op (real engine) routes to the Victory screen with stats', async function () {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="game" class="screen">
        <button id="btn-end-turn">End Turn</button>
        <div id="turn-log"></div>
      </div>
      <div data-screen="victory" class="screen">
        <div id="victory-stats"></div>
      </div>
    `;

    App.beginGame();
    const s = App.getState();

    // Two distinct Late-Game Ops already done; a 3rd is mid-flight and resolves
    // this End Turn. Completing it flips the real Victory flag.
    s.completedLateGameOps = [{ type: 'neutralize_leadership' }, { type: 'news_agency' }];
    const opC = { tableRoll: 6, type: 'provisional_government' };
    s.availableLateGameOps = [opC];
    const assigned = Array.from({ length: 12 }, () => ({ suit: 'hearts', rank: '2', value: 2 }));
    s.multiTurnOps = [{
      operation: 'late_game_op', turnsRemaining: 1,
      assignedOperatives: assigned, opportunity: opC,
    }];
    s.heat = 0;               // ensures the d100 check succeeds
    s.currentTurn = 7;        // "turns taken" should report the turn victory landed on
    s.peakInfluence = 300;    // an earlier high, larger than the +50 this op adds
    s.operativesLost = 4;     // prior losses

    Dice.setProvider(() => Promise.resolve(5)); // small roll -> success
    try {
      await App.endTurn();

      TestRunner.assert(s.victory, 'the real engine set the Victory flag');
      TestRunner.assertEqual(App.currentScreen(), 'victory', 'routed to the Victory screen');
      TestRunner.assertEqual(s.currentTurn, 7, 'turn counter not advanced past the winning turn');

      const stats = document.getElementById('victory-stats').textContent;
      TestRunner.assert(/7/.test(stats), 'shows turns taken (7)');
      TestRunner.assert(/4/.test(stats), 'shows operatives lost (4)');
      TestRunner.assert(/300/.test(stats), 'shows peak Influence (300)');
    } finally {
      Dice.setProvider(null);
      GameState.deleteSave('current');
    }
  });

  TestRunner.test('End Turn with no Victory stays on the game screen', async function () {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="game" class="screen">
        <div id="turn-log"></div>
      </div>
      <div data-screen="victory" class="screen">
        <div id="victory-stats"></div>
      </div>
    `;

    App.beginGame();
    App.showScreen('game');
    try {
      await App.endTurn();
      TestRunner.assert(!App.getState().victory, 'no victory');
      TestRunner.assertEqual(App.currentScreen(), 'game', 'still on the game screen');
      TestRunner.assertEqual(App.getState().currentTurn, 2, 'turn advanced normally');
    } finally {
      GameState.deleteSave('current');
    }
  });

});

TestRunner.describe('app.js — Minor Vandalism wiring (#33)', function () {

  TestRunner.test('renders a Minor Vandalism button when executable and clicking it reaches resolveMinorVandalism', async function () {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="setup" class="screen"></div>
      <div data-screen="game" class="screen">
        <div id="operations-list"></div>
      </div>
    `;

    App.beginGame(); // establishes gameState (the Leader bootstraps K=1 ops, #46)

    // Give the player one recruited operative alongside the Leader.
    const operative = { suit: 'spades', rank: 'A', value: 14 };
    App.getState().operatives.push(operative);
    App.renderGameState();

    const btn = document.querySelector('#operations-list [data-operation="minor_vandalism"]');
    TestRunner.assert(btn, 'Minor Vandalism button should render when executable');

    // Stub the multi-select picker to auto-return the single recruited operative
    // (not the Leader) and the engine call to record it. Each selected unit is
    // resolved independently, so the engine is called with a single-unit array.
    const originalAssign = UI.assignOperativesRange;
    const originalResolve = Operations.resolveMinorVandalism;
    let received = null;
    UI.assignOperativesRange = async function (min, max, available) {
      return available.filter((o) => !o.isLeader).slice(0, 1);
    };
    Operations.resolveMinorVandalism = async function (state, operatives) {
      received = operatives;
      return { roll: 1, success: true };
    };

    try {
      btn.click();
      // Let the async handler chain settle.
      await new Promise((resolve) => setTimeout(resolve, 0));

      TestRunner.assert(received !== null, 'resolveMinorVandalism was called by the click');
      TestRunner.assertEqual(received.length, 1, 'each unit resolves independently (one unit → one-unit array)');
      TestRunner.assertEqual(received[0], operative, 'the picked operative was passed to the engine');
    } finally {
      UI.assignOperativesRange = originalAssign;
      Operations.resolveMinorVandalism = originalResolve;
      GameState.deleteSave('current');
    }
  });

  TestRunner.test('failure (real engine): no resource change, log reflects failure not success', async function () {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="setup" class="screen"></div>
      <div data-screen="game" class="screen">
        <div id="operations-list"></div>
        <div id="turn-log"></div>
      </div>
    `;

    App.beginGame();
    App.getState().heat = 90; // forces the d100 roll to fail (checkBasic: roll <= 100 - heat)
    const operative = { suit: 'spades', rank: 'A', value: 14 };
    App.getState().operatives.push(operative);
    App.renderGameState();

    const btn = document.querySelector('#operations-list [data-operation="minor_vandalism"]');
    TestRunner.assert(btn, 'Minor Vandalism button should render when executable');

    const originalAssign = UI.assignOperativesRange;
    UI.assignOperativesRange = async function (min, max, available) {
      return available.slice(0, 1);
    };

    try {
      Dice.setProvider(() => Promise.resolve(99)); // 99 > (100 - 90): failure
      btn.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      TestRunner.assertEqual(App.getState().influence, 0, 'no influence gained on failure');
      TestRunner.assertEqual(App.getState().heat, 90, 'heat unchanged (still the forced-failure value) on failure');

      const log = document.getElementById('turn-log').textContent;
      TestRunner.assert(/Minor Vandalism failed/.test(log), 'log reflects the failure, not the success message');
    } finally {
      Dice.setProvider(null);
      UI.assignOperativesRange = originalAssign;
      GameState.deleteSave('current');
    }
  });

  TestRunner.test('selecting 2 units (#63) runs 2 INDEPENDENT resolutions — 2 log lines, deltas from 2 distinct rolls', async function () {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="setup" class="screen"></div>
      <div data-screen="game" class="screen">
        <div id="operations-list"></div>
        <div id="turn-log"></div>
      </div>
    `;

    App.beginGame();
    App.getState().heat = 0;
    const opA = { suit: 'spades', rank: 'A', value: 14 };
    const opB = { suit: 'hearts', rank: 'Q', value: 12 };
    App.getState().operatives.push(opA, opB);
    App.renderGameState();

    const btn = document.querySelector('#operations-list [data-operation="minor_vandalism"]');
    TestRunner.assert(btn, 'Minor Vandalism button should render when executable');

    // Multi-select picker returns BOTH recruited operatives (not the Leader).
    const originalAssign = UI.assignOperativesRange;
    UI.assignOperativesRange = async function (min, max, available) {
      return available.filter((o) => !o.isLeader);
    };

    // Deterministic dice: run 1 succeeds (d100=5, then d4=2 → no draw),
    // run 2 fails (d100=100 > 100 − 1 Heat). Two distinct d100 rolls prove the
    // two resolutions were independent, not one shared roll.
    const queue = [5, 2, 100];
    let i = 0;
    Dice.setProvider(() => Promise.resolve(queue[i++]));

    try {
      btn.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const entries = document.querySelectorAll('#turn-log .log-entry');
      TestRunner.assertEqual(entries.length, 2, 'two units produce two independent log entries');

      const rollValues = Array.from(document.querySelectorAll('#turn-log .roll-value'))
        .map((s) => s.textContent);
      TestRunner.assertEqual(rollValues.length, 2, 'each resolution logged its own d100 roll');
      TestRunner.assertEqual(rollValues[0], '5', 'first run logged its own roll (5)');
      TestRunner.assertEqual(rollValues[1], '100', 'second run logged its own distinct roll (100)');

      const log = document.getElementById('turn-log').textContent;
      TestRunner.assert(/Minor Vandalism succeeded/.test(log), 'first run succeeded');
      TestRunner.assert(/Minor Vandalism failed/.test(log), 'second run failed');

      // Deltas reflect exactly one success (run 1): +1 Influence, +1 Heat.
      TestRunner.assertEqual(App.getState().influence, 1, '+1 Influence from the single success');
      TestRunner.assertEqual(App.getState().heat, 1, '+1 Heat from the single success');

      // Both selected units are tapped for the turn.
      TestRunner.assert(opA.tapped && opB.tapped, 'both selected units tapped');
    } finally {
      Dice.setProvider(null);
      UI.assignOperativesRange = originalAssign;
      GameState.deleteSave('current');
    }
  });

});

TestRunner.describe('app.js — Leader bootstraps Operations on a fresh game (#46)', function () {

  TestRunner.test('fresh game renders Minor Vandalism; clicking it and picking the Leader reaches resolveMinorVandalism with the Leader assigned', async function () {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="setup" class="screen"></div>
      <div data-screen="game" class="screen">
        <div id="operations-list"></div>
        <div id="turn-log"></div>
      </div>
    `;

    App.beginGame(); // fresh game: 0 recruited operatives, only the Leader

    App.renderGameState();
    const btn = document.querySelector('#operations-list [data-operation="minor_vandalism"]');
    TestRunner.assert(btn,
      'Minor Vandalism renders on a fresh game because the Leader counts as an Operative');

    // Stub the picker to select the Leader (the first entry of the assignable
    // pool) and spy on the engine call.
    const originalAssign = UI.assignOperativesRange;
    const originalResolve = Operations.resolveMinorVandalism;
    let received = null;
    let offered = null;
    UI.assignOperativesRange = async function (min, max, available) {
      offered = available;
      // pick the Leader specifically
      return available.filter((o) => o.isLeader).slice(0, 1);
    };
    Operations.resolveMinorVandalism = async function (state, operatives) {
      received = operatives;
      return { roll: 1, success: true };
    };

    try {
      btn.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      TestRunner.assert(offered && offered.some((o) => o.isLeader),
        'the assignment picker was offered the Leader');
      TestRunner.assert(received !== null, 'resolveMinorVandalism was called by the click');
      TestRunner.assertEqual(received.length, 1, 'the single selected unit resolves as a one-unit array');
      TestRunner.assertEqual(received[0], App.getState().leader,
        'the Leader was passed to the engine as the assigned operative');
    } finally {
      UI.assignOperativesRange = originalAssign;
      Operations.resolveMinorVandalism = originalResolve;
      GameState.deleteSave('current');
    }
  });

});

TestRunner.describe('app.js — Tapping / per-turn action economy (#52)', function () {

  TestRunner.test('after the Leader executes Minor Vandalism, the Leader is absent from the next Operation picker until End Turn', async function () {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="setup" class="screen"></div>
      <div data-screen="game" class="screen">
        <div id="operations-list"></div>
        <div id="turn-log"></div>
      </div>
    `;

    App.init();      // wires the #btn-end-turn handler (fine if absent in this DOM)
    App.beginGame();
    // A recruited operative so Minor Vandalism (K=1) stays available after the
    // Leader taps — otherwise the pool empties and there's no "next" op to pick.
    const opA = { suit: 'spades', rank: 'A', value: 14 };
    App.getState().operatives.push(opA);
    App.getState().heat = 90; // force failures so nothing detains/changes the pool
    App.renderGameState();

    const originalAssign = UI.assignOperativesRange;
    let offered = null;
    try {
      // First execution: the Leader acts and should tap.
      UI.assignOperativesRange = async function (min, max, available) {
        return available.filter((o) => o.isLeader).slice(0, 1);
      };
      Dice.setProvider(() => Promise.resolve(99));
      document.querySelector('#operations-list [data-operation="minor_vandalism"]').click();
      await new Promise((r) => setTimeout(r, 0));

      TestRunner.assert(App.getState().leader.tapped, 'the Leader tapped after acting');

      // Second execution: the picker must NOT be offered the tapped Leader.
      UI.assignOperativesRange = async function (min, max, available) {
        offered = available;
        return available.slice(0, 1);
      };
      document.querySelector('#operations-list [data-operation="minor_vandalism"]').click();
      await new Promise((r) => setTimeout(r, 0));

      TestRunner.assert(offered, 'the second Operation showed an assignment picker');
      TestRunner.assert(!offered.some((o) => o.isLeader),
        'the tapped Leader is excluded from the next picker');
      TestRunner.assert(offered.includes(opA),
        'the untapped operative is still offered');

      // End Turn untaps the Leader so it is assignable again next turn.
      await App.endTurn();
      TestRunner.assert(!App.getState().leader.tapped, 'End Turn untapped the Leader');
    } finally {
      UI.assignOperativesRange = originalAssign;
      Dice.setProvider(null);
      GameState.deleteSave('current');
    }
  });

  TestRunner.test('tapped units render visually distinct (tapped CSS class) in the Operatives panel', function () {
    const state = bootTestGame();
    const opA = { suit: 'spades', rank: 'A', value: 14 };            // untapped
    const opB = { suit: 'clubs', rank: 'K', value: 13, tapped: true }; // tapped
    state.operatives.push(opA, opB);
    state.leader.tapped = true;
    App.renderGameState();

    try {
      const panel = document.querySelector('#section-operatives .card-list');
      const leaderCard = panel.querySelector('.card-leader');
      TestRunner.assert(leaderCard.classList.contains('tapped'),
        'the tapped Leader card carries the tapped class');

      const cards = Array.from(panel.querySelectorAll('.card:not(.card-leader)'));
      const tappedCards = cards.filter((c) => c.classList.contains('tapped'));
      TestRunner.assertEqual(tappedCards.length, 1, 'exactly one operative card is marked tapped');
      TestRunner.assert(/K/.test(tappedCards[0].textContent),
        'the tapped operative (K of clubs) is the one marked, not the untapped Ace');
    } finally {
      GameState.deleteSave('current');
    }
  });

});

TestRunner.describe('app.js — Gather Supplies wiring (#34)', function () {

  TestRunner.test('renders a Gather Supplies button when executable and clicking it reaches resolveGatherSupplies', async function () {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="setup" class="screen"></div>
      <div data-screen="game" class="screen">
        <div id="operations-list"></div>
        <div id="turn-log"></div>
      </div>
    `;

    App.beginGame(); // establishes gameState (the Leader bootstraps K=1 ops, #46)

    // Give the player one recruited operative alongside the Leader.
    const operative = { suit: 'clubs', rank: 'K', value: 13 };
    App.getState().operatives.push(operative);
    App.renderGameState();

    const btn = document.querySelector('#operations-list [data-operation="gather_supplies"]');
    TestRunner.assert(btn, 'Gather Supplies button should render when executable');

    // Stub the multi-select picker to auto-return the single recruited operative
    // (not the Leader) and the engine call to record it. Each selected unit is
    // resolved independently, so the engine is called with a single-unit array.
    const originalAssign = UI.assignOperativesRange;
    const originalResolve = Operations.resolveGatherSupplies;
    let received = null;
    UI.assignOperativesRange = async function (min, max, available) {
      return available.filter((o) => !o.isLeader).slice(0, 1);
    };
    Operations.resolveGatherSupplies = async function (state, operatives) {
      received = operatives;
      return { rolls: [{ roll: 5, success: true }, { roll: 99, success: false }, { roll: 12, success: true }], gained: 2 };
    };

    try {
      btn.click();
      // Let the async handler chain settle.
      await new Promise((resolve) => setTimeout(resolve, 0));

      TestRunner.assert(received !== null, 'resolveGatherSupplies was called by the click');
      TestRunner.assertEqual(received.length, 1, 'each unit resolves independently (one unit → one-unit array)');
      TestRunner.assertEqual(received[0], operative, 'the picked operative was passed to the engine');

      // Log reflects the 3-roll result.
      const log = document.getElementById('turn-log').textContent;
      TestRunner.assert(/Gather Supplies/.test(log), 'log mentions Gather Supplies');
      TestRunner.assert(/2/.test(log), 'log reflects the number of supplies gained');
    } finally {
      UI.assignOperativesRange = originalAssign;
      Operations.resolveGatherSupplies = originalResolve;
      GameState.deleteSave('current');
    }
  });

  TestRunner.test('selecting 2 units (#63) runs 2 INDEPENDENT resolutions — 2 log lines, supplies from 2 distinct roll sets', async function () {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="setup" class="screen"></div>
      <div data-screen="game" class="screen">
        <div id="operations-list"></div>
        <div id="turn-log"></div>
      </div>
    `;

    App.beginGame();
    App.getState().heat = 50; // threshold 100 − 50 = 50, so rolls > 50 fail
    const opA = { suit: 'spades', rank: 'A', value: 14 };
    const opB = { suit: 'hearts', rank: 'Q', value: 12 };
    App.getState().operatives.push(opA, opB);
    const startSupplies = App.getState().supplies;
    App.renderGameState();

    const btn = document.querySelector('#operations-list [data-operation="gather_supplies"]');
    TestRunner.assert(btn, 'Gather Supplies button should render when executable');

    const originalAssign = UI.assignOperativesRange;
    UI.assignOperativesRange = async function (min, max, available) {
      return available.filter((o) => !o.isLeader);
    };

    // Deterministic dice, real engine: unit A rolls 5,5,5 (3 successes → +3),
    // unit B rolls 90,90,5 (1 success → +1). Six distinct rolls across two
    // 3-roll resolutions prove the runs were independent, not one shared set.
    const queue = [5, 5, 5, 90, 90, 5];
    let i = 0;
    Dice.setProvider(() => Promise.resolve(queue[i++]));

    try {
      btn.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const entries = Array.from(document.querySelectorAll('#turn-log .log-entry'));
      TestRunner.assertEqual(entries.length, 2, 'two units produce two independent log entries');

      const rollValues = document.querySelectorAll('#turn-log .roll-value');
      TestRunner.assertEqual(rollValues.length, 6, 'each resolution logged its own 3 d100 rolls (2 × 3)');

      TestRunner.assert(/3\/3 rolls succeeded/.test(entries[0].textContent), 'first run: 3/3 successes');
      TestRunner.assert(/\+3 Supplies/.test(entries[0].textContent), 'first run gained 3 Supplies');
      TestRunner.assert(/1\/3 rolls succeeded/.test(entries[1].textContent), 'second run: 1/3 successes');
      TestRunner.assert(/\+1 Supplies/.test(entries[1].textContent), 'second run gained 1 Supply');

      // Total supplies delta reflects the two independent resolutions: +3 +1.
      TestRunner.assertEqual(App.getState().supplies, startSupplies + 4,
        '+4 Supplies total from two independent 3-roll resolutions');

      TestRunner.assert(opA.tapped && opB.tapped, 'both selected units tapped');
    } finally {
      Dice.setProvider(null);
      UI.assignOperativesRange = originalAssign;
      GameState.deleteSave('current');
    }
  });

});

TestRunner.describe('app.js — Compound Failure choice wiring (#37)', function () {

  function setupSignificantVandalismDOM() {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="setup" class="screen"></div>
      <div data-screen="game" class="screen">
        <div id="operations-list"></div>
        <div id="turn-log"></div>
      </div>
    `;

    App.beginGame();
    const op1 = { suit: 'spades', rank: 'A', value: 14 };
    const op2 = { suit: 'hearts', rank: 'Q', value: 12 };
    const op3 = { suit: 'clubs', rank: 'K', value: 13 };
    const op4 = { suit: 'diamonds', rank: 'J', value: 11 };
    App.getState().operatives.push(op1, op2, op3, op4);
    GameState.addSupplies(App.getState(), 10);
  }

  TestRunner.test('on failure: shows the compoundFailureChoice modal and applies its result as the second penalty', async function () {
    setupSignificantVandalismDOM();
    App.getState().heat = 90; // forces the d100 roll to fail
    App.renderGameState();

    const btn = document.querySelector('#operations-list [data-operation="significant_vandalism"]');
    TestRunner.assert(btn, 'Significant Vandalism button should render when executable');

    const originalAssign = UI.assignOperatives;
    const originalChoice = UI.compoundFailureChoice;
    let choiceModalShown = false;
    UI.assignOperatives = async function (count, available) {
      return available.filter((o) => !o.isLeader).slice(0, count);
    };
    UI.compoundFailureChoice = async function () {
      choiceModalShown = true;
      return 'supplies';
    };

    try {
      Dice.setProvider(() => Promise.resolve(99)); // 99 > (100 - 90): failure
      btn.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      TestRunner.assert(choiceModalShown, 'compoundFailureChoice modal was shown on failure');
      TestRunner.assertEqual(App.getState().detainedOperatives.length, 1,
        'bullet 1: 1 operative detained');
      TestRunner.assertEqual(App.getState().supplies, 3,
        'bullet 2: the modal\'s "supplies" choice was applied (-5 cost, -2 second penalty)');

      const log = document.getElementById('turn-log').textContent;
      TestRunner.assert(/Significant Vandalism failed/.test(log), 'log reflects the failure');
    } finally {
      Dice.setProvider(null);
      UI.assignOperatives = originalAssign;
      UI.compoundFailureChoice = originalChoice;
      GameState.deleteSave('current');
    }
  });

  TestRunner.test('on success: never shows the compoundFailureChoice modal', async function () {
    setupSignificantVandalismDOM();
    App.getState().heat = 0; // guarantees the d100 roll succeeds
    App.renderGameState();

    const btn = document.querySelector('#operations-list [data-operation="significant_vandalism"]');
    TestRunner.assert(btn, 'Significant Vandalism button should render when executable');

    const originalAssign = UI.assignOperatives;
    const originalChoice = UI.compoundFailureChoice;
    let choiceModalShown = false;
    UI.assignOperatives = async function (count, available) {
      return available.filter((o) => !o.isLeader).slice(0, count);
    };
    UI.compoundFailureChoice = async function () {
      choiceModalShown = true;
      return 'supplies';
    };

    try {
      Dice.setProvider(() => Promise.resolve(1)); // 1 <= 100: success
      btn.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      TestRunner.assert(!choiceModalShown, 'compoundFailureChoice modal was NOT shown on success');

      const log = document.getElementById('turn-log').textContent;
      TestRunner.assert(/Significant Vandalism succeeded/.test(log), 'log reflects the success');
    } finally {
      Dice.setProvider(null);
      UI.assignOperatives = originalAssign;
      UI.compoundFailureChoice = originalChoice;
      GameState.deleteSave('current');
    }
  });

});

TestRunner.describe('app.js — Significant Vandalism wiring (#36)', function () {

  TestRunner.test('renders a Significant Vandalism button when executable and clicking it reaches resolveSignificantVandalism', async function () {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="setup" class="screen"></div>
      <div data-screen="game" class="screen">
        <div id="operations-list"></div>
        <div id="turn-log"></div>
      </div>
    `;

    App.beginGame(); // establishes gameState (starts with no operatives, 0 supplies)

    // With zero operatives / supplies, Significant Vandalism (needs 4 operatives,
    // 5 supplies) is not executable — but per #62 it still renders, disabled.
    App.renderGameState();
    const sigLocked = document.querySelector('#operations-list [data-operation="significant_vandalism"]');
    TestRunner.assert(sigLocked, 'Significant Vandalism button is present even when unavailable (#62)');
    TestRunner.assert(sigLocked.disabled, 'Significant Vandalism renders disabled/grayed when unavailable');

    // Give the player four available operatives and enough supplies.
    const op1 = { suit: 'spades', rank: 'A', value: 14 };
    const op2 = { suit: 'hearts', rank: 'Q', value: 12 };
    const op3 = { suit: 'clubs', rank: 'K', value: 13 };
    const op4 = { suit: 'diamonds', rank: 'J', value: 11 };
    App.getState().operatives.push(op1, op2, op3, op4);
    GameState.addSupplies(App.getState(), 5);
    App.renderGameState();

    const btn = document.querySelector('#operations-list [data-operation="significant_vandalism"]');
    TestRunner.assert(btn, 'Significant Vandalism button should render when executable');
    TestRunner.assert(!btn.disabled, 'Significant Vandalism is enabled once affordable');

    // Stub the picker to auto-return operatives and the engine call to record it.
    const originalAssign = UI.assignOperatives;
    const originalChoice = UI.compoundFailureChoice;
    const originalResolve = Operations.resolveSignificantVandalism;
    let received = null;
    UI.assignOperatives = async function (count, available) {
      return available.filter((o) => !o.isLeader).slice(0, count);
    };
    UI.compoundFailureChoice = async function () {
      return 'detain';
    };
    Operations.resolveSignificantVandalism = async function (state, operatives, options) {
      received = operatives;
      return { roll: 10, success: true };
    };

    try {
      btn.click();
      // Let the async handler chain settle.
      await new Promise((resolve) => setTimeout(resolve, 0));

      TestRunner.assert(received !== null, 'resolveSignificantVandalism was called by the click');
      TestRunner.assertEqual(received.length, 4, 'exactly four operatives assigned (K=4)');
      TestRunner.assertEqual(received[0], op1, 'the first picked operative was passed to the engine');
      TestRunner.assertEqual(received[3], op4, 'the fourth picked operative was passed to the engine');

      // Log reflects the Significant Vandalism result.
      const log = document.getElementById('turn-log').textContent;
      TestRunner.assert(/Significant Vandalism/.test(log), 'log mentions Significant Vandalism');
    } finally {
      UI.assignOperatives = originalAssign;
      UI.compoundFailureChoice = originalChoice;
      Operations.resolveSignificantVandalism = originalResolve;
      GameState.deleteSave('current');
    }
  });

});

TestRunner.describe('app.js — Average Vandalism wiring (#35)', function () {

  TestRunner.test('fixed K>1 op (#63 guard): Average Vandalism still uses the exact-2 picker, never the K=1 batch range', async function () {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="setup" class="screen"></div>
      <div data-screen="game" class="screen">
        <div id="operations-list"></div>
        <div id="turn-log"></div>
      </div>
    `;

    App.beginGame();
    const op1 = { suit: 'spades', rank: 'A', value: 14 };
    const op2 = { suit: 'hearts', rank: 'Q', value: 12 };
    const op3 = { suit: 'clubs', rank: 'K', value: 13 };
    App.getState().operatives.push(op1, op2, op3);
    GameState.addSupplies(App.getState(), 3);
    App.renderGameState();

    const btn = document.querySelector('#operations-list [data-operation="average_vandalism"]');
    TestRunner.assert(btn, 'Average Vandalism button should render when executable');

    // Spy on BOTH pickers. The batch K=1 change (#63) must NOT bleed into the
    // fixed K>1 flow: Average Vandalism must call the exact-count picker with
    // count === 2 and must never call the min≠max batch range picker.
    const originalAssign = UI.assignOperatives;
    const originalRange = UI.assignOperativesRange;
    const originalResolve = Operations.resolveAverageVandalism;
    let assignCount = null;
    let rangeArgs = null;
    UI.assignOperatives = async function (count, available) {
      assignCount = count;
      return available.filter((o) => !o.isLeader).slice(0, count);
    };
    UI.assignOperativesRange = async function (min, max, available) {
      rangeArgs = { min, max };
      return available.filter((o) => !o.isLeader).slice(0, min);
    };
    Operations.resolveAverageVandalism = async function () {
      return { roll: 10, success: true };
    };

    try {
      btn.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      TestRunner.assertEqual(assignCount, 2, 'Average Vandalism asked for exactly 2 operatives (fixed K)');
      TestRunner.assert(rangeArgs === null || rangeArgs.min === rangeArgs.max,
        'the fixed K>1 op never opened a multi-select batch range (min ≠ max)');
    } finally {
      UI.assignOperatives = originalAssign;
      UI.assignOperativesRange = originalRange;
      Operations.resolveAverageVandalism = originalResolve;
      GameState.deleteSave('current');
    }
  });

  TestRunner.test('renders an Average Vandalism button when executable and clicking it reaches resolveAverageVandalism', async function () {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="setup" class="screen"></div>
      <div data-screen="game" class="screen">
        <div id="operations-list"></div>
        <div id="turn-log"></div>
      </div>
    `;

    App.beginGame(); // establishes gameState (starts with no operatives, 0 supplies)

    // With zero operatives / supplies, Average Vandalism (needs 2 operatives,
    // 3 supplies) is not executable — but per #62 it still renders, disabled.
    App.renderGameState();
    const avgLocked = document.querySelector('#operations-list [data-operation="average_vandalism"]');
    TestRunner.assert(avgLocked, 'Average Vandalism button is present even when unavailable (#62)');
    TestRunner.assert(avgLocked.disabled, 'Average Vandalism renders disabled/grayed when unavailable');

    // Give the player two available operatives and enough supplies.
    const op1 = { suit: 'spades', rank: 'A', value: 14 };
    const op2 = { suit: 'hearts', rank: 'Q', value: 12 };
    App.getState().operatives.push(op1, op2);
    GameState.addSupplies(App.getState(), 3);
    App.renderGameState();

    const btn = document.querySelector('#operations-list [data-operation="average_vandalism"]');
    TestRunner.assert(btn, 'Average Vandalism button should render when executable');
    TestRunner.assert(!btn.disabled, 'Average Vandalism is enabled once affordable');

    // Stub the picker to auto-return operatives and the engine call to record it.
    const originalAssign = UI.assignOperatives;
    const originalResolve = Operations.resolveAverageVandalism;
    let received = null;
    UI.assignOperatives = async function (count, available) {
      return available.filter((o) => !o.isLeader).slice(0, count);
    };
    Operations.resolveAverageVandalism = async function (state, operatives) {
      received = operatives;
      return { roll: 10, success: true };
    };

    try {
      btn.click();
      // Let the async handler chain settle.
      await new Promise((resolve) => setTimeout(resolve, 0));

      TestRunner.assert(received !== null, 'resolveAverageVandalism was called by the click');
      TestRunner.assertEqual(received.length, 2, 'exactly two operatives assigned (K=2)');
      TestRunner.assertEqual(received[0], op1, 'the first picked operative was passed to the engine');
      TestRunner.assertEqual(received[1], op2, 'the second picked operative was passed to the engine');

      // Log reflects the Average Vandalism result.
      const log = document.getElementById('turn-log').textContent;
      TestRunner.assert(/Average Vandalism/.test(log), 'log mentions Average Vandalism');
    } finally {
      UI.assignOperatives = originalAssign;
      Operations.resolveAverageVandalism = originalResolve;
      GameState.deleteSave('current');
    }
  });

  TestRunner.test('failure (real engine): detains 1 operative and reflects it in the personnel panel and log', async function () {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="setup" class="screen"></div>
      <div data-screen="game" class="screen">
        <div id="operations-list"></div>
        <div id="turn-log"></div>
        <div id="section-operatives"><div class="card-list"></div></div>
        <div id="section-detained"><div class="card-list"></div></div>
      </div>
    `;

    App.beginGame();
    App.getState().heat = 90; // forces the d100 roll to fail (checkBasic: roll <= 100 - heat)
    const op1 = { suit: 'spades', rank: 'A', value: 14 };
    const op2 = { suit: 'hearts', rank: 'Q', value: 12 };
    App.getState().operatives.push(op1, op2);
    GameState.addSupplies(App.getState(), 3);
    App.renderGameState();

    const btn = document.querySelector('#operations-list [data-operation="average_vandalism"]');
    TestRunner.assert(btn, 'Average Vandalism button should render when executable');

    const originalAssign = UI.assignOperatives;
    UI.assignOperatives = async function (count, available) {
      return available.filter((o) => !o.isLeader).slice(0, count);
    };

    try {
      Dice.setProvider(() => Promise.resolve(99)); // 99 > (100 - 90): failure
      btn.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      TestRunner.assertEqual(App.getState().detainedOperatives.length, 1, 'real engine detained 1 operative');
      TestRunner.assertEqual(App.getState().operatives.length, 1, 'detained operative removed from the available pool');

      const log = document.getElementById('turn-log').textContent;
      TestRunner.assert(/Average Vandalism failed/.test(log), 'log reflects the failure, not the success message');

      const detainedPanel = document.querySelector('#section-detained .card-list').textContent;
      TestRunner.assert(detainedPanel.trim().length > 0, 'detained operative appears in the Detained panel');
    } finally {
      Dice.setProvider(null);
      UI.assignOperatives = originalAssign;
      GameState.deleteSave('current');
    }
  });

});

TestRunner.describe('app.js — Scout-start wiring (#38)', function () {

  function setupScoutDOM() {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="setup" class="screen"></div>
      <div data-screen="game" class="screen">
        <section id="section-recruit-pool"><div class="card-list"></div></section>
        <section id="section-initiates"><div class="card-list"></div></section>
        <section id="section-operatives"><div class="card-list"></div></section>
        <section id="section-detained"><div class="card-list"></div></section>
        <div id="operations-list"></div>
        <div id="turn-log"></div>
      </div>
    `;
    App.beginGame();
  }

  TestRunner.test('button gated by canExecute: always present, disabled without 4 operatives + 5 supplies, enabled with them (#62)', function () {
    setupScoutDOM();

    // Fresh game: no operatives, no supplies — Scout (4 ops, 5 supplies)
    // unavailable, but per #62 it renders disabled rather than being hidden.
    App.renderGameState();
    let scout = document.querySelector('#operations-list [data-operation="scout"]');
    TestRunner.assert(scout, 'Scout button is present even with no available operatives');
    TestRunner.assert(scout.disabled, 'Scout is disabled with no available operatives');

    // Four operatives but no supplies — still unavailable, still present+disabled.
    const op1 = { suit: 'spades', rank: 'A', value: 14 };
    const op2 = { suit: 'hearts', rank: 'Q', value: 12 };
    const op3 = { suit: 'clubs', rank: 'K', value: 13 };
    const op4 = { suit: 'diamonds', rank: 'J', value: 11 };
    App.getState().operatives.push(op1, op2, op3, op4);
    App.renderGameState();
    scout = document.querySelector('#operations-list [data-operation="scout"]');
    TestRunner.assert(scout, 'Scout button still present with 4 operatives but 0 supplies');
    TestRunner.assert(scout.disabled, 'Scout still disabled with 4 operatives but 0 supplies');

    // Add the 5 supplies — now Scout is available and enabled.
    GameState.addSupplies(App.getState(), 5);
    App.renderGameState();
    scout = document.querySelector('#operations-list [data-operation="scout"]');
    TestRunner.assert(scout, 'Scout button present with 4 operatives and 5 supplies');
    TestRunner.assert(!scout.disabled, 'Scout is enabled with 4 operatives and 5 supplies');

    GameState.deleteSave('current');
  });

  TestRunner.test('click (real engine): assigns 4 operatives, spends 5 supplies, and shows the multi-turn Scout op in the DOM', async function () {
    setupScoutDOM();
    const op1 = { suit: 'spades', rank: 'A', value: 14 };
    const op2 = { suit: 'hearts', rank: 'Q', value: 12 };
    const op3 = { suit: 'clubs', rank: 'K', value: 13 };
    const op4 = { suit: 'diamonds', rank: 'J', value: 11 };
    const op5 = { suit: 'spades', rank: '2', value: 2 }; // a fifth, un-assigned operative
    App.getState().operatives.push(op1, op2, op3, op4, op5);
    GameState.addSupplies(App.getState(), 8); // 8 supplies; Scout should consume 5
    App.renderGameState();

    const btn = document.querySelector('#operations-list [data-operation="scout"]');
    TestRunner.assert(btn, 'Scout button should render when executable');

    const originalAssign = UI.assignOperatives;
    UI.assignOperatives = async function (count, available) {
      return available.filter((o) => !o.isLeader).slice(0, count); // deterministic: first K recruited
    };

    try {
      btn.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      const state = App.getState();

      // Real engine effects (Operations.startScout is deterministic, no roll).
      TestRunner.assertEqual(state.supplies, 3, 'Scout spent 5 supplies (8 - 5)');
      TestRunner.assertEqual(state.operatives.length, 1,
        'four operatives removed from the available pool, fifth remains');
      TestRunner.assertEqual(state.operatives[0], op5,
        'the un-assigned operative stays available');
      TestRunner.assertEqual(state.multiTurnOps.length, 1, 'one multi-turn op created');
      TestRunner.assertEqual(state.multiTurnOps[0].operation, 'scout', 'the multi-turn op is Scout');
      TestRunner.assertEqual(state.multiTurnOps[0].turnsRemaining, 2, 'Scout runs for 2 turns');
      TestRunner.assertEqual(state.multiTurnOps[0].assignedOperatives.length, 4,
        'four operatives locked into the Scout op');

      // Assigned operatives removed from the personnel display.
      const opsPanel = document.querySelector('#section-operatives .card-list').textContent;
      TestRunner.assert(!/Q/.test(opsPanel),
        'an assigned operative (Q of hearts) no longer appears in the Operatives panel');

      // Multi-turn Scout op reflected in the operations DOM.
      const opsList = document.getElementById('operations-list').textContent;
      TestRunner.assert(/Scout/i.test(opsList) && /2 turn/i.test(opsList),
        'the operations panel shows the in-progress Scout op with its turn countdown');

      // Log reflects the started Scout op.
      const log = document.getElementById('turn-log').textContent;
      TestRunner.assert(/Scout/i.test(log), 'log mentions the Scout op');
    } finally {
      UI.assignOperatives = originalAssign;
      GameState.deleteSave('current');
    }
  });

});

TestRunner.describe('app.js — Unwinnable Advisory (#14)', function () {

  // Builds a game screen containing the advisory banner + a live game state.
  function setupGameWithAdvisory() {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="game" class="screen">
        <div id="unwinnable-advisory" class="advisory" hidden>
          <span class="advisory-text"></span>
          <button id="btn-dismiss-advisory">&times;</button>
        </div>
        <div id="operations-list"></div>
        <div id="section-recruit-pool"><div class="card-list"></div></div>
        <div id="section-initiates"><div class="card-list"></div></div>
        <div id="section-operatives"><div class="card-list"></div></div>
        <div id="section-detained"><div class="card-list"></div></div>
        <div id="turn-log"></div>
      </div>
    `;
    App.beginGame(); // fresh state; overwrite deck/pool below per-test
  }

  TestRunner.test('advisory appears when no operatives, no recruit pool, empty deck', function () {
    setupGameWithAdvisory();
    const state = App.getState();
    state.operatives = [];
    state.recruitPool = [];
    state.recruitDeck = [];

    App.renderGameState();

    const advisory = document.getElementById('unwinnable-advisory');
    TestRunner.assert(!advisory.hidden, 'advisory should be visible when all three conditions hold');
  });

  TestRunner.test('advisory stays hidden when an operative remains', function () {
    setupGameWithAdvisory();
    const state = App.getState();
    state.operatives = [{ suit: 'spades', rank: 'A', value: 14 }];
    state.recruitPool = [];
    state.recruitDeck = [];

    App.renderGameState();

    const advisory = document.getElementById('unwinnable-advisory');
    TestRunner.assert(advisory.hidden, 'advisory should be hidden while an operative remains');
  });

  TestRunner.test('advisory stays hidden when recruit pool is non-empty', function () {
    setupGameWithAdvisory();
    const state = App.getState();
    state.operatives = [];
    state.recruitPool = [{ suit: 'hearts', rank: '2', value: 2 }];
    state.recruitDeck = [];

    App.renderGameState();

    const advisory = document.getElementById('unwinnable-advisory');
    TestRunner.assert(advisory.hidden, 'advisory should be hidden while the recruit pool has cards');
  });

  TestRunner.test('advisory stays hidden when the recruitment deck is non-empty', function () {
    setupGameWithAdvisory();
    const state = App.getState();
    state.operatives = [];
    state.recruitPool = [];
    state.recruitDeck = [{ suit: 'clubs', rank: '3', value: 3 }];

    App.renderGameState();

    const advisory = document.getElementById('unwinnable-advisory');
    TestRunner.assert(advisory.hidden, 'advisory should be hidden while the recruitment deck has cards');
  });

  TestRunner.test('dismissing hides the advisory without changing screen or state', function () {
    setupGameWithAdvisory();
    App.showScreen('game');
    const state = App.getState();
    state.operatives = [];
    state.recruitPool = [];
    state.recruitDeck = [];

    App.renderGameState();
    const advisory = document.getElementById('unwinnable-advisory');
    TestRunner.assert(!advisory.hidden, 'advisory visible before dismiss');

    document.getElementById('btn-dismiss-advisory').click();

    TestRunner.assert(advisory.hidden, 'advisory hidden after dismiss');
    TestRunner.assertEqual(App.currentScreen(), 'game', 'play continues on the game screen (non-blocking)');

    // Dismissal survives a re-render while the conditions still hold.
    App.renderGameState();
    TestRunner.assert(advisory.hidden, 'advisory stays dismissed on re-render while conditions persist');
  });

  TestRunner.test('advisory can reappear after conditions clear and recur', function () {
    setupGameWithAdvisory();
    const state = App.getState();
    state.operatives = [];
    state.recruitPool = [];
    state.recruitDeck = [];
    App.renderGameState();

    document.getElementById('btn-dismiss-advisory').click();
    const advisory = document.getElementById('unwinnable-advisory');
    TestRunner.assert(advisory.hidden, 'dismissed');

    // Conditions clear (player gains an operative), then recur.
    state.operatives = [{ suit: 'spades', rank: 'A', value: 14 }];
    App.renderGameState();
    TestRunner.assert(advisory.hidden, 'still hidden while conditions do not hold');

    state.operatives = [];
    App.renderGameState();
    TestRunner.assert(!advisory.hidden, 'advisory reappears once the position is stuck again');
  });

});

TestRunner.describe('app.js — Settings gear: mid-game Input Mode toggle (#40)', function () {

  // Builds a game screen containing the Settings gear button.
  function setupSettingsDOM() {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="setup" class="screen"></div>
      <div data-screen="game" class="screen">
        <button id="btn-settings" class="icon-btn" title="Settings">&#9881;</button>
      </div>
    `;
    App.init();      // wires the #btn-settings click handler
    App.beginGame(); // establishes gameState (default inputMode: digital/digital)
  }

  TestRunner.test('clicking the gear opens a settings modal seeded from current inputMode', function () {
    setupSettingsDOM();

    // No modal before the click.
    TestRunner.assert(!document.querySelector('.modal-overlay'),
      'no settings modal before the gear is clicked');

    document.getElementById('btn-settings').click();

    const overlay = document.querySelector('.modal-overlay');
    TestRunner.assert(overlay, 'clicking the gear opens a .modal-overlay');

    const diceSelect = overlay.querySelector('[data-settings-dice]');
    const cardsSelect = overlay.querySelector('[data-settings-cards]');
    TestRunner.assert(diceSelect && cardsSelect,
      'modal has dice and cards Input Mode selects');
    TestRunner.assertEqual(diceSelect.value, 'digital',
      'dice select seeded from current inputMode.dice');
    TestRunner.assertEqual(cardsSelect.value, 'digital',
      'cards select seeded from current inputMode.cards');

    overlay.remove();
    GameState.deleteSave('current');
  });

  TestRunner.test('applying a change updates inputMode, re-syncs providers (real effect), persists, and closes', async function () {
    setupSettingsDOM();

    document.getElementById('btn-settings').click();
    const overlay = document.querySelector('.modal-overlay');

    // Switch dice to physical, leave cards digital.
    const diceSelect = overlay.querySelector('[data-settings-dice]');
    diceSelect.value = 'physical';

    // Spy on the physical dice provider so we can prove syncInputProviders
    // actually re-wired Dice to it (rather than asserting an internal call).
    const originalDiceInput = UI.diceInput;
    let providerCalled = false;
    UI.diceInput = function () {
      providerCalled = true;
      return Promise.resolve(4);
    };

    try {
      overlay.querySelector('[data-settings-apply]').click();

      // State updated.
      TestRunner.assertEqual(App.getState().inputMode.dice, 'physical',
        'inputMode.dice updated to physical');
      TestRunner.assertEqual(App.getState().inputMode.cards, 'digital',
        'inputMode.cards left unchanged');

      // Persisted to the current slot.
      const saved = GameState.load('current');
      TestRunner.assertEqual(saved.inputMode.dice, 'physical',
        'change persisted through GameState.save/load');

      // Modal closed.
      TestRunner.assert(!document.querySelector('.modal-overlay'),
        'settings modal closes after Apply');

      // Real effect: the next Dice.roll now routes through the physical provider.
      await Dice.roll('d6');
      TestRunner.assert(providerCalled,
        'syncInputProviders re-wired Dice to the physical provider after Apply');
    } finally {
      UI.diceInput = originalDiceInput;
      Dice.setProvider(null);
      GameState.deleteSave('current');
    }
  });

});

TestRunner.describe('app.js — Settings gear: save-slot management panel (#41)', function () {

  // Builds a game screen with the Settings gear plus a couple of the resource
  // fields renderGameState() writes to, so we can prove a Load actually
  // re-renders the active game (not just swaps internal state).
  function setupSlotsDOM() {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="setup" class="screen"></div>
      <div data-screen="game" class="screen">
        <button id="btn-settings" class="icon-btn" title="Settings">&#9881;</button>
        <span id="val-influence"></span>
      </div>
    `;
    App.init();
    App.beginGame(); // establishes gameState + autosaves to the 'current' slot
  }

  // Remove every save slot so tests don't leak state into one another
  // (localStorage is shared across the whole happy-dom run).
  function clearAllSlots() {
    GameState.listSaves().forEach((name) => GameState.deleteSave(name));
  }

  TestRunner.test('modal lists existing named slots via GameState.listSaves (hides internal current autosave)', function () {
    setupSlotsDOM();
    // Seed two named slots; beginGame already wrote the 'current' autosave.
    GameState.save(App.getState(), 'alpha');
    GameState.save(App.getState(), 'beta');

    document.getElementById('btn-settings').click();
    const overlay = document.querySelector('.modal-overlay');

    const slots = overlay.querySelector('[data-settings-slots]');
    TestRunner.assert(slots, 'modal has a save-slot list container');
    const text = slots.textContent;
    TestRunner.assert(text.includes('alpha'), 'named slot alpha is listed');
    TestRunner.assert(text.includes('beta'), 'named slot beta is listed');
    TestRunner.assert(!text.includes('current'),
      "internal 'current' autosave slot is not exposed in the manager");

    overlay.remove();
    clearAllSlots();
  });

});

TestRunner.describe('app.js — Settings gear: save-slot save/load/delete (#41 real engine)', function () {

  function setupSlotsDOM() {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="setup" class="screen"></div>
      <div data-screen="game" class="screen">
        <button id="btn-settings" class="icon-btn" title="Settings">&#9881;</button>
        <span id="val-influence"></span>
      </div>
    `;
    App.init();
    App.beginGame();
  }

  function clearAllSlots() {
    GameState.listSaves().forEach((name) => GameState.deleteSave(name));
  }

  TestRunner.test('Save button persists the current game to the named slot and lists it (real engine)', function () {
    setupSlotsDOM();
    App.getState().influence = 42; // mutate the live game before saving

    document.getElementById('btn-settings').click();
    const overlay = document.querySelector('.modal-overlay');
    overlay.querySelector('[data-settings-slot-name]').value = 'mygame';
    overlay.querySelector('[data-settings-save]').click();

    // Real persistence: the slot now holds the live game's state.
    const saved = GameState.load('mygame');
    TestRunner.assert(saved, 'GameState.load returns the saved slot');
    TestRunner.assertEqual(saved.influence, 42, 'saved slot captured live influence');

    // The new slot appears in the refreshed list.
    TestRunner.assert(
      overlay.querySelector('[data-settings-slots]').textContent.includes('mygame'),
      'saved slot appears in the list without reopening the modal');

    overlay.remove();
    clearAllSlots();
  });

  TestRunner.test('blank or reserved "current" slot names do not save (guard)', function () {
    setupSlotsDOM();
    document.getElementById('btn-settings').click();
    const overlay = document.querySelector('.modal-overlay');

    overlay.querySelector('[data-settings-slot-name]').value = '   ';
    overlay.querySelector('[data-settings-save]').click();
    TestRunner.assertEqual(GameState.listSaves().filter((n) => n !== 'current').length, 0,
      'blank name creates no slot');

    overlay.querySelector('[data-settings-slot-name]').value = 'current';
    overlay.querySelector('[data-settings-save]').click();
    // Only the autosave 'current' should exist — no duplicate/clobber created here.
    const beforeInfluence = GameState.load('current').influence;
    TestRunner.assert(typeof beforeInfluence === 'number',
      "reserved 'current' name is not treated as a user slot");

    overlay.remove();
    clearAllSlots();
  });

  TestRunner.test('Load button swaps the active game to the slot and re-renders the screen (real engine)', function () {
    setupSlotsDOM();
    // Snapshot a game with influence 10 into a slot.
    App.getState().influence = 10;
    GameState.save(App.getState(), 'snap');
    // Diverge the live game.
    App.getState().influence = 3;
    document.getElementById('val-influence').textContent = '3';

    document.getElementById('btn-settings').click();
    const overlay = document.querySelector('.modal-overlay');
    overlay.querySelector('[data-settings-load="snap"]').click();

    // Active state actually replaced with the loaded slot.
    TestRunner.assertEqual(App.getState().influence, 10,
      'active game influence loaded from the slot');
    // Re-render reflected in the DOM.
    TestRunner.assertEqual(document.getElementById('val-influence').textContent, '10',
      'renderGameState ran after load, updating the resource display');
    // Loaded game adopted as the live autosave.
    TestRunner.assertEqual(GameState.load('current').influence, 10,
      "loaded game becomes the 'current' autosave");
    // Modal closed.
    TestRunner.assert(!document.querySelector('.modal-overlay'),
      'settings modal closes after Load');

    clearAllSlots();
  });

  TestRunner.test('Delete button removes the slot from storage and the list (real engine)', function () {
    setupSlotsDOM();
    GameState.save(App.getState(), 'gone');

    document.getElementById('btn-settings').click();
    const overlay = document.querySelector('.modal-overlay');
    TestRunner.assert(overlay.querySelector('[data-settings-slots]').textContent.includes('gone'),
      'slot present before delete');

    overlay.querySelector('[data-settings-delete="gone"]').click();

    TestRunner.assertEqual(GameState.load('gone'), null,
      'slot removed from storage (real engine)');
    TestRunner.assert(!overlay.querySelector('[data-settings-slots]').textContent.includes('gone'),
      'slot removed from the list without reopening');

    overlay.remove();
    clearAllSlots();
  });

});

TestRunner.describe('app.js — Leader in the Operatives panel (#46)', function () {

  function setupPersonnelDOM() {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="setup" class="screen"></div>
      <div data-screen="game" class="screen">
        <section id="section-recruit-pool"><div class="card-list"></div></section>
        <section id="section-initiates"><div class="card-list"></div></section>
        <section id="section-operatives"><div class="card-list"></div></section>
        <section id="section-detained"><div class="card-list"></div></section>
      </div>
    `;
    App.beginGame();
  }

  TestRunner.test('renderPersonnel shows the Leader as a Joker in the Operatives section on a fresh game', function () {
    setupPersonnelDOM();
    App.renderPersonnel();

    const opsList = document.querySelector('#section-operatives .card-list');
    // Not the empty "None" placeholder — the Leader is always present.
    TestRunner.assert(!/None/.test(opsList.textContent),
      'operatives section is not empty — the Leader is shown');
    // Visually distinct Leader card.
    const leaderCard = opsList.querySelector('.card-leader');
    TestRunner.assert(leaderCard, 'a visually-distinct .card-leader is rendered');
    TestRunner.assert(/Leader/i.test(leaderCard.textContent),
      'the Leader card is labelled Leader');
    // Rendered as a Joker, not a broken "?" card.
    TestRunner.assert(!/\?/.test(leaderCard.textContent),
      'joker suit does not render as a "?" placeholder');
  });

  TestRunner.test('the Leader carries no Recruit or detain controls', function () {
    setupPersonnelDOM();
    App.renderPersonnel();

    const opsList = document.querySelector('#section-operatives .card-list');
    TestRunner.assert(!opsList.querySelector('.btn-recruit'),
      'no Recruit button on the Leader (or any operative)');
    // The Leader also appears before any recruited operatives.
    const op = { suit: 'spades', rank: 'A', value: 14 };
    App.getState().operatives.push(op);
    App.renderPersonnel();
    const rows = document.querySelectorAll('#section-operatives .card-row');
    TestRunner.assert(/Leader/i.test(rows[0].textContent), 'Leader renders first');
    TestRunner.assertEqual(rows.length, 2, 'Leader plus the one recruited operative');

    GameState.deleteSave('current');
  });

});

TestRunner.describe('app.js — Recruit-attempt attributer wiring (#49)', function () {

  function setupRecruitDOM() {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="setup" class="screen"></div>
      <div data-screen="game" class="screen">
        <section id="section-recruit-pool"><div class="card-list"></div></section>
        <section id="section-initiates"><div class="card-list"></div></section>
        <section id="section-operatives"><div class="card-list"></div></section>
        <section id="section-detained"><div class="card-list"></div></section>
        <div id="operations-list"></div>
        <div id="turn-log"></div>
      </div>
    `;
    App.beginGame();
  }

  TestRunner.test('clicking a Recruit button reaches recruit resolution with the chosen attributer', async function () {
    setupRecruitDOM();
    const state = App.getState();
    // Target value 9; the K operative (13 > 9) joins the Leader as eligible.
    state.recruitPool = [{ suit: 'hearts', rank: '9', value: 9 }];
    state.operatives  = [{ suit: 'spades', rank: 'K', value: 13 }];
    App.renderGameState();

    const btn = document.querySelector('#section-recruit-pool .btn-recruit');
    TestRunner.assert(btn, 'a Recruit button renders for the pooled card');

    const originalAttributer = UI.recruitAttributerChoice;
    const originalDie = UI.recruitDieChoice;
    let offered = null;
    // Multiple eligible → the picker is invoked; the player picks the operative.
    UI.recruitAttributerChoice = async (eligible) => { offered = eligible; return eligible.find((u) => u.rank === 'K'); };
    UI.recruitDieChoice = async () => 'd10';

    try {
      Dice.setProvider(() => Promise.resolve(10)); // 10 >= 9 → success
      btn.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      TestRunner.assert(offered && offered.some((u) => u.isLeader) && offered.some((u) => u.rank === 'K'),
        'the picker was offered the Leader plus the higher-value operative');
      TestRunner.assertEqual(App.getState().initiates.length, 1, 'success promoted the card to an Initiate');
      TestRunner.assertEqual(App.getState().recruitPool.length, 0, 'the card left the recruit pool');
      const log = document.getElementById('turn-log').textContent;
      TestRunner.assert(/K♠ recruited/.test(log), 'the chosen operative (K♠) is recorded in the log');
    } finally {
      Dice.setProvider(null);
      UI.recruitAttributerChoice = originalAttributer;
      UI.recruitDieChoice = originalDie;
      GameState.deleteSave('current');
    }
  });

  TestRunner.test('when only the Leader is eligible, clicking Recruit proceeds with no picker', async function () {
    setupRecruitDOM();
    const state = App.getState();
    // Ace target (15); no operative outranks it, so only the Leader qualifies.
    state.recruitPool = [{ suit: 'diamonds', rank: 'A', value: 15 }];
    state.operatives  = [{ suit: 'clubs', rank: 'K', value: 13 }];
    App.renderGameState();

    const btn = document.querySelector('#section-recruit-pool .btn-recruit');
    TestRunner.assert(btn, 'a Recruit button renders for the pooled Ace');

    const originalAttributer = UI.recruitAttributerChoice;
    const originalDie = UI.recruitDieChoice;
    let pickerCalls = 0;
    UI.recruitAttributerChoice = async (eligible) => { pickerCalls++; return eligible[0]; };
    UI.recruitDieChoice = async () => 'd10';

    try {
      Dice.setProvider(() => Promise.resolve(3)); // outcome irrelevant; roll math unchanged
      btn.click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      TestRunner.assertEqual(pickerCalls, 0, 'no picker shown when only the Leader qualifies');
      const log = document.getElementById('turn-log').textContent;
      TestRunner.assert(/Leader/.test(log), 'the Leader is recorded as the attributer');
    } finally {
      Dice.setProvider(null);
      UI.recruitAttributerChoice = originalAttributer;
      UI.recruitDieChoice = originalDie;
      GameState.deleteSave('current');
    }
  });

});

TestRunner.describe('app.js — Turn history log panel (#15)', function () {

  function setupGameDOM() {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="title" class="screen"></div>
      <div data-screen="setup" class="screen"></div>
      <div data-screen="game" class="screen">
        <span id="val-influence"></span>
        <span id="val-heat"></span>
        <span id="val-supplies"></span>
        <span id="val-turn"></span>
        <span id="val-leader"></span>
        <div id="operations-list"></div>
        <div id="turn-log">
          <p class="placeholder">Events will appear here as you play.</p>
        </div>
      </div>
    `;
  }

  TestRunner.test('continuing a saved game renders its stored turn history (past turns’ events)', function () {
    setupGameDOM();

    // A saved game that already has a multi-turn history.
    const state = GameState.createInitial();
    state.currentTurn = 3;
    state.turnLog = [
      { turn: 1, text: 'Minor Vandalism succeeded: +10 Influence.' },
      { turn: 2, text: 'Gather Supplies succeeded: +2 Supplies.' },
      { turn: 2, text: 'Crackdown! Safehouse raid (rolled 40 vs Heat).' },
    ];
    GameState.save(state, 'current');

    App.continueGame();

    const logEl = document.getElementById('turn-log');
    const text = logEl.textContent;
    // The panel must show every stored event, not the empty placeholder.
    TestRunner.assert(!/Events will appear here/.test(text),
      'placeholder is replaced once a loaded game has history');
    TestRunner.assert(/Minor Vandalism succeeded/.test(text), 'turn 1 event rendered');
    TestRunner.assert(/Gather Supplies succeeded/.test(text), 'turn 2 event rendered');
    TestRunner.assert(/Crackdown! Safehouse raid/.test(text), 'second turn-2 event rendered');
    // Per-turn breakdown: each entry is tagged with its turn number.
    const entries = logEl.querySelectorAll('.log-entry');
    TestRunner.assertEqual(entries.length, 3, 'one rendered entry per stored event');
    TestRunner.assert(/T1/.test(entries[0].textContent), 'first entry tagged with its turn (T1)');
    TestRunner.assert(/T2/.test(entries[2].textContent), 'later entry tagged with its turn (T2)');

    GameState.deleteSave('current');
  });

});

// ─── Influence Die Tiers ──────────────────────────────────────────────────────

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

// ─── Leader Skill Level ───────────────────────────────────────────────────────

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

// ─── Recruitment Pipeline ─────────────────────────────────────────────────────

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
    // The value-5 operative outranks the value-3 target, so the Leader and it
    // are both eligible (#49) — auto-pick the Leader so the die-choice modal
    // is the one on screen for chooseBaseDie.
    const originalAttributer = UI.recruitAttributerChoice;
    UI.recruitAttributerChoice = async (eligible) => eligible[0];
    const promise = App.attemptRecruit(0);
    // Let the attributer-picker stub resolve so the die-choice modal mounts.
    await new Promise((resolve) => setTimeout(resolve, 0));
    chooseBaseDie('d10');
    await promise;
    UI.recruitAttributerChoice = originalAttributer;
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

  // ── Tapping (#52) ───────────────────────────────────────────────────────────
  TestRunner.test('recruit attempt taps the chosen attributer, excluding it from further actions that turn', async function () {
    const state = bootTestGame();
    state.operatives = [];               // only the Leader is eligible
    state.leaderSkillLevel = 0;
    const target = { suit: 'hearts', rank: '4', value: 4 };
    state.recruitPool = [target];

    const originalDie = UI.recruitDieChoice;
    UI.recruitDieChoice = async () => 'd10';
    Dice.setProvider(() => Promise.resolve(9)); // 9 >= 4 → success (irrelevant to tap)
    try {
      await App.attemptRecruit(0);
      TestRunner.assert(App.getState().leader.tapped, 'the Leader attributer tapped after the Recruit Attempt');
      TestRunner.assert(!GameState.untappedPool(App.getState()).some((u) => u.isLeader),
        'the tapped Leader is excluded from the assignable pool');
    } finally {
      UI.recruitDieChoice = originalDie;
      Dice.setProvider(null);
    }
  });

  TestRunner.test('recruit attempt excludes an already-tapped Operative from attributer eligibility', async function () {
    const state = bootTestGame();
    const target = { suit: 'clubs', rank: '3', value: 3 };
    state.recruitPool = [target];
    // A high-value operative that would normally be an eligible attributer, but
    // it has already acted this turn (tapped) so only the Leader should qualify.
    const spent = { suit: 'spades', rank: 'K', value: 13, tapped: true };
    state.operatives = [spent];

    let offered = null;
    const originalAttributer = UI.recruitAttributerChoice;
    const originalDie = UI.recruitDieChoice;
    UI.recruitAttributerChoice = async (eligible) => { offered = eligible; return eligible[0]; };
    UI.recruitDieChoice = async () => 'd10';
    Dice.setProvider(() => Promise.resolve(9));
    try {
      await App.attemptRecruit(0);
      TestRunner.assert(offered === null,
        'the tapped high-value Operative was not in the eligible set, so no attributer picker was shown');
    } finally {
      UI.recruitAttributerChoice = originalAttributer;
      UI.recruitDieChoice = originalDie;
      Dice.setProvider(null);
    }
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
    // The value-10 operative outranks the value-8 target, so both it and the
    // Leader are eligible (#49) — auto-pick so the die-choice modal shows.
    const originalAttributer = UI.recruitAttributerChoice;
    UI.recruitAttributerChoice = async (eligible) => eligible[0];
    const promise = App.attemptRecruit(0);
    // Let the attributer-picker stub resolve so the die-choice modal mounts.
    await new Promise((resolve) => setTimeout(resolve, 0));
    chooseBaseDie('d10');
    await promise;
    UI.recruitAttributerChoice = originalAttributer;
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

  // ── Attributer eligibility + selection (#49) ────────────────────────────────
  // SPEC: The set of units that may perform a Recruit Attempt is the Leader
  // (always) plus every non-Leader Operative whose value strictly exceeds the
  // target Recruit's value. When only one qualifies (the Leader alone) no
  // picker is shown; when more than one qualifies the player chooses.

  TestRunner.test('[spec #49] Leader is always eligible — a high-value Ace with no qualifying operatives shows no picker and records the Leader', async function () {
    const state = bootTestGame({ leaderSkillLevel: 0 });
    // Ace (value 15). The K operative (13) does NOT outrank it, so only the
    // Leader is eligible.
    state.recruitPool = [{ suit: 'diamonds', rank: 'A', value: 15 }];
    state.operatives  = [{ suit: 'clubs', rank: 'K', value: 13 }];

    let pickerCalls = 0;
    const originalAttributer = UI.recruitAttributerChoice;
    UI.recruitAttributerChoice = async (eligible) => { pickerCalls++; return eligible[0]; };

    Dice.setProvider(() => Promise.resolve(3)); // roll math unchanged; outcome irrelevant here
    const promise = App.attemptRecruit(0);
    chooseBaseDie('d10'); // single eligible → die modal is on screen synchronously
    await promise;
    UI.recruitAttributerChoice = originalAttributer;
    Dice.setProvider(null);

    TestRunner.assertEqual(pickerCalls, 0,
      'no attributer picker is shown when only the Leader qualifies (even vs an Ace)');
    const log = document.getElementById('turn-log').textContent;
    TestRunner.assert(/Leader/.test(log), 'the log records the Leader as the attributer');
  });

  TestRunner.test('[spec #49] only Operatives with value > target join the Leader as eligible attributers', async function () {
    const state = bootTestGame({ leaderSkillLevel: 0 });
    state.recruitPool = [{ suit: 'hearts', rank: '9', value: 9 }];
    state.operatives  = [
      { suit: 'clubs',  rank: '8', value: 8  }, // 8 <= 9 → NOT eligible
      { suit: 'spades', rank: 'K', value: 13 }, // 13 > 9 → eligible
    ];

    let offered = null;
    const originalAttributer = UI.recruitAttributerChoice;
    UI.recruitAttributerChoice = async (eligible) => { offered = eligible; return eligible[0]; };

    Dice.setProvider(() => Promise.resolve(2));
    const promise = App.attemptRecruit(0);
    await new Promise((resolve) => setTimeout(resolve, 0)); // let the picker stub resolve
    chooseBaseDie('d10');
    await promise;
    UI.recruitAttributerChoice = originalAttributer;
    Dice.setProvider(null);

    TestRunner.assert(offered, 'a picker is offered when more than one unit qualifies');
    TestRunner.assertEqual(offered.length, 2, 'exactly the Leader plus the one higher-value operative');
    TestRunner.assert(offered.some((u) => u.isLeader), 'the Leader is always among the eligible');
    TestRunner.assert(offered.some((u) => u.rank === 'K'), 'the value-13 operative is eligible (> 9)');
    TestRunner.assert(!offered.some((u) => u.rank === '8'), 'the value-8 operative is NOT eligible (<= 9)');
  });

  TestRunner.test('[spec #49] the chosen attributer is recorded in the turn log; roll math unchanged', async function () {
    const state = bootTestGame({ leaderSkillLevel: 0 });
    state.recruitPool = [{ suit: 'hearts', rank: '5', value: 5 }];
    state.operatives  = [{ suit: 'spades', rank: 'K', value: 13 }]; // eligible (13 > 5)

    const originalAttributer = UI.recruitAttributerChoice;
    // Player picks the operative, not the Leader.
    UI.recruitAttributerChoice = async (eligible) => eligible.find((u) => !u.isLeader);

    // Roll 9 on d10 → 9 >= 5 → success (skill is NOT added to the roll).
    Dice.setProvider(() => Promise.resolve(9));
    const promise = App.attemptRecruit(0);
    await new Promise((resolve) => setTimeout(resolve, 0));
    chooseBaseDie('d10');
    await promise;
    UI.recruitAttributerChoice = originalAttributer;
    Dice.setProvider(null);

    const appState = App.getState();
    TestRunner.assertEqual(appState.initiates.length, 1, 'success promotes the card pool → Initiate');
    TestRunner.assertEqual(appState.recruitPool.length, 0, 'the card leaves the pool on success');
    TestRunner.assertEqual(appState.initiates[0].turnsRemaining, 2, 'Initiate carries the 2-turn timer');
    const log = document.getElementById('turn-log').textContent;
    TestRunner.assert(/K♠/.test(log), 'the chosen operative (K♠) is recorded as the attributer');
  });

});

TestRunner.describe('app.js — Backfill DOM-wiring tests (#10)', function () {

  // ADR-0002: every button whose handler calls into an engine module gets a
  // wiring test asserting the CLICK actually reaches that engine call, so a
  // disconnected/misrouted handler is caught. Each test below stubs the exact
  // engine method (or drives a real engine effect) and asserts the click hits
  // it — meaning it would fail if the handler's engine call were removed.

  // ── Recruit button → Dice engine (Dice.roll) ───────────────────────────────
  // The existing #49 tests assert the Recruit click's *outcome* via a Dice
  // provider; this one pins the wiring directly to the Dice.roll engine method.
  TestRunner.test('clicking a Recruit button reaches the Dice engine (Dice.roll)', async function () {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="setup" class="screen"></div>
      <div data-screen="game" class="screen">
        <section id="section-recruit-pool"><div class="card-list"></div></section>
        <section id="section-initiates"><div class="card-list"></div></section>
        <section id="section-operatives"><div class="card-list"></div></section>
        <section id="section-detained"><div class="card-list"></div></section>
        <div id="operations-list"></div>
        <div id="turn-log"></div>
      </div>
    `;
    App.beginGame();
    const state = App.getState();
    // Only the Leader is eligible (no Operatives), so no attributer picker fires.
    state.recruitPool = [{ suit: 'hearts', rank: '4', value: 4 }];
    state.operatives = [];
    App.renderGameState();

    const btn = document.querySelector('#section-recruit-pool .btn-recruit');
    TestRunner.assert(btn, 'a Recruit button renders for the pooled card');

    const originalDie = UI.recruitDieChoice;
    const originalRoll = Dice.roll;
    UI.recruitDieChoice = async () => 'd10';
    let rollCalls = 0;
    Dice.roll = async function () { rollCalls++; return 10; };

    try {
      btn.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      TestRunner.assert(rollCalls > 0,
        'the Recruit click reached Dice.roll (the dice engine)');
    } finally {
      UI.recruitDieChoice = originalDie;
      Dice.roll = originalRoll;
      GameState.deleteSave('current');
    }
  });

  // ── Begin button → Deck engine (Deck.shuffle) ──────────────────────────────
  TestRunner.test('clicking Begin reaches the Deck engine (Deck.shuffle) and starts a game', function () {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="setup" class="screen">
        <button id="btn-begin">Begin</button>
        <select id="input-mode-dice"><option value="digital" selected>Digital</option><option value="physical">Physical</option></select>
        <select id="input-mode-cards"><option value="digital" selected>Digital</option><option value="physical">Physical</option></select>
      </div>
      <div data-screen="game" class="screen"></div>
    `;
    App.init(); // wires the #btn-begin click handler

    const originalShuffle = Deck.shuffle;
    let shuffleCalls = 0;
    Deck.shuffle = function (deck) { shuffleCalls++; return originalShuffle(deck); };

    try {
      document.getElementById('btn-begin').click();
      TestRunner.assert(shuffleCalls > 0,
        'the Begin click reached Deck.shuffle (the deck engine)');
      TestRunner.assert(App.getState() !== null, 'Begin created a game state');
      TestRunner.assertEqual(App.currentScreen(), 'game', 'Begin routed to the game screen');
    } finally {
      Deck.shuffle = originalShuffle;
      GameState.deleteSave('current');
    }
  });

  // ── Continue button → state engine (GameState.load) ────────────────────────
  TestRunner.test('clicking Continue reaches the state engine (GameState.load)', function () {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="title" class="screen">
        <button id="btn-continue">Continue</button>
      </div>
      <div data-screen="game" class="screen">
        <span id="val-influence"></span>
      </div>
    `;
    // Seed a save so Continue is enabled and load returns a real state.
    GameState.save(GameState.createInitial(), 'current');
    App.init(); // reads the save (enables Continue) and wires the click handler

    // Install the spy AFTER init so init's own load call isn't counted.
    const originalLoad = GameState.load;
    let loadCalls = 0;
    GameState.load = function (slot) { loadCalls++; return originalLoad(slot); };

    try {
      document.getElementById('btn-continue').click();
      TestRunner.assert(loadCalls > 0,
        'the Continue click reached GameState.load (the state engine)');
      TestRunner.assertEqual(App.currentScreen(), 'game', 'Continue routed to the game screen');
    } finally {
      GameState.load = originalLoad;
      GameState.deleteSave('current');
    }
  });

  // ── Screen-router navigation (btn-new-game / btn-title-return) ──────────────
  // NOTE: these router buttons call App.showScreen (app-internal), not an
  // engine module, so there is no engine call to spy on — the wiring is
  // verified via the resulting active screen. (btn-continue, above, is the
  // engine-backed router path, reaching GameState.load.)
  TestRunner.test('clicking New Game routes to Setup; Return routes back to Title', function () {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="title" class="screen">
        <button id="btn-new-game">New Game</button>
      </div>
      <div data-screen="setup" class="screen"></div>
      <div data-screen="game" class="screen"></div>
      <div data-screen="victory" class="screen">
        <button id="btn-title-return">Return to Title</button>
      </div>
    `;
    App.init(); // wires the screen-router navigation buttons

    document.getElementById('btn-new-game').click();
    TestRunner.assertEqual(App.currentScreen(), 'setup',
      'New Game navigates the router to the Setup screen');

    document.getElementById('btn-title-return').click();
    TestRunner.assertEqual(App.currentScreen(), 'title',
      'Return navigates the router back to the Title screen');
  });

  // ── Input-mode toggle → Dice engine (via Begin → syncInputProviders) ───────
  // The Setup input-mode selects have no handler of their own; their values are
  // read by beginGame, which calls syncInputProviders → Dice.setProvider. This
  // proves the physical toggle actually re-wires the Dice engine to the manual
  // provider (a real effect), not just that a value was captured.
  TestRunner.test('the Setup dice Input-Mode toggle wires the physical provider into the Dice engine on Begin', async function () {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="setup" class="screen">
        <button id="btn-begin">Begin</button>
        <select id="input-mode-dice"><option value="digital">Digital</option><option value="physical">Physical</option></select>
        <select id="input-mode-cards"><option value="digital" selected>Digital</option><option value="physical">Physical</option></select>
      </div>
      <div data-screen="game" class="screen"></div>
    `;
    document.getElementById('input-mode-dice').value = 'physical';
    App.init();

    const originalDiceInput = UI.diceInput;
    let providerCalled = false;
    UI.diceInput = function () { providerCalled = true; return Promise.resolve(4); };

    try {
      document.getElementById('btn-begin').click();
      TestRunner.assertEqual(App.getState().inputMode.dice, 'physical',
        'the dice Input-Mode toggle was read into state on Begin');
      await Dice.roll('d6');
      TestRunner.assert(providerCalled,
        'Begin wired the physical provider into the Dice engine (syncInputProviders → Dice.setProvider)');
    } finally {
      UI.diceInput = originalDiceInput;
      Dice.setProvider(null);
      GameState.deleteSave('current');
    }
  });

});

// ─── Suite: app.js — shared roll-vs-threshold log formatter (#57) ────────────

TestRunner.describe('app.js — formatRollCheck shared d100 log formatter (#57)', function () {

  TestRunner.test('basic check (Heat only): roll and threshold in distinct spans + formula', function () {
    const frag = App.formatRollCheck(62, { heat: 15 });
    TestRunner.assertEqual(
      frag,
      'rolled <span class="roll-value">62</span>, needed ≤ <span class="roll-threshold">85</span> (base 100 − 15 Heat)',
      'renders roll/threshold spans and the base-100-minus-Heat formula'
    );
  });

  TestRunner.test('with an Influence bonus (Gather Supplies): + Influence term, higher threshold', function () {
    const frag = App.formatRollCheck(40, { heat: 10, influenceBonus: 20 });
    TestRunner.assertEqual(
      frag,
      'rolled <span class="roll-value">40</span>, needed ≤ <span class="roll-threshold">110</span> (base 100 − 10 Heat + 20 Influence)',
      'Influence bonus is added to the threshold and shown in the formula'
    );
  });

  TestRunner.test('with an operative-value bonus (Scout / Mid / Late ops): + operative value term', function () {
    const frag = App.formatRollCheck(70, { heat: 20, operativeBonus: 14 });
    TestRunner.assertEqual(
      frag,
      'rolled <span class="roll-value">70</span>, needed ≤ <span class="roll-threshold">94</span> (base 100 − 20 Heat + 14 operative value)',
      'operative-value bonus is added to the threshold and shown in the formula'
    );
  });

  TestRunner.test('roll and threshold use distinct span classes (visually distinguishable)', function () {
    const frag = App.formatRollCheck(50, { heat: 0 });
    TestRunner.assert(/class="roll-value"/.test(frag), 'roll uses the roll-value class');
    TestRunner.assert(/class="roll-threshold"/.test(frag), 'threshold uses the roll-threshold class');
  });

});

TestRunner.describe('app.js — Heat/Influence progress bars (#58)', function () {

  TestRunner.test('Heat bar fill is proportional to the 0–100 range', function () {
    const state = bootTestGame();
    try {
      state.heat = 0;
      App.renderResources();
      TestRunner.assertEqual(document.getElementById('bar-heat').style.width, '0%',
        'Heat 0 → empty bar');

      state.heat = 50;
      App.renderResources();
      TestRunner.assertEqual(document.getElementById('bar-heat').style.width, '50%',
        'Heat 50 → half-full bar');

      state.heat = 100;
      App.renderResources();
      TestRunner.assertEqual(document.getElementById('bar-heat').style.width, '100%',
        'Heat 100 → full bar');
    } finally {
      GameState.deleteSave('current');
    }
  });

  TestRunner.test('Influence bar fill is proportional to the 0–500 range', function () {
    const state = bootTestGame();
    try {
      state.influence = 0;
      App.renderResources();
      TestRunner.assertEqual(document.getElementById('bar-influence').style.width, '0%',
        'Influence 0 → empty bar');

      state.influence = 250;
      App.renderResources();
      TestRunner.assertEqual(document.getElementById('bar-influence').style.width, '50%',
        'Influence 250 → half-full bar');

      state.influence = 500;
      App.renderResources();
      TestRunner.assertEqual(document.getElementById('bar-influence').style.width, '100%',
        'Influence 500 → full bar');
    } finally {
      GameState.deleteSave('current');
    }
  });

  TestRunner.test('Supplies has no progress bar element', function () {
    bootTestGame();
    try {
      App.renderResources();
      TestRunner.assertEqual(document.getElementById('bar-supplies'), null,
        'Supplies has no fixed ceiling, so no bar');
    } finally {
      GameState.deleteSave('current');
    }
  });

});

TestRunner.describe('app.js — Operation tooltips (#61)', function () {

  // Game DOM including the Operations panel and personnel sections (so both
  // operation buttons and Recruit buttons can be exercised).
  function setupOpsDOM() {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="setup" class="screen"></div>
      <div data-screen="game" class="screen">
        <section id="section-recruit-pool"><div class="card-list"></div></section>
        <section id="section-initiates"><div class="card-list"></div></section>
        <section id="section-operatives"><div class="card-list"></div></section>
        <section id="section-detained"><div class="card-list"></div></section>
        <div id="operations-list"></div>
        <div id="turn-log"></div>
      </div>
    `;
    App.beginGame();
  }

  TestRunner.test('a base operation button carries a static rule tooltip (requirements, success, failure)', function () {
    setupOpsDOM();
    // Fresh game: the Leader bootstraps K=1 ops, so Minor Vandalism renders.
    App.renderGameState();

    const btn = document.querySelector('#operations-list [data-operation="minor_vandalism"]');
    TestRunner.assert(btn, 'Minor Vandalism button renders');
    const tip = btn.title;
    TestRunner.assert(/Requires/i.test(tip), 'tooltip states requirements');
    TestRunner.assert(/1 Operative/.test(tip), 'tooltip names the operative requirement');
    TestRunner.assert(/Success/i.test(tip) && /\+1 Influence, \+1 Heat/.test(tip),
      'tooltip states the success effect from OPERATION_META');
    TestRunner.assert(/Failure/i.test(tip) && /No effect/.test(tip),
      'tooltip states the failure consequence from OPERATION_META');
    TestRunner.assert(!/%/.test(tip), 'tooltip shows no computed success percentage');

    GameState.deleteSave('current');
  });

  TestRunner.test('a scouted Mid-Game Operation renders its own type-specific tooltip', function () {
    setupOpsDOM();
    const state = App.getState();
    // Make a Mid-Game Op executable: 6 operatives, 10 supplies, Influence >= 45.
    for (let i = 0; i < 6; i++) state.operatives.push({ suit: 'spades', rank: 'A', value: 14 });
    GameState.addSupplies(state, 10);
    GameState.addInfluence(state, 45);
    state.availableMidGameOps.push({ tableRoll: 1, type: 'embed_mole' });
    App.renderGameState();

    const btn = document.querySelector('#operations-list [data-operation="embed_mole"]');
    TestRunner.assert(btn, 'a scouted embed_mole Mid-Game Op renders a button');
    const tip = btn.title;
    TestRunner.assert(/Requires/i.test(tip) && /45 Influence/.test(tip),
      'tooltip states requirements incl. the Mid-Game Influence threshold');
    TestRunner.assert(/Success/i.test(tip) && /−35 Heat/.test(tip),
      'tooltip shows embed_mole\'s own success effect, not a placeholder');
    TestRunner.assert(/Failure/i.test(tip) && /captured/.test(tip),
      'tooltip shows the capture failure consequence');
    TestRunner.assert(!/%/.test(tip), 'no computed success percentage');

    GameState.deleteSave('current');
  });

  TestRunner.test('a scouted Late-Game Operation and Late-Game Scout render their own tooltips', function () {
    setupOpsDOM();
    const state = App.getState();
    // Make a Late-Game Op executable: 12 operatives, 20 supplies, Influence >= 90.
    for (let i = 0; i < 12; i++) state.operatives.push({ suit: 'spades', rank: 'A', value: 14 });
    GameState.addSupplies(state, 20);
    GameState.addInfluence(state, 90);
    state.availableLateGameOps.push({ tableRoll: 1, type: 'neutralize_leadership' });
    App.renderGameState();

    const lateBtn = document.querySelector('#operations-list [data-operation="neutralize_leadership"]');
    TestRunner.assert(lateBtn, 'a scouted neutralize_leadership Late-Game Op renders a button');
    const lateTip = lateBtn.title;
    TestRunner.assert(/Requires/i.test(lateTip) && /90 Influence/.test(lateTip),
      'tooltip states the Late-Game Influence threshold');
    TestRunner.assert(/Success/i.test(lateTip) && /−50 Heat/.test(lateTip),
      'tooltip shows neutralize_leadership\'s own success effect');
    TestRunner.assert(/Failure/i.test(lateTip) && /captured/.test(lateTip),
      'tooltip shows the capture failure consequence');

    // Late-Game Scout (a fixed op) is now available too and carries a tooltip.
    const scoutBtn = document.querySelector('#operations-list [data-operation="late_game_scout"]');
    TestRunner.assert(scoutBtn, 'Late-Game Scout button renders when affordable');
    TestRunner.assert(/Reveals a Late-Game Operation opportunity/.test(scoutBtn.title),
      'Late-Game Scout tooltip carries its own success effect');

    GameState.deleteSave('current');
  });

  TestRunner.test('Recruit buttons carry a static tooltip (Recruit is a d10/d12 roll-over, absent from OPERATION_META)', function () {
    setupOpsDOM();
    const state = App.getState();
    state.recruitPool.push({ suit: 'hearts', rank: '5', value: 5 });
    App.renderGameState();

    const btn = document.querySelector('#section-recruit-pool .btn-recruit');
    TestRunner.assert(btn, 'a Recruit button renders for a pooled card');
    const tip = btn.title;
    TestRunner.assert(/Recruit/i.test(tip), 'tooltip names the Recruit action');
    TestRunner.assert(/Success/i.test(tip) && /Initiate/.test(tip),
      'tooltip states the success effect (joins as an Initiate)');
    TestRunner.assert(/Failure/i.test(tip) && /pool/i.test(tip),
      'tooltip states the failure consequence (stays in the pool)');
    TestRunner.assert(!/%/.test(tip), 'no computed success percentage');

    GameState.deleteSave('current');
  });

});

TestRunner.describe('app.js — Always-visible grayed-out operations (#62)', function () {

  function setupOpsDOM() {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="setup" class="screen"></div>
      <div data-screen="game" class="screen">
        <section id="section-recruit-pool"><div class="card-list"></div></section>
        <section id="section-initiates"><div class="card-list"></div></section>
        <section id="section-operatives"><div class="card-list"></div></section>
        <section id="section-detained"><div class="card-list"></div></section>
        <div id="operations-list"></div>
        <div id="turn-log"></div>
      </div>
    `;
    App.beginGame();
  }

  TestRunner.test('every fixed operation button is present regardless of availability; unaffordable ones are disabled', function () {
    setupOpsDOM();
    // Fresh game: only the Leader is available, 0 supplies. Minor Vandalism /
    // Gather Supplies (K=1) are executable; the rest are not — but ALL render.
    App.renderGameState();

    for (const id of ['minor_vandalism', 'average_vandalism', 'significant_vandalism',
                      'gather_supplies', 'scout', 'late_game_scout']) {
      const btn = document.querySelector(`#operations-list [data-operation="${id}"]`);
      TestRunner.assert(btn, `${id} button is present in the DOM`);
    }

    const minor = document.querySelector('#operations-list [data-operation="minor_vandalism"]');
    TestRunner.assert(!minor.disabled, 'Minor Vandalism (affordable) is enabled');

    const sig = document.querySelector('#operations-list [data-operation="significant_vandalism"]');
    TestRunner.assert(sig.disabled, 'Significant Vandalism (unaffordable) is disabled/grayed');
    const scout = document.querySelector('#operations-list [data-operation="scout"]');
    TestRunner.assert(scout.disabled, 'Scout (unaffordable) is disabled/grayed');

    GameState.deleteSave('current');
  });

  TestRunner.test('a disabled operation cannot activate its engine handler when clicked', async function () {
    setupOpsDOM();
    App.renderGameState();

    const originalAssign = UI.assignOperatives;
    let assignCalled = false;
    UI.assignOperatives = async function () { assignCalled = true; return null; };
    try {
      const sig = document.querySelector('#operations-list [data-operation="significant_vandalism"]');
      sig.click();
      await new Promise((r) => setTimeout(r, 0));
      TestRunner.assert(!assignCalled, 'clicking a disabled op does not reach the assignment/engine flow');
    } finally {
      UI.assignOperatives = originalAssign;
      GameState.deleteSave('current');
    }
  });

  TestRunner.test('an unavailable operation gains a "Locked: needs X (have Y)" tooltip line naming every short resource', function () {
    setupOpsDOM();
    // Fresh game: pool is just the Leader (1 operative), 0 supplies.
    App.renderGameState();

    const sig = document.querySelector('#operations-list [data-operation="significant_vandalism"]');
    const tip = sig.title;
    TestRunner.assert(/Locked:/.test(tip), 'disabled op tooltip carries a Locked line');
    TestRunner.assert(/4 Operatives \(have 1\)/.test(tip),
      'Locked line names the Operatives shortfall (need 4, have 1)');
    TestRunner.assert(/5 Supplies \(have 0\)/.test(tip),
      'Locked line names the Supplies shortfall (need 5, have 0)');
    // Influence is not required here, so it must not appear in the Locked line.
    TestRunner.assert(!/Influence \(have/.test(tip),
      'Locked line omits resources that are not short');

    // An affordable op has no Locked line.
    const minor = document.querySelector('#operations-list [data-operation="minor_vandalism"]');
    TestRunner.assert(!/Locked:/.test(minor.title), 'an available op shows no Locked line');

    GameState.deleteSave('current');
  });

  TestRunner.test('a scouted Mid-Game Op short only on Influence names just Influence in its Locked line', function () {
    setupOpsDOM();
    const state = App.getState();
    // 6 operatives + 10 supplies satisfy headcount/supplies; Influence 0 < 45.
    for (let i = 0; i < 6; i++) state.operatives.push({ suit: 'spades', rank: 'A', value: 14 });
    GameState.addSupplies(state, 10);
    state.availableMidGameOps.push({ tableRoll: 1, type: 'embed_mole' });
    App.renderGameState();

    const btn = document.querySelector('#operations-list [data-operation="embed_mole"]');
    TestRunner.assert(btn && btn.disabled, 'embed_mole renders disabled while Influence is short');
    const tip = btn.title;
    TestRunner.assert(/Locked: needs 45 Influence \(have 0\)/.test(tip),
      'Locked line names only the Influence shortfall (need 45, have 0)');
    TestRunner.assert(!/Operatives \(have/.test(tip) && !/Supplies \(have/.test(tip),
      'Locked line omits the satisfied Operatives / Supplies requirements');

    GameState.deleteSave('current');
  });

});
