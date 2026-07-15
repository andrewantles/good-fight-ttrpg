/**
 * Tests for js/simulation/metrics.js — per-turn snapshots, per-game summaries,
 * and batch aggregation math (#25).
 *
 * Per the PRD, simulation rule-correctness is covered by the engine module
 * suites; these tests exercise ONLY the metrics-aggregation math (feed known
 * snapshots/summaries, assert mean/median/stddev/winRate/tier distribution) and
 * the recorder/snapshot shape. No full game is run here — the snapshot recorder
 * is fed synthetic state objects, and aggregate() is fed hand-built summaries.
 */

// ─── Small hand-built per-game summary factory (only the fields aggregate reads) ─
function fakeSummary(overrides) {
  return Object.assign({
    outcome: 'stall',
    reason: 'max_turns',
    won: false,
    turns: 10,
    final: { influence: 0, supplies: 0, heat: 0, peakInfluence: 0 },
    operativesLost: 0,
    crackdownsTriggered: 0,
    crackdownTierCounts: {},
  }, overrides);
}

TestRunner.describe('metrics.js — aggregate: win rate & turn-count stats', function () {

  TestRunner.test('winRate is wins / n and turnCount carries mean/median/min/max/stddev', function () {
    const summaries = [
      fakeSummary({ won: true,  outcome: 'victory', turns: 2 }),
      fakeSummary({ won: false, turns: 4 }),
      fakeSummary({ won: true,  outcome: 'victory', turns: 6 }),
      fakeSummary({ won: false, turns: 8 }),
    ];

    const agg = Metrics.aggregate(summaries, { strategy: 'Balanced', difficulty: 'medium' });

    TestRunner.assertEqual(agg.n, 4, 'n counts the games');
    TestRunner.assertEqual(agg.wins, 2, 'wins counted');
    TestRunner.assertEqual(agg.winRate, 0.5, 'winRate = wins / n');

    // turns = [2,4,6,8]: mean 5, median (4+6)/2 = 5, min 2, max 8.
    TestRunner.assertEqual(agg.turnCount.mean, 5, 'mean turns');
    TestRunner.assertEqual(agg.turnCount.median, 5, 'median turns (even count → avg of middle two)');
    TestRunner.assertEqual(agg.turnCount.min, 2, 'min turns');
    TestRunner.assertEqual(agg.turnCount.max, 8, 'max turns');
    // population stddev of [2,4,6,8]: mean 5, sq devs [9,1,1,9] → var 5 → sqrt 5.
    TestRunner.assert(Math.abs(agg.turnCount.stddev - Math.sqrt(5)) < 1e-9, 'population stddev');
  });

  TestRunner.test('winRate and turnCount stats are 0 for an empty batch (no divide-by-zero)', function () {
    const agg = Metrics.aggregate([], { strategy: 'Cautious', difficulty: 'hard' });
    TestRunner.assertEqual(agg.n, 0, 'n is 0');
    TestRunner.assertEqual(agg.winRate, 0, 'winRate 0, not NaN');
    TestRunner.assertEqual(agg.turnCount.mean, 0, 'mean 0');
    TestRunner.assertEqual(agg.turnCount.stddev, 0, 'stddev 0');
    TestRunner.assertEqual(agg.strategy, 'Cautious', 'strategy label carried through');
    TestRunner.assertEqual(agg.difficulty, 'hard', 'difficulty label carried through');
  });

});

TestRunner.describe('metrics.js — aggregate: resource, outcome & crackdown stats', function () {

  TestRunner.test('resource stats are computed over each game\'s FINAL values', function () {
    const summaries = [
      fakeSummary({ final: { influence: 10, supplies: 2, heat: 4, peakInfluence: 30 } }),
      fakeSummary({ final: { influence: 30, supplies: 8, heat: 0, peakInfluence: 50 } }),
    ];
    const agg = Metrics.aggregate(summaries, {});
    TestRunner.assertEqual(agg.resources.influence.mean, 20, 'mean final influence');
    TestRunner.assertEqual(agg.resources.supplies.min, 2, 'min final supplies');
    TestRunner.assertEqual(agg.resources.supplies.max, 8, 'max final supplies');
    TestRunner.assertEqual(agg.resources.peakInfluence.mean, 40, 'mean peak influence');
  });

  TestRunner.test('outcome counts bucket by reason', function () {
    const summaries = [
      fakeSummary({ won: true, outcome: 'victory', reason: 'victory' }),
      fakeSummary({ reason: 'no_legal_moves' }),
      fakeSummary({ reason: 'max_turns' }),
      fakeSummary({ reason: 'max_turns' }),
    ];
    const agg = Metrics.aggregate(summaries, {});
    TestRunner.assertEqual(agg.outcomes.victory, 1, 'one victory');
    TestRunner.assertEqual(agg.outcomes.no_legal_moves, 1, 'one no_legal_moves');
    TestRunner.assertEqual(agg.outcomes.max_turns, 2, 'two max_turns');
  });

  TestRunner.test('crackdown stats sum tier distribution and mean per game', function () {
    const summaries = [
      fakeSummary({ crackdownsTriggered: 2, crackdownTierCounts: { 'Stockpile raid': 1, 'Warehouse raid': 1 } }),
      fakeSummary({ crackdownsTriggered: 1, crackdownTierCounts: { 'Stockpile raid': 1 } }),
    ];
    const agg = Metrics.aggregate(summaries, {});
    TestRunner.assertEqual(agg.crackdowns.total, 3, 'total crackdowns summed');
    TestRunner.assertEqual(agg.crackdowns.meanPerGame, 1.5, 'mean crackdowns per game');
    TestRunner.assertEqual(agg.crackdowns.tierDistribution['Stockpile raid'], 2, 'Stockpile summed across games');
    TestRunner.assertEqual(agg.crackdowns.tierDistribution['Warehouse raid'], 1, 'Warehouse summed');
  });

  TestRunner.test('operativesLost is aggregated across games', function () {
    const summaries = [fakeSummary({ operativesLost: 1 }), fakeSummary({ operativesLost: 3 })];
    const agg = Metrics.aggregate(summaries, {});
    TestRunner.assertEqual(agg.operativesLost.mean, 2, 'mean operatives lost');
    TestRunner.assertEqual(agg.operativesLost.max, 3, 'max operatives lost');
  });

});

