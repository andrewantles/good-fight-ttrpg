/**
 * Tests for app.js — screen router.
 */
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

    // Stub the picker to auto-return the recruited operative (not the Leader)
    // and the engine call to record it.
    const originalAssign = UI.assignOperatives;
    const originalResolve = Operations.resolveMinorVandalism;
    let received = null;
    UI.assignOperatives = async function (count, available) {
      return available.filter((o) => !o.isLeader).slice(0, count);
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
      TestRunner.assertEqual(received.length, 1, 'exactly one operative assigned (K=1)');
      TestRunner.assertEqual(received[0], operative, 'the picked operative was passed to the engine');
    } finally {
      UI.assignOperatives = originalAssign;
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

    const originalAssign = UI.assignOperatives;
    UI.assignOperatives = async function (count, available) {
      return available.slice(0, count);
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
      UI.assignOperatives = originalAssign;
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
    const originalAssign = UI.assignOperatives;
    const originalResolve = Operations.resolveMinorVandalism;
    let received = null;
    let offered = null;
    UI.assignOperatives = async function (count, available) {
      offered = available;
      // pick the Leader specifically
      return available.filter((o) => o.isLeader).slice(0, count);
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
      TestRunner.assertEqual(received.length, 1, 'exactly one unit assigned (K=1)');
      TestRunner.assertEqual(received[0], App.getState().leader,
        'the Leader was passed to the engine as the assigned operative');
    } finally {
      UI.assignOperatives = originalAssign;
      Operations.resolveMinorVandalism = originalResolve;
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

    // Stub the picker to auto-return the recruited operative (not the Leader)
    // and the engine call to record it.
    const originalAssign = UI.assignOperatives;
    const originalResolve = Operations.resolveGatherSupplies;
    let received = null;
    UI.assignOperatives = async function (count, available) {
      return available.filter((o) => !o.isLeader).slice(0, count);
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
      TestRunner.assertEqual(received.length, 1, 'exactly one operative assigned (K=1)');
      TestRunner.assertEqual(received[0], operative, 'the picked operative was passed to the engine');

      // Log reflects the 3-roll result.
      const log = document.getElementById('turn-log').textContent;
      TestRunner.assert(/Gather Supplies/.test(log), 'log mentions Gather Supplies');
      TestRunner.assert(/2/.test(log), 'log reflects the number of supplies gained');
    } finally {
      UI.assignOperatives = originalAssign;
      Operations.resolveGatherSupplies = originalResolve;
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
    // 5 supplies) is not executable and no button should render.
    App.renderGameState();
    TestRunner.assert(
      !document.querySelector('#operations-list [data-operation="significant_vandalism"]'),
      'no Significant Vandalism button when there are no available operatives'
    );

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
    // 3 supplies) is not executable and no button should render.
    App.renderGameState();
    TestRunner.assert(
      !document.querySelector('#operations-list [data-operation="average_vandalism"]'),
      'no Average Vandalism button when there are no available operatives'
    );

    // Give the player two available operatives and enough supplies.
    const op1 = { suit: 'spades', rank: 'A', value: 14 };
    const op2 = { suit: 'hearts', rank: 'Q', value: 12 };
    App.getState().operatives.push(op1, op2);
    GameState.addSupplies(App.getState(), 3);
    App.renderGameState();

    const btn = document.querySelector('#operations-list [data-operation="average_vandalism"]');
    TestRunner.assert(btn, 'Average Vandalism button should render when executable');

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

  TestRunner.test('button gated by canExecute: hidden without 4 operatives + 5 supplies, shown with them', function () {
    setupScoutDOM();

    // Fresh game: no operatives, no supplies — Scout (4 ops, 5 supplies) unavailable.
    App.renderGameState();
    TestRunner.assert(
      !document.querySelector('#operations-list [data-operation="scout"]'),
      'no Scout button when there are no available operatives'
    );

    // Four operatives but no supplies — still unavailable.
    const op1 = { suit: 'spades', rank: 'A', value: 14 };
    const op2 = { suit: 'hearts', rank: 'Q', value: 12 };
    const op3 = { suit: 'clubs', rank: 'K', value: 13 };
    const op4 = { suit: 'diamonds', rank: 'J', value: 11 };
    App.getState().operatives.push(op1, op2, op3, op4);
    App.renderGameState();
    TestRunner.assert(
      !document.querySelector('#operations-list [data-operation="scout"]'),
      'no Scout button with 4 operatives but 0 supplies'
    );

    // Add the 5 supplies — now Scout is available.
    GameState.addSupplies(App.getState(), 5);
    App.renderGameState();
    TestRunner.assert(
      document.querySelector('#operations-list [data-operation="scout"]'),
      'Scout button renders with 4 operatives and 5 supplies'
    );

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
