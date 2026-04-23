/**
 * Tests for Phase 3 UI: Operations List, Operative Selection, Operation
 * Execution Flow, and Resolution Modal.
 */

// ─── Suite: Operations List Rendering ────────────────────────────────────────

TestRunner.describe('Phase 3 UI — Operations List Rendering', function () {

  TestRunner.test('renderOperations creates an operation entry for each standard operation', function () {
    setupGameDOM();
    const state = bootTestGame({
      operatives: [
        { suit: 'hearts', rank: '5', value: 5 },
        { suit: 'clubs', rank: '6', value: 6 },
        { suit: 'spades', rank: '7', value: 7 },
        { suit: 'diamonds', rank: '8', value: 8 },
      ],
      supplies: 10,
    });
    App.renderOperations();
    const container = document.getElementById('operations-list');
    const entries = container.querySelectorAll('.operation-entry');
    // Should have: Minor Vandalism, Average Vandalism, Significant Vandalism,
    // Gather Supplies, Scout (5 standard operations; Recruit is already in personnel panel)
    TestRunner.assert(entries.length >= 5,
      'Should have at least 5 operation entries, got ' + entries.length);
  });

  TestRunner.test('operation shows "available" indicator when requirements met', function () {
    setupGameDOM();
    const state = bootTestGame({
      operatives: [{ suit: 'hearts', rank: '5', value: 5 }],
      supplies: 0,
    });
    // Select the operative so Minor Vandalism is available
    App.selectOperative(0);
    App.renderOperations();
    const container = document.getElementById('operations-list');
    const minorEntry = container.querySelector('[data-operation="minor_vandalism"]');
    TestRunner.assert(minorEntry !== null, 'Minor Vandalism entry should exist');
    TestRunner.assert(minorEntry.classList.contains('op-available'),
      'Minor Vandalism should have op-available class');
    App.deselectOperative(0);
  });

  TestRunner.test('operation shows "unavailable" indicator when requirements not met', function () {
    setupGameDOM();
    const state = bootTestGame({
      operatives: [],
      supplies: 0,
    });
    App.renderOperations();
    const container = document.getElementById('operations-list');
    const minorEntry = container.querySelector('[data-operation="minor_vandalism"]');
    TestRunner.assert(minorEntry !== null, 'Minor Vandalism entry should exist');
    TestRunner.assert(minorEntry.classList.contains('op-unavailable'),
      'Minor Vandalism should have op-unavailable class when no operatives selected');
  });

  TestRunner.test('execute button is disabled when requirements not met', function () {
    setupGameDOM();
    const state = bootTestGame({
      operatives: [],
      supplies: 0,
    });
    App.renderOperations();
    const container = document.getElementById('operations-list');
    const btn = container.querySelector('[data-operation="minor_vandalism"] .btn-execute');
    TestRunner.assert(btn !== null, 'Execute button should exist');
    TestRunner.assert(btn.disabled === true, 'Execute button should be disabled');
  });

  TestRunner.test('execute button is enabled when requirements met and enough operatives selected', function () {
    setupGameDOM();
    const state = bootTestGame({
      operatives: [{ suit: 'hearts', rank: '5', value: 5 }],
      supplies: 0,
    });
    App.selectOperative(0);
    App.renderOperations();
    const container = document.getElementById('operations-list');
    const btn = container.querySelector('[data-operation="minor_vandalism"] .btn-execute');
    TestRunner.assert(btn !== null, 'Execute button should exist');
    TestRunner.assert(btn.disabled === false, 'Execute button should be enabled');
    App.deselectOperative(0);
  });

});

// ─── Suite: Operative Selection ──────────────────────────────────────────────

