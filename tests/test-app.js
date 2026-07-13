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

TestRunner.describe('app.js — Minor Vandalism wiring (#33)', function () {

  TestRunner.test('renders a Minor Vandalism button when executable and clicking it reaches resolveMinorVandalism', async function () {
    const container = document.getElementById('app');
    container.innerHTML = `
      <div data-screen="setup" class="screen"></div>
      <div data-screen="game" class="screen">
        <div id="operations-list"></div>
      </div>
    `;

    App.beginGame(); // establishes gameState (starts with no operatives)

    // With zero operatives available, Minor Vandalism is not executable and
    // no button should render.
    App.renderGameState();
    TestRunner.assert(
      !document.querySelector('#operations-list [data-operation="minor_vandalism"]'),
      'no Minor Vandalism button when there are no available operatives'
    );

    // Give the player one available operative so Minor Vandalism becomes executable.
    const operative = { suit: 'spades', rank: 'A', value: 14 };
    App.getState().operatives.push(operative);
    App.renderGameState();

    const btn = document.querySelector('#operations-list [data-operation="minor_vandalism"]');
    TestRunner.assert(btn, 'Minor Vandalism button should render when executable');

    // Stub the picker to auto-return the operative and the engine call to record it.
    const originalAssign = UI.assignOperatives;
    const originalResolve = Operations.resolveMinorVandalism;
    let received = null;
    UI.assignOperatives = async function (count, available) {
      return available.slice(0, count);
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

    App.beginGame(); // establishes gameState (starts with no operatives)

    // With zero operatives available, Gather Supplies is not executable and
    // no button should render.
    App.renderGameState();
    TestRunner.assert(
      !document.querySelector('#operations-list [data-operation="gather_supplies"]'),
      'no Gather Supplies button when there are no available operatives'
    );

    // Give the player one available operative so Gather Supplies becomes executable.
    const operative = { suit: 'clubs', rank: 'K', value: 13 };
    App.getState().operatives.push(operative);
    App.renderGameState();

    const btn = document.querySelector('#operations-list [data-operation="gather_supplies"]');
    TestRunner.assert(btn, 'Gather Supplies button should render when executable');

    // Stub the picker to auto-return the operative and the engine call to record it.
    const originalAssign = UI.assignOperatives;
    const originalResolve = Operations.resolveGatherSupplies;
    let received = null;
    UI.assignOperatives = async function (count, available) {
      return available.slice(0, count);
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
    const originalResolve = Operations.resolveSignificantVandalism;
    let received = null;
    UI.assignOperatives = async function (count, available) {
      return available.slice(0, count);
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
      return available.slice(0, count);
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

});
