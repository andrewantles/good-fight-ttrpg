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
    TestRunner.assertEqual(state.difficulty, 'medium');
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

  TestRunner.test('createInitial() seeds a Leader Joker held outside operatives (value 0)', () => {
    const state = GameState.createInitial();
    TestRunner.assert(state.leader, 'state.leader exists');
    TestRunner.assertEqual(state.leader.isLeader, true, 'leader is flagged isLeader');
    TestRunner.assertEqual(state.leader.suit, 'joker');
    TestRunner.assertEqual(state.leader.rank, 'Joker');
    TestRunner.assertEqual(state.leader.value, 0, 'leader value starts at 0');
    // The Leader is NOT one of the operatives — it lives in its own field.
    TestRunner.assertArrayLength(state.operatives, 0, 'operatives starts empty');
    TestRunner.assert(!state.operatives.includes(state.leader),
      'leader is held outside state.operatives');
  });

  TestRunner.test('leader persists through save/load', () => {
    const state = GameState.createInitial();
    GameState.save(state, 'test-slot-leader');
    const loaded = GameState.load('test-slot-leader');
    TestRunner.assert(loaded.leader, 'loaded state has a leader');
    TestRunner.assertEqual(loaded.leader.isLeader, true);
    TestRunner.assertEqual(loaded.leader.suit, 'joker');
    TestRunner.assertEqual(loaded.leader.rank, 'Joker');
    TestRunner.assertEqual(loaded.leader.value, 0);
    GameState.deleteSave('test-slot-leader');
  });

  TestRunner.test('assignablePool() is [leader, ...operatives]', () => {
    const state = GameState.createInitial();
    const op = { suit: 'spades', rank: 'A', value: 14 };
    state.operatives.push(op);
    const pool = GameState.assignablePool(state);
    TestRunner.assertArrayLength(pool, 2, 'leader plus the one operative');
    TestRunner.assertEqual(pool[0], state.leader, 'leader is first in the pool');
    TestRunner.assertEqual(pool[1], op, 'operatives follow the leader');
  });

  TestRunner.test('assignablePool() tolerates old saves with no leader field (back-compat)', () => {
    // A save that predates state.leader: no leader field at all.
    const legacy = GameState.createInitial();
    delete legacy.leader;
    const op = { suit: 'clubs', rank: 'K', value: 13 };
    legacy.operatives.push(op);
    const pool = GameState.assignablePool(legacy);
    TestRunner.assertArrayLength(pool, 1, 'just the operatives when no leader present');
    TestRunner.assertEqual(pool[0], op);
  });

  TestRunner.test('updateLeaderSkill() raises leaderSkillLevel to the highest operative value', () => {
    const state = GameState.createInitial();
    state.operatives = [
      { suit: 'hearts', rank: '5', value: 5 },
      { suit: 'spades', rank: 'K', value: 13 },
      { suit: 'diamonds', rank: '8', value: 8 },
    ];
    GameState.updateLeaderSkill(state);
    TestRunner.assertEqual(state.leaderSkillLevel, 13);
  });

  TestRunner.test('updateLeaderSkill() is a monotonic high-water mark (never drops)', () => {
    const state = GameState.createInitial();
    state.operatives = [{ suit: 'spades', rank: 'K', value: 13 }];
    GameState.updateLeaderSkill(state);
    TestRunner.assertEqual(state.leaderSkillLevel, 13);
    // Operative lost/detained — the mark must hold.
    state.operatives = [];
    GameState.updateLeaderSkill(state);
    TestRunner.assertEqual(state.leaderSkillLevel, 13, 'ratchet: must not reset to 0');
  });

  TestRunner.test('updateLeaderSkill() syncs leader.value to the skill level (feeds checkWithOperatives)', () => {
    const state = GameState.createInitial();
    state.operatives = [{ suit: 'clubs', rank: 'J', value: 11 }];
    GameState.updateLeaderSkill(state);
    TestRunner.assertEqual(state.leader.value, 11, 'leader contributes its skill to operation math');
  });

  TestRunner.test('updateLeaderSkill() stays at 0 with no operatives and no prior mark', () => {
    const state = GameState.createInitial();
    GameState.updateLeaderSkill(state);
    TestRunner.assertEqual(state.leaderSkillLevel, 0);
    TestRunner.assertEqual(state.leader.value, 0);
  });

  TestRunner.test('updateLeaderSkill() tolerates saves that predate state.leader (no crash)', () => {
    const legacy = GameState.createInitial();
    delete legacy.leader;
    legacy.operatives = [{ suit: 'hearts', rank: 'A', value: 15 }];
    GameState.updateLeaderSkill(legacy);
    TestRunner.assertEqual(legacy.leaderSkillLevel, 15, 'still ratchets skill without a leader field');
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

  TestRunner.test('peakInfluence tracks the highest Influence ever reached (for the Victory screen)', () => {
    const state = GameState.createInitial();
    TestRunner.assertEqual(state.peakInfluence, 0, 'starts at 0');
    GameState.setInfluence(state, 120);
    TestRunner.assertEqual(state.peakInfluence, 120, 'rises with Influence');
    GameState.addInfluence(state, 80);
    TestRunner.assertEqual(state.peakInfluence, 200, 'tracks via addInfluence too');
    GameState.setInfluence(state, 50);
    TestRunner.assertEqual(state.influence, 50, 'Influence dropped');
    TestRunner.assertEqual(state.peakInfluence, 200, 'peak holds the earlier maximum');
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

  TestRunner.test('listSaves() reports every saved slot by name and drops deleted ones', () => {
    const a = GameState.createInitial();
    const b = GameState.createInitial();
    GameState.save(a, 'ls-slot-a');
    GameState.save(b, 'ls-slot-b');

    let names = GameState.listSaves();
    TestRunner.assert(names.includes('ls-slot-a'), 'listSaves includes first saved slot');
    TestRunner.assert(names.includes('ls-slot-b'), 'listSaves includes second saved slot');
    // Names are the bare slot name, without the storage prefix.
    TestRunner.assert(!names.some((n) => n.startsWith('good-fight-save-')),
      'listSaves strips the storage prefix');

    GameState.deleteSave('ls-slot-a');
    names = GameState.listSaves();
    TestRunner.assert(!names.includes('ls-slot-a'), 'deleted slot no longer listed');
    TestRunner.assert(names.includes('ls-slot-b'), 'surviving slot still listed');

    GameState.deleteSave('ls-slot-b');
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
