/**
 * Tests for js/simulation/strategies.js — the four AI strategies (#24).
 *
 * Two seams are exercised:
 *   1. Compound-Failure resolution (unit): each strategy's compoundFailureChoice
 *      returns its documented 'detain' / 'supplies' rule.
 *   2. Legal action production (integration): each strategy, driven through
 *      Simulator.runGame with deterministic Dice, only ever emits actions the
 *      engine accepts — proven by an independent per-action legality check and
 *      by the game running to a clean Victory/Stall termination.
 *
 * Dice are stubbed via Dice.setProvider so outcomes are deterministic; each
 * test resets the provider afterward. Random's RNG is stubbed via
 * Strategies.setRandomSource for determinism.
 */

TestRunner.describe('strategies.js — Compound-Failure resolution rule', function () {

  TestRunner.test('Cautious protects headcount → picks −Supplies', function () {
    const state = GameState.createInitial();
    TestRunner.assertEqual(Strategies.Cautious.compoundFailureChoice(state), 'supplies',
      'Cautious always sacrifices Supplies to keep operatives');
  });

  TestRunner.test('Aggressive protects Supplies → picks detain', function () {
    const state = GameState.createInitial();
    TestRunner.assertEqual(Strategies.Aggressive.compoundFailureChoice(state), 'detain',
      'Aggressive always detains an operative to keep Supplies');
  });

  TestRunner.test('Balanced sacrifices the resource it has MORE relative slack in', function () {
    // Relative slack = headcount/12 vs supplies/20 (the peak per-op needs).
    // Plenty of operatives, few supplies → more slack in operatives → detain.
    const opRich = GameState.createInitial();
    opRich.operatives = Array.from({ length: 12 }, () => ({ suit: 'spades', rank: '5', value: 5 }));
    opRich.supplies = 1;
    TestRunner.assertEqual(Strategies.Balanced.compoundFailureChoice(opRich), 'detain',
      'more slack in operatives → sacrifice an operative');

    // Plenty of supplies, few operatives → more slack in supplies → −Supplies.
    const supplyRich = GameState.createInitial();
    supplyRich.operatives = [{ suit: 'spades', rank: '5', value: 5 }];
    supplyRich.supplies = 20;
    TestRunner.assertEqual(Strategies.Balanced.compoundFailureChoice(supplyRich), 'supplies',
      'more slack in supplies → sacrifice Supplies');
  });

  TestRunner.test('Random picks by its injected RNG (deterministic under a stub)', function () {
    const state = GameState.createInitial();
    Strategies.setRandomSource(() => 0.1); // < 0.5 → detain
    TestRunner.assertEqual(Strategies.Random.compoundFailureChoice(state), 'detain', 'rng<0.5 → detain');
    Strategies.setRandomSource(() => 0.9); // >= 0.5 → supplies
    TestRunner.assertEqual(Strategies.Random.compoundFailureChoice(state), 'supplies', 'rng>=0.5 → supplies');
    Strategies.setRandomSource(null); // restore Math.random
  });

});

TestRunner.describe('strategies.js — epsilon-greedy exploration (anti-starvation, #59)', function () {

  // Leader-only start (createInitial has no Operatives and an empty Recruit
  // Pool): the ONLY legal actions are the two K=1 fillers, and legalActions
  // enumerates them in candidatesByKind key order → index 0 = minor_vandalism,
  // index 1 = gather_supplies. This is exactly the starvation trap in #59.
  function leaderOnlyState() {
    return GameState.createInitial();
  }

  // Stubbed RNG that yields `values` in sequence (then repeats). The epsilon
  // strategies draw once for the explore/exploit coin, then (if exploring) once
  // more for the uniform index.
  function seqRandom(values) {
    let i = 0;
    return () => values[i++ % values.length];
  }

  // Priority tops over the Leader-only legal set [minor_vandalism,
  // gather_supplies]: Cautious/Balanced rank gather above minor; Aggressive the
  // reverse. exploreSeq forces the coin BELOW epsilon then picks a uniform index
  // landing on an action that is NOT that strategy's priority top.
  const cases = [
    { name: 'Cautious', epsilon: 0.05, priorityTop: 'gather_supplies',
      exploreSeq: [0.01, 0.0], exploreType: 'minor_vandalism' },
    { name: 'Balanced', epsilon: 0.10, priorityTop: 'gather_supplies',
      exploreSeq: [0.05, 0.0], exploreType: 'minor_vandalism' },
    { name: 'Aggressive', epsilon: 0.15, priorityTop: 'minor_vandalism',
      exploreSeq: [0.10, 0.9], exploreType: 'gather_supplies' },
  ];

  cases.forEach(({ name, epsilon, priorityTop, exploreSeq, exploreType }) => {
    TestRunner.test(`${name}: RNG below epsilon (${epsilon}) samples off priority`, function () {
      Strategies.setRandomSource(seqRandom(exploreSeq));
      const action = Strategies[name].chooseAction(leaderOnlyState());
      Strategies.setRandomSource(null);
      TestRunner.assertEqual(action.type, exploreType,
        `${name} explores uniformly (${exploreType}), not its priority top (${priorityTop})`);
    });

    TestRunner.test(`${name}: RNG above epsilon (${epsilon}) follows priority`, function () {
      Strategies.setRandomSource(() => 0.99);
      const action = Strategies[name].chooseAction(leaderOnlyState());
      Strategies.setRandomSource(null);
      TestRunner.assertEqual(action.type, priorityTop,
        `${name} returns its priority-ordered top choice (${priorityTop}) unchanged`);
    });
  });

});

