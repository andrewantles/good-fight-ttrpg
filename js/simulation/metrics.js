/**
 * Metrics collection & aggregation for The Good Fight TTRPG simulator (#25).
 *
 * Three layers, each a pure function of observed state — no game rules live
 * here (the simulator drives the real engine; this module only OBSERVES):
 *
 *   1. Per-turn SNAPSHOT  — a flat record of the game position captured once
 *      per turn, at the consistent snapshot point runGame emits (end of turn,
 *      after Crackdown resolves). Fed into #26's turn-by-turn drilldown and the
 *      resource-curve / crackdown-analysis / operative-lifecycle charts.
 *   2. Per-game SUMMARY   — outcome + final position + per-game rollups (crackdowns
 *      triggered, tier distribution, milestone turns) plus the full snapshot
 *      array so a single game can be drilled into (#26 single-game drilldown).
 *   3. Batch AGGREGATE    — stats across many summaries (win rate, turn-count and
 *      resource distributions, crackdown stats) for strategy/difficulty compare.
 *
 * ── Observer seam (how snapshots are collected) ─────────────────────────────
 * Simulator.runGame accepts an optional `options.onSnapshot({ state, crackdown })`
 * callback, invoked once per turn at the snapshot point (default no-op).
 * `createRecorder()` returns a recorder whose `.onSnapshot` plugs straight into
 * that hook and accumulates snapshots; `.summarize(result)` then folds the
 * snapshot series + the runGame result into a per-game summary. The simulator
 * stays metrics-agnostic — it forwards raw state + the Crackdown result object
 * ({roll,triggered,tier,penalties} or null on the Victory turn, where no
 * Crackdown runs) and this module owns every derived shape.
 *
 * ── Per-turn snapshot shape (all fields read directly off state) ────────────
 *   {
 *     turn,              // state.currentTurn at the snapshot point
 *     influence, supplies, heat, peakInfluence,
 *     operatives,        // state.operatives.length (live headcount)
 *     initiates,         // state.initiates.length (in training)
 *     detained,          // state.detainedOperatives.length (temporarily held)
 *     multiTurnOps,      // state.multiTurnOps.length (Scouts / Late-Game ops in flight)
 *     midGameAvailable,  // state.availableMidGameOps.length (discovered, unexecuted)
 *     lateGameAvailable, // state.availableLateGameOps.length
 *     lateGameCompleted, // state.completedLateGameOps.length (win needs 3 distinct)
 *     operativesLost,    // cumulative permanent losses (captured & recycled)
 *     leaderSkillLevel,
 *     crackdownTriggered,// boolean — did the end-of-turn Crackdown fire?
 *     crackdownTier,     // triggered tier NAME (string) or null
 *     crackdownRoll,     // the d100 Crackdown roll, or null on the Victory turn
 *     victory,           // boolean — state.victory at snapshot time
 *   }
 *   PRD-silent decisions (flagged): state tracks no `completedMidGameOps` list
 *   (a Mid-Game Op success is consumed out of availableMidGameOps and applies an
 *   effect, leaving no completed count), so the snapshot records mid-game
 *   AVAILABILITY, not completion. `firstScout` milestone is likewise omitted —
 *   an end-of-turn snapshot can't cleanly distinguish a Scout in multiTurnOps
 *   from a Late-Game Op — in favor of the operation availability/completion
 *   milestones below, which feed the milestone-timeline chart directly.
 *
 * ── Per-game summary shape ──────────────────────────────────────────────────
 *   {
 *     outcome,               // 'victory' | 'stall'
 *     reason,                // 'victory' | 'no_legal_moves' | 'max_turns'
 *     won,                   // outcome === 'victory'
 *     turns,                 // total turns played (from the runGame result)
 *     final: {               // final position (from the runGame result state)
 *       influence, supplies, heat, peakInfluence,
 *       operatives, initiates, detained,
 *       lateGameCompleted, operativesLost, leaderSkillLevel,
 *     },
 *     operativesLost,        // cumulative permanent losses (== final.operativesLost)
 *     crackdownsTriggered,   // # of turns the Crackdown fired
 *     crackdownTierCounts,   // { tierName: count } summed over the game
 *     lateGameTypesCompleted,// distinct Late-Game types completed (win needs 3)
 *     milestones: {          // first turn each threshold was reached, else null
 *       firstMidGame,        // first turn a Mid-Game opportunity was available
 *       firstLateGame,       // first turn a Late-Game opportunity was available
 *       firstLateGameCompleted,
 *       victoryTurn,
 *     },
 *     snapshots: [ ...per-turn snapshots ],  // included for the drilldown chart
 *   }
 *
 * ── Batch aggregate shape ───────────────────────────────────────────────────
 *   {
 *     n, strategy, difficulty,
 *     wins, winRate,                       // winRate = wins / n (0..1)
 *     outcomes: { victory, no_legal_moves, max_turns },  // reason counts
 *     turnCount: { mean, median, min, max, stddev },
 *     resources: {                          // over each game's FINAL value
 *       influence:     {mean,median,min,max,stddev},
 *       supplies:      {mean,median,min,max,stddev},
 *       heat:          {mean,median,min,max,stddev},
 *       peakInfluence: {mean,median,min,max,stddev},
 *     },
 *     operativesLost: { mean, median, min, max, stddev },
 *     crackdowns: {
 *       meanPerGame,                        // mean crackdownsTriggered
 *       total,                              // summed across all games
 *       tierDistribution,                   // { tierName: count } summed across games
 *     },
 *   }
 *
 * ── Statistic definitions ───────────────────────────────────────────────────
 *   mean   — arithmetic mean.
 *   median — middle of the sorted values; even count → average of the two middle.
 *   min/max— extremes.
 *   stddev — POPULATION standard deviation: sqrt(mean of squared deviations)
 *            (divide by N, not N-1). A batch is the whole population of runs, not
 *            a sample of a larger one, so N is the right divisor. Empty input → 0.
 */
