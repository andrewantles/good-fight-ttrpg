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
