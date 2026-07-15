/**
 * Tests for js/simulation/batch.js — the chunked batch runner (#25).
 *
 * Per the PRD, simulation rule-correctness is covered by the engine suites, so
 * these tests exercise ONLY batch mechanics: N games in → N summaries out,
 * chunking neither drops nor duplicates games, and the returned aggregate
 * matches the per-game list. Games are kept deterministic + fast via a stubbed
 * Dice provider and a pass strategy capped by maxTurns (the Leader keeps every
 * game legal, so each runs exactly maxTurns turns then stalls).
 */

// A strategy object shaped like a Strategies.* member, but inert: it never acts,
// so with the Leader present each game runs to the maxTurns cap deterministically.
const passStrategy = {
  chooseAction: () => null,
  compoundFailureChoice: () => 'detain',
};

TestRunner.describe('batch.js — N games in, N summaries out', function () {

  TestRunner.test('run returns one summary per game plus a matching aggregate', async function () {
    Dice.setProvider(() => Promise.resolve(50)); // no crackdown (50 > heat 0)
    const { summaries, aggregate } = await Batch.run(passStrategy, {
      n: 5,
      difficulty: 'medium',
      strategyName: 'Pass',
      chunkSize: 2,           // force multiple chunks across 5 games
      maxTurns: 2,
      setup: (s) => { s.recruitDeck = []; return s; },
    });
    Dice.setProvider(null);

    TestRunner.assertArrayLength(summaries, 5, 'exactly N summaries (no drops/dupes)');
    TestRunner.assertEqual(aggregate.n, 5, 'aggregate n matches the per-game list length');
    TestRunner.assertEqual(aggregate.strategy, 'Pass', 'strategy label carried into the aggregate');
    TestRunner.assertEqual(aggregate.difficulty, 'medium', 'difficulty label carried into the aggregate');
    // Every game stalled at the maxTurns cap → winRate 0, all in the max_turns bucket.
    TestRunner.assertEqual(aggregate.winRate, 0, 'no wins for the inert pass strategy');
    TestRunner.assertEqual(aggregate.outcomes.max_turns, 5, 'all games ended via the maxTurns cap');
  });

  TestRunner.test('onProgress fires once per game with strictly increasing indices (no drops/dupes)', async function () {
    const progress = [];
    Dice.setProvider(() => Promise.resolve(50));
    await Batch.run(passStrategy, {
      n: 4,
      difficulty: 'easy',
      chunkSize: 3,           // uneven split: chunk of 3, then 1
      maxTurns: 1,
      setup: (s) => { s.recruitDeck = []; return s; },
      onProgress: (done, total) => progress.push([done, total]),
    });
    Dice.setProvider(null);

    TestRunner.assertArrayLength(progress, 4, 'progress fired exactly N times');
    TestRunner.assertDeepEqual(progress, [[1, 4], [2, 4], [3, 4], [4, 4]],
      'each game reported once, in order — no game dropped or double-counted');
  });

  TestRunner.test('a single chunk (chunkSize >= n) still runs all N games', async function () {
    Dice.setProvider(() => Promise.resolve(50));
    const { summaries } = await Batch.run(passStrategy, {
      n: 3,
      difficulty: 'medium',
      chunkSize: 100,         // no yield boundary is ever hit
      maxTurns: 1,
      setup: (s) => { s.recruitDeck = []; return s; },
    });
    Dice.setProvider(null);
    TestRunner.assertArrayLength(summaries, 3, 'all games run when the whole batch is one chunk');
  });

  TestRunner.test('each per-game summary carries its own snapshot series (recorder wired per game)', async function () {
    Dice.setProvider(() => Promise.resolve(50));
    const { summaries } = await Batch.run(passStrategy, {
      n: 2,
      difficulty: 'medium',
      maxTurns: 3,
      setup: (s) => { s.recruitDeck = []; return s; },
    });
    Dice.setProvider(null);

    // maxTurns 3 → 3 per-turn snapshots per game; each recorder is independent.
    TestRunner.assertArrayLength(summaries[0].snapshots, 3, 'game 0 has one snapshot per turn');
    TestRunner.assertArrayLength(summaries[1].snapshots, 3, 'game 1 has its own snapshot series');
    TestRunner.assert(summaries[0].snapshots !== summaries[1].snapshots, 'snapshot series are not shared between games');
  });

});