const Metrics = (() => {

  // ─── Statistics helpers ─────────────────────────────────────────────────────

  function mean(values) {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  function median(values) {
    if (values.length === 0) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  // Population standard deviation (divide by N). See header for the rationale.
  function stddev(values) {
    if (values.length === 0) return 0;
    const m = mean(values);
    const variance = mean(values.map((v) => (v - m) * (v - m)));
    return Math.sqrt(variance);
  }

  /** Full stat block for a numeric series. */
  function stats(values) {
    return {
      mean: mean(values),
      median: median(values),
      min: values.length ? Math.min(...values) : 0,
      max: values.length ? Math.max(...values) : 0,
      stddev: stddev(values),
    };
  }

  // ─── Per-turn snapshot ──────────────────────────────────────────────────────

  /**
   * Build one per-turn snapshot from the live game state plus the Crackdown
   * result for that turn (null on the Victory turn, where no Crackdown runs).
   * Pure read — never mutates state.
   * @param {object} state
   * @param {?object} crackdown - Crackdown.resolveCrackdown result, or null
   * @returns {object} snapshot (shape documented in the module header)
   */
  function snapshotState(state, crackdown) {
    return {
      turn: state.currentTurn,
      influence: state.influence,
      supplies: state.supplies,
      heat: state.heat,
      peakInfluence: state.peakInfluence || 0,
      operatives: state.operatives.length,
      initiates: state.initiates.length,
      detained: state.detainedOperatives.length,
      multiTurnOps: state.multiTurnOps.length,
      midGameAvailable: state.availableMidGameOps.length,
      lateGameAvailable: state.availableLateGameOps.length,
      lateGameCompleted: state.completedLateGameOps.length,
      operativesLost: state.operativesLost || 0,
      leaderSkillLevel: state.leaderSkillLevel || 0,
      crackdownTriggered: !!(crackdown && crackdown.triggered),
      crackdownTier: crackdown && crackdown.triggered && crackdown.tier
        ? crackdown.tier.name : null,
      crackdownRoll: crackdown ? crackdown.roll : null,
      victory: !!state.victory,
    };
  }

  // ─── Recorder (plugs into Simulator.runGame's onSnapshot hook) ──────────────

  /**
   * A snapshot recorder. `.onSnapshot` is the callback handed to
   * `runGame({ onSnapshot })`; it accumulates one snapshot per turn.
   * `.summarize(result)` folds the collected snapshots + the runGame result
   * into a per-game summary.
   * @returns {{ snapshots: Array, onSnapshot: Function, summarize: Function }}
   */
  function createRecorder() {
    const snapshots = [];
    return {
      snapshots,
      onSnapshot: (ctx) => {
        // ctx = { state, crackdown }. Snapshot immediately (state is mutated in
        // place by the engine, so we must capture a flat copy now).
        snapshots.push(snapshotState(ctx.state, ctx.crackdown));
      },
      summarize: (result) => summarizeGame(result, snapshots),
    };
  }

  // ─── Per-game summary ───────────────────────────────────────────────────────

  /** First snapshot.turn satisfying `pred`, or null if none. */
  function firstTurnWhere(snapshots, pred) {
    for (const s of snapshots) if (pred(s)) return s.turn;
    return null;
  }

  /**
   * Fold a runGame result + its snapshot series into a per-game summary.
   * @param {object} result - { outcome, reason, turns, state }
   * @param {Array} snapshots
   * @returns {object} summary (shape documented in the module header)
   */
  function summarizeGame(result, snapshots) {
    const state = result.state;

    // Crackdown rollups over the snapshot series.
    let crackdownsTriggered = 0;
    const crackdownTierCounts = {};
    for (const s of snapshots) {
      if (s.crackdownTriggered) {
        crackdownsTriggered += 1;
        if (s.crackdownTier) {
          crackdownTierCounts[s.crackdownTier] = (crackdownTierCounts[s.crackdownTier] || 0) + 1;
        }
      }
    }

    const lateGameTypesCompleted = new Set(
      (state.completedLateGameOps || []).map((o) => o.type)
    ).size;

    return {
      outcome: result.outcome,
      reason: result.reason,
      won: result.outcome === 'victory',
      turns: result.turns,
      final: {
        influence: state.influence,
        supplies: state.supplies,
        heat: state.heat,
        peakInfluence: state.peakInfluence || 0,
        operatives: state.operatives.length,
        initiates: state.initiates.length,
        detained: state.detainedOperatives.length,
        lateGameCompleted: (state.completedLateGameOps || []).length,
        operativesLost: state.operativesLost || 0,
        leaderSkillLevel: state.leaderSkillLevel || 0,
      },
      operativesLost: state.operativesLost || 0,
      crackdownsTriggered,
      crackdownTierCounts,
      lateGameTypesCompleted,
      milestones: {
        firstMidGame: firstTurnWhere(snapshots, (s) => s.midGameAvailable > 0),
        firstLateGame: firstTurnWhere(snapshots, (s) => s.lateGameAvailable > 0),
        firstLateGameCompleted: firstTurnWhere(snapshots, (s) => s.lateGameCompleted > 0),
        victoryTurn: firstTurnWhere(snapshots, (s) => s.victory),
      },
      snapshots,
    };
  }

  // ─── Batch aggregate ────────────────────────────────────────────────────────

  /**
   * Aggregate stats across a batch of per-game summaries.
   * @param {Array} summaries - per-game summaries (from summarizeGame)
   * @param {object} [meta] - { strategy, difficulty } labels carried through
   * @returns {object} aggregate (shape documented in the module header)
   */
  function aggregate(summaries, meta = {}) {
    const n = summaries.length;
    const wins = summaries.filter((s) => s.won).length;

    const turns = summaries.map((s) => s.turns);
    const finals = (key) => summaries.map((s) => s.final[key]);

    const outcomes = { victory: 0, no_legal_moves: 0, max_turns: 0 };
    for (const s of summaries) {
      if (Object.prototype.hasOwnProperty.call(outcomes, s.reason)) outcomes[s.reason] += 1;
    }

    const tierDistribution = {};
    let crackdownTotal = 0;
    for (const s of summaries) {
      crackdownTotal += s.crackdownsTriggered;
      for (const tier of Object.keys(s.crackdownTierCounts || {})) {
        tierDistribution[tier] = (tierDistribution[tier] || 0) + s.crackdownTierCounts[tier];
      }
    }

    return {
      n,
      strategy: meta.strategy,
      difficulty: meta.difficulty,
      wins,
      winRate: n ? wins / n : 0,
      outcomes,
      turnCount: stats(turns),
      resources: {
        influence: stats(finals('influence')),
        supplies: stats(finals('supplies')),
        heat: stats(finals('heat')),
        peakInfluence: stats(finals('peakInfluence')),
      },
      operativesLost: stats(summaries.map((s) => s.operativesLost)),
      crackdowns: {
        meanPerGame: mean(summaries.map((s) => s.crackdownsTriggered)),
        total: crackdownTotal,
        tierDistribution,
      },
    };
  }

  return {
    // stats helpers (exported so #26/#27 can reuse the exact definitions)
    mean,
    median,
    stddev,
    stats,
    // snapshot / recorder / summary / aggregate
    snapshotState,
    createRecorder,
    summarizeGame,
    aggregate,
  };
})();
