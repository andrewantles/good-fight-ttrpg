/* global TestRunner, GameState */

TestRunner.describe('state.js — Game State Management', () => {

  TestRunner.test('reset() produces a valid initial state with all required fields', () => {
    const state = GameState.createInitial();
    TestRunner.assertEqual(state.influence, 0);
    TestRunner.assertEqual(state.heat, 0);
    TestRunner.assertEqual(state.supplies, 0);
    TestRunner.assertEqual(state.currentTurn, 1);
    TestRunner.assertEqual(state.leaderSkillLevel, 0);
    TestRunner.assert(Array.isArray(state.resistanceValues));
    TestRunner.assert(Array.isArray(state.regimeType));
    TestRunner.assert(Array.isArray(state.recruitDeck));
    TestRunner.assert(Array.isArray(state.recruitPool));
    TestRunner.assert(Array.isArray(state.initiates));
    TestRunner.assert(Array.isArray(state.operatives));
    TestRunner.assert(Array.isArray(state.detainedOperatives));
    TestRunner.assert(Array.isArray(state.assignments));
    TestRunner.assert(Array.isArray(state.multiTurnOps));
    TestRunner.assert(Array.isArray(state.availableMidGameOps));
    TestRunner.assert(Array.isArray(state.availableLateGameOps));
    TestRunner.assert(Array.isArray(state.completedLateGameOps));
    TestRunner.assert(Array.isArray(state.turnLog));
    TestRunner.assert(state.inputMode !== undefined);
    TestRunner.assertEqual(state.inputMode.dice, 'digital');
    TestRunner.assertEqual(state.inputMode.cards, 'digital');
  });

  TestRunner.test('save() + load() round-trips state without data loss', () => {
    const state = GameState.createInitial();
    state.influence = 42;
    state.heat = 17;
    state.supplies = 5;
    state.currentTurn = 3;
    state.resistanceValues = ['Liberty & Freedom'];
    state.regimeType = ['Surveillance State'];

    GameState.save(state, 'test-slot-1');
    const loaded = GameState.load('test-slot-1');

    TestRunner.assertEqual(loaded.influence, 42);
    TestRunner.assertEqual(loaded.heat, 17);
    TestRunner.assertEqual(loaded.supplies, 5);
    TestRunner.assertEqual(loaded.currentTurn, 3);
    TestRunner.assertDeepEqual(loaded.resistanceValues, ['Liberty & Freedom']);
    TestRunner.assertDeepEqual(loaded.regimeType, ['Surveillance State']);

    // Clean up
    GameState.deleteSave('test-slot-1');
  });

  TestRunner.test('setInfluence() clamps to 0-500 range', () => {
    const state = GameState.createInitial();
    GameState.setInfluence(state, 999);
    TestRunner.assertEqual(state.influence, 500);
    GameState.setInfluence(state, -50);
    TestRunner.assertEqual(state.influence, 0);
    GameState.setInfluence(state, 250);
    TestRunner.assertEqual(state.influence, 250);
  });

  TestRunner.test('setHeat() clamps to 0-100 range', () => {
    const state = GameState.createInitial();
    GameState.setHeat(state, 200);
    TestRunner.assertEqual(state.heat, 100);
    GameState.setHeat(state, -10);
    TestRunner.assertEqual(state.heat, 0);
    GameState.setHeat(state, 55);
    TestRunner.assertEqual(state.heat, 55);
  });

  TestRunner.test('setSupplies() cannot go below 0', () => {
    const state = GameState.createInitial();
    GameState.setSupplies(state, -5);
    TestRunner.assertEqual(state.supplies, 0);
    GameState.setSupplies(state, 10);
    TestRunner.assertEqual(state.supplies, 10);
  });

  TestRunner.test('multiple save slots are independent', () => {
    const state1 = GameState.createInitial();
    state1.influence = 100;
    const state2 = GameState.createInitial();
    state2.influence = 200;

    GameState.save(state1, 'test-slot-a');
    GameState.save(state2, 'test-slot-b');

    const loaded1 = GameState.load('test-slot-a');
    const loaded2 = GameState.load('test-slot-b');

    TestRunner.assertEqual(loaded1.influence, 100);
    TestRunner.assertEqual(loaded2.influence, 200);

    // Clean up
    GameState.deleteSave('test-slot-a');
    GameState.deleteSave('test-slot-b');
  });

  TestRunner.test('loading nonexistent slot returns null', () => {
    const result = GameState.load('nonexistent-slot-xyz');
    TestRunner.assertEqual(result, null);
  });

  TestRunner.test('input mode persists across save/load', () => {
    const state = GameState.createInitial();
    state.inputMode.dice = 'physical';
    state.inputMode.cards = 'physical';

    GameState.save(state, 'test-slot-mode');
    const loaded = GameState.load('test-slot-mode');

    TestRunner.assertEqual(loaded.inputMode.dice, 'physical');
    TestRunner.assertEqual(loaded.inputMode.cards, 'physical');

    GameState.deleteSave('test-slot-mode');
  });

  TestRunner.test('addInfluence() and addHeat() apply deltas with clamping', () => {
    const state = GameState.createInitial();
    GameState.addInfluence(state, 50);
    TestRunner.assertEqual(state.influence, 50);
    GameState.addInfluence(state, -30);
    TestRunner.assertEqual(state.influence, 20);
    GameState.addInfluence(state, -100);
    TestRunner.assertEqual(state.influence, 0);

    GameState.addHeat(state, 80);
    TestRunner.assertEqual(state.heat, 80);
    GameState.addHeat(state, 30);
    TestRunner.assertEqual(state.heat, 100);
    GameState.addHeat(state, -60);
    TestRunner.assertEqual(state.heat, 40);
  });

  TestRunner.test('addSupplies() applies deltas with floor of 0', () => {
    const state = GameState.createInitial();
    GameState.addSupplies(state, 10);
    TestRunner.assertEqual(state.supplies, 10);
    GameState.addSupplies(state, -3);
    TestRunner.assertEqual(state.supplies, 7);
    GameState.addSupplies(state, -100);
    TestRunner.assertEqual(state.supplies, 0);
  });
});