TestRunner.describe('metrics.js — snapshot & recorder', function () {

  // A minimal live-state shape carrying only the fields snapshotState reads.
  function fakeState(overrides) {
    return Object.assign({
      currentTurn: 1,
      influence: 0, supplies: 0, heat: 0, peakInfluence: 0,
      operatives: [], initiates: [], detainedOperatives: [],
      multiTurnOps: [], availableMidGameOps: [], availableLateGameOps: [],
      completedLateGameOps: [], operativesLost: 0, leaderSkillLevel: 0,
      victory: false,
    }, overrides);
  }

  TestRunner.test('snapshotState maps live state + crackdown result to the documented flat shape', function () {
    const state = fakeState({
      currentTurn: 7, influence: 42, supplies: 5, heat: 12, peakInfluence: 60,
      operatives: [{}, {}], initiates: [{}], detainedOperatives: [{}],
      multiTurnOps: [{}], availableMidGameOps: [{}], availableLateGameOps: [{}, {}],
      completedLateGameOps: [{ type: 'a' }], operativesLost: 3, leaderSkillLevel: 8,
    });
    const crackdown = { roll: 15, triggered: true, tier: { name: 'Stockpile raid' } };
    const snap = Metrics.snapshotState(state, crackdown);

    TestRunner.assertEqual(snap.turn, 7, 'turn');
    TestRunner.assertEqual(snap.influence, 42, 'influence');
    TestRunner.assertEqual(snap.operatives, 2, 'operatives counted');
    TestRunner.assertEqual(snap.initiates, 1, 'initiates counted');
    TestRunner.assertEqual(snap.detained, 1, 'detained counted');
    TestRunner.assertEqual(snap.multiTurnOps, 1, 'in-flight ops counted');
    TestRunner.assertEqual(snap.midGameAvailable, 1, 'mid-game availability');
    TestRunner.assertEqual(snap.lateGameAvailable, 2, 'late-game availability');
    TestRunner.assertEqual(snap.lateGameCompleted, 1, 'late-game completed');
    TestRunner.assertEqual(snap.operativesLost, 3, 'cumulative losses');
    TestRunner.assertEqual(snap.leaderSkillLevel, 8, 'leader skill');
    TestRunner.assertEqual(snap.crackdownTriggered, true, 'crackdown flagged');
    TestRunner.assertEqual(snap.crackdownTier, 'Stockpile raid', 'tier name recorded');
    TestRunner.assertEqual(snap.crackdownRoll, 15, 'roll recorded');
  });

  TestRunner.test('snapshotState records null crackdown fields on the Victory turn', function () {
    const snap = Metrics.snapshotState(fakeState({ victory: true }), null);
    TestRunner.assertEqual(snap.crackdownTriggered, false, 'no crackdown → false');
    TestRunner.assertEqual(snap.crackdownTier, null, 'no tier');
    TestRunner.assertEqual(snap.crackdownRoll, null, 'no roll');
    TestRunner.assertEqual(snap.victory, true, 'victory flag captured');
  });

  TestRunner.test('recorder accumulates one snapshot per onSnapshot call and summarize folds them', function () {
    const rec = Metrics.createRecorder();
    // Turn 1: mid-game opportunity appears; no crackdown.
    rec.onSnapshot({ state: fakeState({ currentTurn: 1, availableMidGameOps: [{}] }), crackdown: null });
    // Turn 2: crackdown triggers (Stockpile raid).
    rec.onSnapshot({ state: fakeState({ currentTurn: 2, availableMidGameOps: [{}], availableLateGameOps: [{}] }),
      crackdown: { roll: 5, triggered: true, tier: { name: 'Stockpile raid' } } });
    TestRunner.assertArrayLength(rec.snapshots, 2, 'two snapshots recorded');

    const finalState = fakeState({ currentTurn: 2, completedLateGameOps: [{ type: 'x' }], operativesLost: 2 });
    const summary = rec.summarize({ outcome: 'stall', reason: 'max_turns', turns: 2, state: finalState });

    TestRunner.assertEqual(summary.won, false, 'stall → not won');
    TestRunner.assertEqual(summary.crackdownsTriggered, 1, 'one crackdown across the game');
    TestRunner.assertEqual(summary.crackdownTierCounts['Stockpile raid'], 1, 'tier tallied in summary');
    TestRunner.assertEqual(summary.milestones.firstMidGame, 1, 'first mid-game opportunity at turn 1');
    TestRunner.assertEqual(summary.milestones.firstLateGame, 2, 'first late-game opportunity at turn 2');
    TestRunner.assertEqual(summary.lateGameTypesCompleted, 1, 'distinct late-game types completed');
    TestRunner.assertArrayLength(summary.snapshots, 2, 'snapshots included for drilldown');
  });

});