TestRunner.describe('Phase 3 UI — Operative Selection', function () {

  TestRunner.test('clicking an operative toggles its selection state', function () {
    setupGameDOM();
    const state = bootTestGame({
      operatives: [{ suit: 'hearts', rank: '5', value: 5 }],
    });
    // Select
    App.selectOperative(0);
    let selected = App.getSelectedOperatives();
    TestRunner.assertEqual(selected.length, 1, 'should have 1 selected');
    // Deselect
    App.deselectOperative(0);
    selected = App.getSelectedOperatives();
    TestRunner.assertEqual(selected.length, 0, 'should have 0 selected after deselect');
  });

  TestRunner.test('getSelectedOperatives returns only selected operatives', function () {
    setupGameDOM();
    const state = bootTestGame({
      operatives: [
        { suit: 'hearts', rank: '5', value: 5 },
        { suit: 'clubs', rank: '6', value: 6 },
        { suit: 'spades', rank: '7', value: 7 },
      ],
    });
    App.selectOperative(0);
    App.selectOperative(2);
    const selected = App.getSelectedOperatives();
    TestRunner.assertEqual(selected.length, 2, 'should have 2 selected');
    TestRunner.assertEqual(selected[0].value, 5);
    TestRunner.assertEqual(selected[1].value, 7);
    // Cleanup
    App.deselectOperative(0);
    App.deselectOperative(2);
  });

  TestRunner.test('selected operatives have a visual indicator class', function () {
    setupGameDOM();
    const state = bootTestGame({
      operatives: [
        { suit: 'hearts', rank: '5', value: 5 },
        { suit: 'clubs', rank: '6', value: 6 },
      ],
    });
    App.selectOperative(0);
    App.renderPersonnel();
    const section = document.getElementById('section-operatives');
    const rows = section.querySelectorAll('.card-row');
    TestRunner.assert(rows[0].classList.contains('selected'),
      'first operative card-row should have selected class');
    TestRunner.assert(!rows[1].classList.contains('selected'),
      'second operative card-row should NOT have selected class');
    App.deselectOperative(0);
  });

});

// ─── Suite: Operation Execution Flow ─────────────────────────────────────────

TestRunner.describe('Phase 3 UI — Operation Execution Flow', function () {

  TestRunner.test('executing Minor Vandalism with selected operative calls resolveMinorVandalism', async function () {
    setupGameDOM();
    const state = bootTestGame({ heat: 0, influence: 0, supplies: 0 });
    state.operatives = [{ suit: 'hearts', rank: '5', value: 5 }];
    App.selectOperative(0);
    // d100=10 (success), d4=2 (no recruit)
    let i = 0;
    Dice.setProvider(() => Promise.resolve([10, 2][i++]));
    await App.executeOperation('minor_vandalism');
    Dice.setProvider(null);
    // If it resolved, influence should be +1
    TestRunner.assertEqual(App.getState().influence, 1, 'influence should be +1 after minor vandalism success');
    // Close any open modal
    const overlay = document.querySelector('.modal-overlay');
    if (overlay) overlay.remove();
  });

  TestRunner.test('after execution, selected operatives are deselected', async function () {
    setupGameDOM();
    const state = bootTestGame({ heat: 0, influence: 0, supplies: 0 });
    state.operatives = [{ suit: 'hearts', rank: '5', value: 5 }];
    App.selectOperative(0);
    // d100=10 (success), d4=2 (no recruit)
    let i = 0;
    Dice.setProvider(() => Promise.resolve([10, 2][i++]));
    await App.executeOperation('minor_vandalism');
    Dice.setProvider(null);
    const selected = App.getSelectedOperatives();
    TestRunner.assertEqual(selected.length, 0, 'no operatives should be selected after execution');
    // Close any open modal
    const overlay = document.querySelector('.modal-overlay');
    if (overlay) overlay.remove();
  });

  TestRunner.test('after execution, game state is saved and UI re-rendered', async function () {
    setupGameDOM();
    const state = bootTestGame({ heat: 0, influence: 0, supplies: 0 });
    state.operatives = [{ suit: 'hearts', rank: '5', value: 5 }];
    App.selectOperative(0);
    // d100=10 (success), d4=2 (no recruit)
    let i = 0;
    Dice.setProvider(() => Promise.resolve([10, 2][i++]));
    await App.executeOperation('minor_vandalism');
    Dice.setProvider(null);
    // Check state was saved by loading from storage
    const saved = GameState.load('current');
    TestRunner.assertEqual(saved.influence, 1, 'saved state should reflect +1 influence');
    // Close any open modal
    const overlay = document.querySelector('.modal-overlay');
    if (overlay) overlay.remove();
  });

});

// ─── Suite: Resolution Modal ─────────────────────────────────────────────────

