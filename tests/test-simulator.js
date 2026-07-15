/**
 * Tests for js/simulation/simulator.js — the headless full-game loop (#23).
 *
 * Per the PRD, the simulator reuses the real engine modules with zero parallel
 * rule implementation, so these tests exercise ONLY the orchestration/decision
 * seam — the loop mechanics, the strategy contract, Victory/Stall termination —
 * NOT the rules themselves (those are covered by the engine module suites).
 *
 * Dice are stubbed via Dice.setProvider so outcomes are deterministic; each
 * test resets the provider afterward.
 */

TestRunner.describe('simulator.js — Stall termination', function () {

  // A strategy that never acts. With no legal moves available this drives the
  // loop straight into the Stall path.
  const passStrategy = () => null;

  TestRunner.test('a game with no legal moves ever available ends in Stall', async function () {
    // No Leader + no operatives + empty pools + empty deck => untappedPool is
    // empty and nothing is recruitable/executable => hasLegalMove is false.
    const setup = () => {
      const state = GameState.createInitial();
      delete state.leader;      // legacy no-leader save: assignable pool is empty
      state.recruitDeck = [];
      return state;
    };

    Dice.setProvider(() => Promise.resolve(50));
    const result = await Simulator.runGame(passStrategy, { setup });
    Dice.setProvider(null);

    TestRunner.assertEqual(result.outcome, 'stall', 'outcome is stall');
    TestRunner.assert(result.turns >= 10, 'stalled after at least 10 turns');
    TestRunner.assert(!!result.state, 'result carries the final state');
  });

  TestRunner.test('maxTurns safety cap ends a never-winning game as a Stall', async function () {
    // The Leader can always do Minor Vandalism, so hasLegalMove never goes
    // false and the no-legal-moves streak never fires — the maxTurns guard is
    // what stops the game.
    const minorEachTurn = (state) => {
      const pool = GameState.untappedPool(state);
      return pool.length ? { type: 'minor_vandalism', operatives: [pool[0]] } : null;
    };

    Dice.setProvider(() => Promise.resolve(1)); // always succeed; d4=1 draws a card
    const result = await Simulator.runGame(minorEachTurn, {
      setup: (s) => { s.recruitDeck = Deck.createDeck(); return s; },
      maxTurns: 3,
    });
    Dice.setProvider(null);

    TestRunner.assertEqual(result.outcome, 'stall', 'outcome is stall');
    TestRunner.assertEqual(result.reason, 'max_turns', 'stalled via the maxTurns cap');
  });

});

TestRunner.describe('simulator.js — Action loop drives the engine', function () {

  TestRunner.test('a Minor Vandalism action taps the unit, applies the engine effect, then untaps at end of turn', async function () {
    const oneMinorThenPass = (state) => {
      const pool = GameState.untappedPool(state);
      return pool.length ? { type: 'minor_vandalism', operatives: [pool[0]] } : null;
    };

    Dice.setProvider(() => Promise.resolve(1)); // d100=1 => success (+1 Inf/+1 Heat)
    const result = await Simulator.runGame(oneMinorThenPass, {
      setup: (s) => { s.recruitDeck = Deck.createDeck(); return s; },
      maxTurns: 1,
    });
    Dice.setProvider(null);

    // Exactly one Minor Vandalism ran: +1 Influence and no more. A second could
    // only happen if the Leader had not tapped — so influence === 1 proves the
    // simulator tapped the acting unit (removing it from the untapped pool).
    // (Heat, +1 from the op, is then cooled back down by the end-of-turn
    // Crackdown — correct engine behavior — so it is not asserted here.)
    TestRunner.assertEqual(result.state.influence, 1, 'exactly one Minor Vandalism applied (+1 Influence); tapping stopped a second');
    TestRunner.assert(!result.state.leader.tapped, 'Leader untapped by end-of-turn processing');
  });

});

