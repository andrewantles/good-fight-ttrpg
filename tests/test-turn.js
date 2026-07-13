/**
 * Tests for turn.js — Turn lifecycle core (#16).
 *
 * End-of-turn processing:
 *   - Initiate timers decrement; reaching 0 promotes the card to Operative.
 *   - Detained Operatives with expired timers return to state.operatives.
 *   - Multi-turn Operations' turnsRemaining decrements; reaching 0 resolves.
 */

TestRunner.describe('turn.js — Initiate Timers', function () {

  TestRunner.test('initiate timer decrements 2 -> 1 without promoting', async function () {
    const state = GameState.createInitial();
    const card = { suit: 'hearts', rank: '5', value: 5 };
    state.initiates = [{ card, turnsRemaining: 2 }];

    await Turn.processEndOfTurn(state);

    TestRunner.assertEqual(state.initiates.length, 1, 'still an initiate');
    TestRunner.assertEqual(state.initiates[0].turnsRemaining, 1, 'timer decremented to 1');
    TestRunner.assertEqual(state.operatives.length, 0, 'not yet promoted');
  });

  TestRunner.test('initiate timer reaching 0 promotes card to operative', async function () {
    const state = GameState.createInitial();
    const card = { suit: 'spades', rank: '7', value: 7 };
    state.initiates = [{ card, turnsRemaining: 1 }];

    await Turn.processEndOfTurn(state);

    TestRunner.assertEqual(state.initiates.length, 0, 'removed from initiates');
    TestRunner.assertEqual(state.operatives.length, 1, 'promoted to operatives');
    TestRunner.assertEqual(state.operatives[0], card, 'the promoted card object is the operative');
  });

});

TestRunner.describe('turn.js — Detained Operative Release', function () {

  TestRunner.test('detained timer decrements without releasing when > 0', async function () {
    const state = GameState.createInitial();
    const card = { suit: 'clubs', rank: '4', value: 4 };
    state.detainedOperatives = [{ card, turnsRemaining: 2 }];

    await Turn.processEndOfTurn(state);

    TestRunner.assertEqual(state.detainedOperatives.length, 1, 'still detained');
    TestRunner.assertEqual(state.detainedOperatives[0].turnsRemaining, 1, 'timer decremented to 1');
    TestRunner.assertEqual(state.operatives.length, 0, 'not yet released');
  });

  TestRunner.test('detained timer reaching 0 returns card to operatives', async function () {
    const state = GameState.createInitial();
    const card = { suit: 'diamonds', rank: '9', value: 9 };
    state.detainedOperatives = [{ card, turnsRemaining: 1 }];

    await Turn.processEndOfTurn(state);

    TestRunner.assertEqual(state.detainedOperatives.length, 0, 'removed from detained');
    TestRunner.assertEqual(state.operatives.length, 1, 'returned to operatives');
    TestRunner.assertEqual(state.operatives[0], card, 'the released card object is the operative');
  });

});

TestRunner.describe('turn.js — Multi-turn Operations', function () {

  function scoutOps() {
    return Array.from({ length: 4 }, (_, i) => ({ suit: 'hearts', rank: String(i + 2), value: i + 2 }));
  }

  TestRunner.test('multi-turn op turnsRemaining decrements without resolving when > 0', async function () {
    const state = GameState.createInitial();
    state.multiTurnOps = [{ operation: 'scout', turnsRemaining: 2, assignedOperatives: scoutOps() }];

    await Turn.processEndOfTurn(state);

    TestRunner.assertEqual(state.multiTurnOps.length, 1, 'op still pending');
    TestRunner.assertEqual(state.multiTurnOps[0].turnsRemaining, 1, 'timer decremented to 1');
    TestRunner.assertEqual(state.availableMidGameOps.length, 0, 'not resolved yet');
  });

  TestRunner.test('scout op reaching 0 resolves via Operations.resolveScout (success unlocks mid-game op)', async function () {
    const state = GameState.createInitial();
    state.heat = 0; // opSum(14) makes target 114, so any roll succeeds
    state.multiTurnOps = [{ operation: 'scout', turnsRemaining: 1, assignedOperatives: scoutOps() }];

    // d100=5 (success), d6=4 (mid-game table roll)
    let i = 0;
    Dice.setProvider(() => Promise.resolve([5, 4][i++]));
    await Turn.processEndOfTurn(state);
    Dice.setProvider(null);

    TestRunner.assertEqual(state.multiTurnOps.length, 0, 'resolved op removed from multiTurnOps');
    TestRunner.assertEqual(state.availableMidGameOps.length, 1, '1 mid-game op unlocked');
    TestRunner.assertEqual(state.availableMidGameOps[0].tableRoll, 4, 'correct d6 table roll stored');
  });

});
