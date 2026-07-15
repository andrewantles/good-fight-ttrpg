/**
 * Chunked batch runner for The Good Fight TTRPG simulator (#25).
 *
 * Runs N complete games for ONE Strategy + Difficulty pair (PRD story 20:
 * "a batch runs N games at one Strategy + Difficulty pair; comparing difficulties
 * means running separate batches and overlaying results"). Each game is driven by
 * Simulator.runGame with a fresh Metrics recorder wired into the per-turn
 * `onSnapshot` hook, so every game yields a per-game summary (snapshots included);
 * the batch then folds those summaries into one aggregate via Metrics.aggregate.
 *
 * ── Chunked execution (responsiveness) ──────────────────────────────────────
 * A batch of hundreds/thousands of games would block the event loop (and freeze
 * the #26 dashboard) if run in one synchronous burst. So games run in chunks of
 * `chunkSize`; after each chunk the runner yields with
 * `await new Promise(r => setTimeout(r, 0))`, letting the browser paint / handle
 * input between chunks. Chunk size is a parameter (default 25) so callers can
 * trade responsiveness against overhead. Yielding is purely cooperative — it
 * never changes which games run or their results, so a batch is deterministic
 * given deterministic Dice/RNG regardless of chunk size.
 *
 * ── API ─────────────────────────────────────────────────────────────────────
 *   Batch.run(strategy, options) => Promise<{ summaries, aggregate }>
 *     strategy — a Strategies.* member { chooseAction, compoundFailureChoice }.
 *     options:
 *       n            {number}  games to run (required).
 *       difficulty   {string}  'easy'|'medium'|'hard' — fixed for the whole batch.
 *       chunkSize    {number}  games per chunk before yielding (default 25).
 *       strategyName {string}  label carried into the aggregate (the strategy
 *                              object has no name of its own).
 *       maxTurns     {number}  per-game safety cap, forwarded to runGame.
 *       setup        {Function} per-game state seeder, forwarded to runGame (tests).
 *       onProgress   {(done, n) => void} optional per-game progress callback
 *                              (fired after each game; drives the #26 progress bar).
 *     returns { summaries: PerGameSummary[], aggregate: BatchAggregate } — both
 *     shapes documented in metrics.js.
 */
const Batch = (() => {

  const DEFAULT_CHUNK_SIZE = 25;

  /**
   * Run one game and return its per-game summary. A fresh recorder per game keeps
   * snapshot series isolated; the recorder's onSnapshot plugs into runGame's hook.
   */
  async function runOne(strategy, options) {
    const recorder = Metrics.createRecorder();
    const result = await Simulator.runGame(strategy.chooseAction, {
      difficulty: options.difficulty,
      compoundFailureChoice: strategy.compoundFailureChoice,
      onSnapshot: recorder.onSnapshot,
      maxTurns: options.maxTurns,
      setup: options.setup,
    });
    return recorder.summarize(result);
  }

  /**
   * Run a batch of N games, yielding between chunks so the caller stays
   * responsive. See the module header for the options contract.
   */
  async function run(strategy, options = {}) {
    const n = options.n || 0;
    const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;

    const summaries = [];
    for (let i = 0; i < n; i++) {
      summaries.push(await runOne(strategy, options));

      if (typeof options.onProgress === 'function') options.onProgress(i + 1, n);

      // Yield to the event loop at each chunk boundary (but not after the last
      // game — nothing follows it). Cooperative only; does not affect results.
      const done = i + 1;
      if (done % chunkSize === 0 && done < n) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    const aggregate = Metrics.aggregate(summaries, {
      strategy: options.strategyName,
      difficulty: options.difficulty,
    });

    return { summaries, aggregate };
  }

  return { run };
})();