TestRunner.describe('simulator.js — Victory termination', function () {

  TestRunner.test('completing a 3rd distinct Late-Game Op (resolved at end of turn) ends the game as a Victory', async function () {
    const twelveOps = () =>
      Array.from({ length: 12 }, (_, i) => ({ suit: 'spades', rank: '5', value: 5, tapped: false }));

    // Two distinct Late-Game types already completed; one more available. The
    // strategy starts it (a 3-turn Multi-turn op) once, then passes; it resolves
    // inside Turn.processEndOfTurn three turns later and the engine flips
    // state.victory on the 3rd distinct completion.
    const startLateOnce = (state) => {
      const untapped = state.operatives.filter((o) => !o.tapped);
      if (state.availableLateGameOps.length > 0 &&
          Operations.canExecuteLateGameOp(state, untapped)) {
        return { type: 'late_game_op', op: state.availableLateGameOps[0], operatives: untapped.slice(0, 12) };
      }
      return null; // nothing to do while the op is in flight — Leader keeps the game legal
    };

    Dice.setProvider(() => Promise.resolve(1)); // every check succeeds
    const result = await Simulator.runGame(startLateOnce, {
      setup: (s) => {
        s.operatives = twelveOps();
        s.supplies = 20;
        s.influence = 100;            // >= medium Late-Game threshold (90)
        s.heat = 0;
        s.completedLateGameOps = [{ type: 'news_agency' }, { type: 'establish_militia' }];
        s.availableLateGameOps = [{ type: 'neutralize_leadership' }];
        return s;
      },
    });
    Dice.setProvider(null);

    TestRunner.assertEqual(result.outcome, 'victory', 'outcome is victory');
    TestRunner.assert(result.state.victory, 'engine victory flag is set');
    TestRunner.assert(result.turns >= 3, 'Late-Game op resolved after its 3-turn timer');
  });

});

TestRunner.describe('simulator.js — Recruit action (orchestrated)', function () {

  TestRunner.test('a recruit action promotes a pooled card to an Initiate on a successful attempt', async function () {
    const recruitOnce = (state) => {
      if (state.recruitPool.length > 0 && state.leader && !state.leader.tapped) {
        return { type: 'recruit', poolIndex: 0 };
      }
      return null;
    };

    Dice.setProvider(() => Promise.resolve(10)); // d10=10 >= card value (2) => success
    const result = await Simulator.runGame(recruitOnce, {
      setup: (s) => {
        s.recruitPool = [{ suit: 'clubs', rank: '2', value: 2 }];
        s.recruitDeck = [];
        return s;
      },
      maxTurns: 1,
    });
    Dice.setProvider(null);

    TestRunner.assertArrayLength(result.state.recruitPool, 0, 'card left the Recruit Pool');
    TestRunner.assertArrayLength(result.state.initiates, 1, 'card promoted to an Initiate');
  });

});

TestRunner.describe('simulator.js — onSnapshot observer hook', function () {

  TestRunner.test('onSnapshot fires once per turn with { state, crackdown } and defaults to a no-op', async function () {
    // A game that stalls fast via maxTurns: the Leader keeps hasLegalMove true,
    // the pass strategy never acts, so it plays exactly maxTurns turns.
    const calls = [];
    Dice.setProvider(() => Promise.resolve(50)); // d100=50 > heat(0) => no crackdown
    const result = await Simulator.runGame(() => null, {
      maxTurns: 3,
      setup: (s) => { s.recruitDeck = []; return s; }, // Leader present → runs to maxTurns
      onSnapshot: (ctx) => calls.push(ctx),
    });
    Dice.setProvider(null);

    TestRunner.assertEqual(result.reason, 'max_turns', 'game ran to the maxTurns cap');
    // One snapshot per turn played (turns 1..3, snapshot emitted before increment).
    TestRunner.assertArrayLength(calls, 3, 'one snapshot per turn');
    TestRunner.assert(calls[0].state === result.state, 'snapshot carries the live state');
    TestRunner.assert('crackdown' in calls[0], 'snapshot context carries the crackdown result key');
    TestRunner.assert(calls[0].crackdown && calls[0].crackdown.triggered === false, 'crackdown result forwarded (roll 50 > heat 0 → not triggered)');
  });

});

TestRunner.describe('simulator.js — Difficulty & digital input', function () {

  TestRunner.test('the Difficulty parameter is applied to the game state', async function () {
    Dice.setProvider(() => Promise.resolve(50));
    const result = await Simulator.runGame(() => null, {
      difficulty: 'hard',
      setup: (s) => { delete s.leader; s.recruitDeck = []; return s; }, // stall fast
    });
    Dice.setProvider(null);

    TestRunner.assertEqual(result.state.difficulty, 'hard', 'options.difficulty drives state.difficulty even with a custom setup');
  });

  TestRunner.test('Input Mode is forced to digital (state flags + Deck provider cleared)', async function () {
    // Install a non-digital Deck provider; runGame must clear it so Deck.draw
    // uses the internal deck rather than a DOM manual-entry provider.
    Deck.setProvider(() => Promise.resolve([]));

    Dice.setProvider(() => Promise.resolve(50));
    const result = await Simulator.runGame(() => null, {
      setup: (s) => { delete s.leader; s.recruitDeck = []; return s; },
    });
    Dice.setProvider(null);

    TestRunner.assertEqual(result.state.inputMode.dice, 'digital', 'dice input forced digital');
    TestRunner.assertEqual(result.state.inputMode.cards, 'digital', 'cards input forced digital');
  });

});