TestRunner.describe('Phase 3 UI — Resolution Modal', function () {

  TestRunner.test('UI.showResolutionModal creates a modal overlay', async function () {
    const results = {
      operationName: 'Minor Vandalism',
      rolls: [{ value: 10, target: 80, success: true }],
      effects: ['+1 influence', '+1 heat'],
      playerChoice: null,
    };
    // Don't await — just fire off the modal and check DOM
    const promise = UI.showResolutionModal(results);
    const overlay = document.querySelector('.modal-overlay');
    TestRunner.assert(overlay !== null, 'modal overlay should be created');
    // Cleanup
    const confirmBtn = overlay.querySelector('.btn-confirm');
    if (confirmBtn) confirmBtn.click();
    await promise;
  });

  TestRunner.test('modal displays operation name and roll results', async function () {
    const results = {
      operationName: 'Minor Vandalism',
      rolls: [{ value: 10, target: 80, success: true }],
      effects: ['+1 influence'],
      playerChoice: null,
    };
    const promise = UI.showResolutionModal(results);
    const overlay = document.querySelector('.modal-overlay');
    const text = overlay.textContent;
    TestRunner.assert(text.includes('Minor Vandalism'), 'should display operation name');
    TestRunner.assert(text.includes('10'), 'should display roll value');
    TestRunner.assert(text.includes('80'), 'should display target number');
    const confirmBtn = overlay.querySelector('.btn-confirm');
    if (confirmBtn) confirmBtn.click();
    await promise;
  });

  TestRunner.test('modal displays success/failure outcome', async function () {
    const results = {
      operationName: 'Test Op',
      rolls: [{ value: 90, target: 80, success: false }],
      effects: [],
      playerChoice: null,
    };
    const promise = UI.showResolutionModal(results);
    const overlay = document.querySelector('.modal-overlay');
    const text = overlay.textContent;
    TestRunner.assert(text.toLowerCase().includes('fail'), 'should display failure outcome');
    const confirmBtn = overlay.querySelector('.btn-confirm');
    if (confirmBtn) confirmBtn.click();
    await promise;
  });

  TestRunner.test('confirm button removes modal and resolves promise', async function () {
    const results = {
      operationName: 'Test Op',
      rolls: [{ value: 10, target: 80, success: true }],
      effects: [],
      playerChoice: null,
    };
    const promise = UI.showResolutionModal(results);
    const overlay = document.querySelector('.modal-overlay');
    const confirmBtn = overlay.querySelector('.btn-confirm');
    TestRunner.assert(confirmBtn !== null, 'confirm button should exist');
    confirmBtn.click();
    await promise;
    const afterOverlay = document.querySelector('.modal-overlay');
    TestRunner.assert(afterOverlay === null, 'modal should be removed after confirm');
  });

  TestRunner.test('for failures with player choice, modal shows choice buttons', async function () {
    const results = {
      operationName: 'Significant Vandalism',
      rolls: [{ value: 99, target: 10, success: false }],
      effects: ['1 operative detained'],
      playerChoice: {
        prompt: 'Choose additional penalty:',
        options: [
          { label: 'Detain 1 more operative', value: 'detain' },
          { label: 'Lose 2 supplies', value: 'supplies' },
        ],
      },
    };
    const promise = UI.showResolutionModal(results);
    const overlay = document.querySelector('.modal-overlay');
    const choiceBtns = overlay.querySelectorAll('.btn-choice');
    TestRunner.assertEqual(choiceBtns.length, 2, 'should have 2 choice buttons');
    TestRunner.assert(choiceBtns[0].textContent.includes('Detain'), 'first choice label');
    // Click the first choice to resolve
    choiceBtns[0].click();
    const choiceValue = await promise;
    TestRunner.assertEqual(choiceValue, 'detain', 'promise resolves with chosen value');
  });

  TestRunner.test('choice selection resolves the promise with the chosen value', async function () {
    const results = {
      operationName: 'Scout',
      rolls: [{ value: 90, target: 15, success: false }],
      effects: ['1 operative detained'],
      playerChoice: {
        prompt: 'Choose penalty:',
        options: [
          { label: 'Detain', value: 'detain' },
          { label: 'Lose supplies', value: 'supplies' },
        ],
      },
    };
    const promise = UI.showResolutionModal(results);
    const overlay = document.querySelector('.modal-overlay');
    const choiceBtns = overlay.querySelectorAll('.btn-choice');
    choiceBtns[1].click();
    const choiceValue = await promise;
    TestRunner.assertEqual(choiceValue, 'supplies', 'promise resolves with supplies choice');
  });

});