TestRunner.describe('strategies.js — every emitted action is engine-legal', function () {

  // Independent legality oracle: re-derives whether `action` is acceptable
  // straight from the engine's checks (NOT from Strategies.legalActions, so the
  // proof isn't circular). Throws — failing the driving game — on any illegal
  // action a strategy emits.
  function assertActionLegal(state, action) {
    if (action === null || action === undefined || action.type === 'end_turn') return;
    const untapped = GameState.untappedPool(state);
    const allUntapped = (ops) => ops.length > 0 && ops.every((o) => untapped.includes(o));
    const noLeader = (ops) => ops.every((o) => !o.isLeader);

    switch (action.type) {
      case 'recruit': {
        const card = state.recruitPool[action.poolIndex];
        TestRunner.assert(!!card, 'recruit targets a real pooled card');
        const att = action.attributer;
        TestRunner.assert(att && !att.tapped, 'attributer is untapped');
        const eligible = att.isLeader || (state.operatives.includes(att) && att.value > card.value);
        TestRunner.assert(eligible, 'attributer is eligible for the card');
        break;
      }
      case 'minor_vandalism':
      case 'gather_supplies':
        TestRunner.assert(allUntapped(action.operatives), `${action.type}: untapped unit assigned`);
        break;
      case 'average_vandalism':
        TestRunner.assert(allUntapped(action.operatives) &&
          Operations.canExecute('average_vandalism', state, action.operatives),
          'average_vandalism passes engine canExecute');
        break;
      case 'significant_vandalism':
        TestRunner.assert(allUntapped(action.operatives) &&
          Operations.canExecute('significant_vandalism', state, action.operatives),
          'significant_vandalism passes engine canExecute');
        break;
      case 'scout':
        TestRunner.assert(allUntapped(action.operatives) &&
          Operations.canExecute('scout', state, action.operatives),
          'scout passes engine canExecute');
        break;
      case 'late_game_scout':
        TestRunner.assert(allUntapped(action.operatives) &&
          action.operatives.length >= 6 && state.supplies >= 8,
          'late_game_scout: 6 untapped units + 8 Supplies');
        break;
      case 'mid_game_op':
        TestRunner.assert(state.availableMidGameOps.includes(action.op) &&
          allUntapped(action.operatives) && noLeader(action.operatives) &&
          Operations.canExecuteMidGameOp(state, action.operatives),
          'mid_game_op: available opportunity, Leader-free, passes canExecuteMidGameOp');
        break;
      case 'late_game_op':
        TestRunner.assert(state.availableLateGameOps.includes(action.op) &&
          allUntapped(action.operatives) && noLeader(action.operatives) &&
          Operations.canExecuteLateGameOp(state, action.operatives),
          'late_game_op: available opportunity, Leader-free, passes canExecuteLateGameOp');
        break;
      default:
        throw new Error(`unknown action type: ${action.type}`);
    }
  }

  // A resource-rich start so scouting, Mid/Late-Game Ops, Vandalism, Recruit and
  // the K=1 fillers all become legal at some point during the run — exercising
  // every branch of each strategy's ordering.
  function richSetup(s) {
    s.recruitDeck = Deck.createDeck();
    s.operatives = Array.from({ length: 12 }, () => ({ suit: 'spades', rank: '5', value: 5, tapped: false }));
    s.recruitPool = [{ suit: 'clubs', rank: '2', value: 2 }, { suit: 'hearts', rank: '3', value: 3 }];
    s.supplies = 40;
    s.influence = 100; // ≥ medium Late-Game threshold (90)
    s.heat = 0;
    GameState.updateLeaderSkill(s);
    return s;
  }

  // Deterministic dice: d100 → 1 (every check succeeds), d4 → 2 (no bonus draw
  // that would drain the deck each Minor). d6 CYCLES 1..6: the Late-Game
  // opportunity table re-rolls until it lands an un-held type, so a fixed d6
  // whose type is already held would spin forever — cycling guarantees it soon
  // hits an available row. Everything else → 1.
  let d6seq = 0;
  function fixedDice(dieType) {
    if (dieType === 'd100') return Promise.resolve(1);
    if (dieType === 'd4') return Promise.resolve(2);
    if (dieType === 'd6') { d6seq = (d6seq % 6) + 1; return Promise.resolve(d6seq); }
    return Promise.resolve(1);
  }

  // Drive a strategy through a full game, asserting legality of every action.
  async function driveAndAssertLegal(strat) {
    const guarded = (state) => {
      const action = strat.chooseAction(state);
      assertActionLegal(state, action); // throws → rejects the game → fails the test
      return action;
    };
    Dice.setProvider(fixedDice);
    const result = await Simulator.runGame(guarded, {
      difficulty: 'medium',
      compoundFailureChoice: strat.compoundFailureChoice,
      setup: richSetup,
      maxTurns: 40,
    });
    Dice.setProvider(null);
    return result;
  }

  ['Cautious', 'Aggressive', 'Balanced'].forEach((name) => {
    TestRunner.test(`${name} emits only legal actions across a full game`, async function () {
      const result = await driveAndAssertLegal(Strategies[name]);
      TestRunner.assert(result.outcome === 'victory' || result.outcome === 'stall',
        `${name} game terminated cleanly (${result.outcome})`);
    });
  });

  TestRunner.test('Random emits only legal actions across a full game (seeded RNG)', async function () {
    // Deterministic LCG so Random's choices are reproducible.
    let seed = 123456789;
    Strategies.setRandomSource(() => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    });
    const result = await driveAndAssertLegal(Strategies.Random);
    Strategies.setRandomSource(null);
    TestRunner.assert(result.outcome === 'victory' || result.outcome === 'stall',
      `Random game terminated cleanly (${result.outcome})`);
  });

});
