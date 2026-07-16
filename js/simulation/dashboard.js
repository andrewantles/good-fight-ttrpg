/**
 * Dashboard data-transforms + injectable render/wiring layer for the #26
 * simulation dashboard (simulate.html).
 *
 * Split into two halves so the LOGIC is testable without a real <canvas> (Chart.js
 * cannot render under happy-dom):
 *
 *   1. PURE TRANSFORMS — one per chart type, each mapping a Batch.run result
 *      (`aggregate` + `summaries`, shapes documented in metrics.js) to a plain,
 *      Chart.js-ready data object. No DOM, no Chart, no side effects. These are
 *      what the tests drive against static fixtures.
 *
 *   2. RENDER / WIRING — `renderAll(result, { chartFactory })` turns each transform
 *      into a chart via an INJECTED `chartFactory(canvas, config)` (defaults to real
 *      Chart.js; tests pass a spy). `wireControls(root, opts)` attaches the Run
 *      button handler: read the three controls → Batch.run → render. Both guard
 *      against a missing canvas / missing Chart so a happy-dom run never throws.
 *
 * ── Chart-data object shape (returned by every transform) ────────────────────
 * A minimal, Chart.js-friendly object. Most return `{ type, labels, datasets }`
 * (fed straight into `{ type, data: { labels, datasets } }`); a few carry extra
 * fields a render/click handler needs (e.g. the heatmap's per-cell `gameIndex`
 * for drilldown, the win-rate `winRate` scalar for a caption).
 *
 * PRD-silent shape choices (PRD story 22 names the chart SET, not each chart's
 * exact encoding) are flagged inline at each transform. Core Chart.js (the vendored
 * UMD build) has no matrix/heatmap controller, so the operation-completion heatmap
 * is encoded as a `scatter` grid (stage on X, game on Y, turn as the point value)
 * rather than a true matrix chart — a deliberate, defensible fit to core Chart.js.
 */
const Dashboard = (() => {

  // ─── Pure transforms ────────────────────────────────────────────────────────

  /**
   * Win-rate breakdown → doughnut of Wins vs Losses, with the outcome-reason
   * counts and the winRate scalar carried through for a caption.
   * @param {object} aggregate - Batch aggregate
   */
  function winRateData(aggregate) {
    const n = aggregate.n || 0;
    const wins = aggregate.wins || 0;
    return {
      type: 'doughnut',
      labels: ['Wins', 'Losses'],
      datasets: [{ label: 'Games', data: [wins, n - wins] }],
      winRate: aggregate.winRate || 0,
      outcomes: aggregate.outcomes || {},
    };
  }

  /**
   * Turn-count distribution → bar histogram. Games are binned by turn count into
   * fixed-width bins of `binSize` (default 5): bin k covers turns
   * [k*binSize+1 .. (k+1)*binSize]. Empty interior bins are kept (count 0) so the
   * X axis is contiguous from the first bin through the bin holding the longest game.
   * PRD-silent: bin width and 1-based lower edge are a defensible default.
   * @param {Array} summaries - per-game summaries
   * @param {number} [binSize=5]
   */
  function turnCountHistogram(summaries, binSize = 5) {
    const size = binSize > 0 ? binSize : 5;
    const turns = summaries.map((s) => s.turns);
    if (turns.length === 0) {
      return { type: 'bar', labels: [], datasets: [{ label: 'Games', data: [] }], binSize: size };
    }
    const maxTurns = Math.max(...turns);
    const binOf = (t) => Math.floor((t - 1) / size);
    const maxBin = binOf(maxTurns);
    const counts = new Array(maxBin + 1).fill(0);
    for (const t of turns) counts[binOf(t)] += 1;
    const labels = counts.map((_, k) => `${k * size + 1}-${(k + 1) * size}`);
    return { type: 'bar', labels, datasets: [{ label: 'Games', data: counts }], binSize: size };
  }

  /**
   * Resource curves → multi-series line of the MEAN of each resource at each turn,
   * averaged across every game that reached that turn. X axis is turn 1..maxTurns
   * (so each series length === the longest game's turn count). Games that ended
   * earlier simply don't contribute to later turns' means.
   * PRD-silent: mean-per-turn (vs. median) and Influence/Supplies/Heat as the
   * plotted resources are defensible defaults.
   * @param {Array} summaries - per-game summaries (each carries .snapshots)
   */
  function resourceCurves(summaries) {
    let maxTurn = 0;
    for (const s of summaries) {
      for (const snap of s.snapshots || []) if (snap.turn > maxTurn) maxTurn = snap.turn;
    }
    const labels = [];
    for (let t = 1; t <= maxTurn; t++) labels.push(t);

    const series = { influence: [], supplies: [], heat: [] };
    for (let t = 1; t <= maxTurn; t++) {
      const acc = { influence: [], supplies: [], heat: [] };
      for (const s of summaries) {
        for (const snap of s.snapshots || []) {
          if (snap.turn === t) {
            acc.influence.push(snap.influence);
            acc.supplies.push(snap.supplies);
            acc.heat.push(snap.heat);
          }
        }
      }
      series.influence.push(mean(acc.influence));
      series.supplies.push(mean(acc.supplies));
      series.heat.push(mean(acc.heat));
    }

    return {
      type: 'line',
      labels,
      datasets: [
        { label: 'Influence', data: series.influence },
        { label: 'Supplies', data: series.supplies },
        { label: 'Heat', data: series.heat },
      ],
    };
  }

  /**
   * Crackdown analysis → bar of how many crackdowns fired at each tier across the
   * whole batch, from the aggregate's tierDistribution. meanPerGame + total are
   * carried through for a caption.
   * @param {object} aggregate - Batch aggregate (uses .crackdowns)
   */
  function crackdownAnalysis(aggregate) {
    const cd = aggregate.crackdowns || {};
    const dist = cd.tierDistribution || {};
    const labels = Object.keys(dist);
    const data = labels.map((k) => dist[k]);
    return {
      type: 'bar',
      labels,
      datasets: [{ label: 'Crackdowns', data }],
      meanPerGame: cd.meanPerGame || 0,
      total: cd.total || 0,
    };
  }

  /**
   * Operative lifecycle funnel → bar of the total headcount at each lifecycle
   * stage summed across every game's FINAL position, with cumulative captures.
   * Stages: In Training (initiates) → Active (operatives) → Detained → Captured
   * (operativesLost). PRD-silent: which stages and using final-state sums (there
   * is no "ever recruited" counter in state) is a defensible reading.
   * @param {Array} summaries - per-game summaries
   */
  function operativeLifecycleFunnel(summaries) {
    const totals = { initiates: 0, operatives: 0, detained: 0, lost: 0 };
    for (const s of summaries) {
      const f = s.final || {};
      totals.initiates += f.initiates || 0;
      totals.operatives += f.operatives || 0;
      totals.detained += f.detained || 0;
      totals.lost += (f.operativesLost != null ? f.operativesLost : s.operativesLost) || 0;
    }
    const stages = ['In Training', 'Active', 'Detained', 'Captured'];
    return {
      type: 'bar',
      labels: stages,
      datasets: [{
        label: 'Operatives',
        data: [totals.initiates, totals.operatives, totals.detained, totals.lost],
      }],
      stages,
    };
  }

  // Operation-completion milestones a game passes through, in order. Each maps to
  // a summary.milestones.* field (first turn reached, or null).
  const OP_STAGES = [
    { key: 'firstMidGame', label: 'Mid-Game' },
    { key: 'firstLateGame', label: 'Late-Game' },
    { key: 'firstLateGameCompleted', label: 'Late-Game Done' },
  ];

  /**
   * Operation-completion heatmap → a per-game grid: one cell per (game, op-stage)
   * whose value is the turn that stage was first reached (null if never). Encoded
   * as scatter points (x = stage index, y = game index) carrying `turn` +
   * `gameIndex` so a click resolves back to summaries[gameIndex] for drilldown.
   * PRD-silent: game×stage (vs. turn-bucket) axes are a defensible encoding given
   * core Chart.js lacks a matrix controller.
   * @param {Array} summaries - per-game summaries
   */
  function operationCompletionHeatmap(summaries) {
    const stages = OP_STAGES.map((s) => s.label);
    const cells = [];
    let maxTurn = 0;
    for (let g = 0; g < summaries.length; g++) {
      const ms = summaries[g].milestones || {};
      for (let si = 0; si < OP_STAGES.length; si++) {
        const turn = ms[OP_STAGES[si].key];
        if (turn != null && turn > maxTurn) maxTurn = turn;
        cells.push({ gameIndex: g, stageIndex: si, stage: OP_STAGES[si].label, turn: turn != null ? turn : null });
      }
    }
    // Color each cell by the actual turn it was reached, on a single-hue
    // sequential scale (early turns light → late turns dark). This puts the
    // "which turn" reading on the point's fill — the Y axis is the game row,
    // NOT a turn count. Never-reached cells get a muted neutral so they read as
    // absent rather than as turn 0.
    for (const c of cells) c.color = sequentialTurnColor(c.turn, maxTurn);
    return {
      type: 'scatter',
      stages,
      cells,
      gameCount: summaries.length,
      maxTurn,
      // Y axis is the game's row within the batch — labeled so it can't be
      // misread as the turn number (which is now encoded as the point color).
      options: {
        scales: {
          y: { title: { display: true, text: 'Game #' } },
          x: { title: { display: true, text: 'Operation stage' } },
        },
      },
      // Chart.js scatter dataset: one point per cell (null turns kept so every
      // game row is present + clickable for drilldown). Per-point color carries
      // the turn value on the sequential scale.
      datasets: [{
        label: 'Op milestones',
        data: cells.map((c) => ({ x: c.stageIndex, y: c.gameIndex, turn: c.turn, gameIndex: c.gameIndex })),
        pointBackgroundColor: cells.map((c) => c.color),
      }],
    };
  }

  /**
   * Map a milestone's turn to a color on a single-hue sequential scale: earlier
   * turns are lighter, later turns darker, so the turn a cell was reached is
   * readable from its fill. A null turn (never reached) returns a muted neutral,
   * kept off the sequential ramp so it doesn't read as "turn 0".
   * @param {number|null} turn
   * @param {number} maxTurn - largest turn reached in the batch (scale ceiling)
   * @returns {string} an hsl(...) color
   */
  function sequentialTurnColor(turn, maxTurn) {
    if (turn == null) return 'hsl(0, 0%, 80%)';
    const t = maxTurn > 0 ? turn / maxTurn : 0;
    const lightness = 85 - 55 * t; // 85% (earliest) → 30% (latest)
    return `hsl(210, 70%, ${lightness}%)`;
  }

  /**
   * Milestone timeline → one row per milestone with the MEAN turn it was first
   * reached (over the games that reached it) and how many games reached it.
   * Rows are also exposed as a horizontal-bar labels/datasets pair.
   * @param {Array} summaries - per-game summaries
   */
  function milestoneTimeline(summaries) {
    const defs = [
      { key: 'firstMidGame', label: 'First Mid-Game' },
      { key: 'firstLateGame', label: 'First Late-Game' },
      { key: 'firstLateGameCompleted', label: 'First Late-Game Done' },
      { key: 'victoryTurn', label: 'Victory' },
    ];
    const rows = defs.map((d) => {
      const turns = [];
      for (const s of summaries) {
        const t = (s.milestones || {})[d.key];
        if (t != null) turns.push(t);
      }
      return { milestone: d.label, meanTurn: mean(turns), count: turns.length };
    });
    return {
      type: 'bar',
      labels: rows.map((r) => r.milestone),
      datasets: [{ label: 'Mean turn reached', data: rows.map((r) => r.meanTurn) }],
      rows,
    };
  }

  /**
   * Single-game drilldown → turn-by-turn line of one game's snapshot series.
   * X axis is the game's turns; series are the tracked resources + live headcount.
   * @param {object} summary - one per-game summary (carries .snapshots)
   */
  function singleGameDrilldown(summary) {
    const snapshots = (summary && summary.snapshots) || [];
    const labels = snapshots.map((s) => s.turn);
    return {
      type: 'line',
      labels,
      datasets: [
        { label: 'Influence', data: snapshots.map((s) => s.influence) },
        { label: 'Supplies', data: snapshots.map((s) => s.supplies) },
        { label: 'Heat', data: snapshots.map((s) => s.heat) },
        { label: 'Operatives', data: snapshots.map((s) => s.operatives) },
      ],
      snapshots,
    };
  }

  // Local mean (kept independent of Metrics so transforms are pure + standalone).
  function mean(values) {
    if (!values || values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  // ─── Render / wiring layer (injectable; guarded for happy-dom) ───────────────

  // The eight canvas ids simulate.html exposes, paired with the transform that
  // feeds each. `game` marks charts whose datapoints reference a single game
  // (drilldown source).
  const CHART_SPECS = [
    { id: 'chart-winrate', build: (r) => winRateData(r.aggregate) },
    { id: 'chart-turns', build: (r) => turnCountHistogram(r.summaries) },
    { id: 'chart-resources', build: (r) => resourceCurves(r.summaries) },
    { id: 'chart-crackdown', build: (r) => crackdownAnalysis(r.aggregate) },
    { id: 'chart-funnel', build: (r) => operativeLifecycleFunnel(r.summaries) },
    { id: 'chart-heatmap', build: (r) => operationCompletionHeatmap(r.summaries), game: true },
    { id: 'chart-milestones', build: (r) => milestoneTimeline(r.summaries) },
  ];

  // Live chart instances, keyed by canvas id, so a re-run destroys the old chart
  // before drawing the new one (Chart.js refuses to reuse an occupied canvas).
  const liveCharts = {};

  /** Default factory: real Chart.js, or null when Chart is absent (tests/happy-dom). */
  function defaultChartFactory() {
    if (typeof Chart === 'undefined') return null;
    return (canvas, config) => {
      const ctx = (canvas && typeof canvas.getContext === 'function') ? canvas.getContext('2d') : canvas;
      return new Chart(ctx, config);
    };
  }

  /** Map a transform's data object to a Chart.js config. */
  function toConfig(data, extraOptions) {
    return {
      type: data.type,
      data: { labels: data.labels, datasets: data.datasets },
      options: Object.assign({ responsive: true, maintainAspectRatio: false }, data.options || {}, extraOptions || {}),
    };
  }

  /**
   * Render every chart for a Batch.run result. Pure-guard: a missing canvas or a
   * null chartFactory (no Chart.js loaded) is skipped, never thrown — so a
   * happy-dom test run is safe.
   * @param {object} result - { summaries, aggregate }
   * @param {object} [opts] - { chartFactory, document, onDrilldown }
   * @returns {object} map of canvas id → whatever the factory returned (spy-friendly)
   */
  function renderAll(result, opts = {}) {
    const doc = opts.document || (typeof document !== 'undefined' ? document : null);
    const chartFactory = opts.chartFactory || defaultChartFactory();
    if (!doc || !chartFactory) return {};

    const rendered = {};
    for (const spec of CHART_SPECS) {
      const canvas = doc.getElementById(spec.id);
      if (!canvas) continue;
      if (liveCharts[spec.id] && typeof liveCharts[spec.id].destroy === 'function') {
        liveCharts[spec.id].destroy();
      }
      const data = spec.build(result);
      const extra = spec.game ? { onClick: makeDrilldownHandler(result, data, opts) } : undefined;
      const chart = chartFactory(canvas, toConfig(data, extra));
      liveCharts[spec.id] = chart;
      rendered[spec.id] = chart;
    }
    return rendered;
  }

  /**
   * Build a Chart.js onClick handler that resolves the clicked element back to a
   * game index (via the datapoint's carried `gameIndex`) and renders that game's
   * drilldown. Guarded so a malformed event is a no-op.
   */
  function makeDrilldownHandler(result, data, opts) {
    return (event, elements, chart) => {
      if (!elements || elements.length === 0) return;
      const el = elements[0];
      let gameIndex = null;
      try {
        const point = chart.data.datasets[el.datasetIndex].data[el.index];
        gameIndex = point && point.gameIndex != null ? point.gameIndex : null;
      } catch (e) { gameIndex = null; }
      if (gameIndex == null) return;
      showDrilldown(result.summaries[gameIndex], gameIndex, opts);
    };
  }

  /**
   * Render one game's drilldown into #chart-drilldown. Exposed so any chart's
   * click handler (or a test) can drive it directly.
   * @param {object} summary - the game's per-game summary
   * @param {number} gameIndex
   * @param {object} [opts] - { chartFactory, document }
   */
  function showDrilldown(summary, gameIndex, opts = {}) {
    const doc = opts.document || (typeof document !== 'undefined' ? document : null);
    const chartFactory = opts.chartFactory || defaultChartFactory();
    if (!doc || !chartFactory) return null;
    const canvas = doc.getElementById('chart-drilldown');
    if (!canvas) return null;
    if (liveCharts['chart-drilldown'] && typeof liveCharts['chart-drilldown'].destroy === 'function') {
      liveCharts['chart-drilldown'].destroy();
    }
    const data = singleGameDrilldown(summary);
    const chart = chartFactory(canvas, toConfig(data));
    liveCharts['chart-drilldown'] = chart;

    const caption = doc.getElementById('drilldown-caption');
    if (caption) {
      caption.textContent = `Game #${gameIndex + 1} — ${summary.outcome} in ${summary.turns} turns`;
    }
    return chart;
  }

  /**
   * Wire the Run button: on click, read the Strategy / Difficulty / count controls,
   * run a batch, then render. The engine deps (Batch, Strategies) and the render
   * step are injectable so a DOM-wiring test can spy on them without a real canvas.
   * @param {Element|Document} root - element/document containing the controls
   * @param {object} [opts] - { batch, strategies, render, chartFactory, onProgress }
   * @returns {boolean} whether the Run button was found + wired
   */
  function wireControls(root, opts = {}) {
    if (!root) return false;
    const batch = opts.batch || (typeof Batch !== 'undefined' ? Batch : null);
    const strategies = opts.strategies || (typeof Strategies !== 'undefined' ? Strategies : null);
    const render = opts.render || ((result) => renderAll(result, opts));
    const q = (sel) => root.querySelector(sel);

    const btn = q('#btn-run');
    if (!btn) return false;

    btn.addEventListener('click', async () => {
      const strategyName = (q('#sel-strategy') || {}).value || 'Balanced';
      const difficulty = (q('#sel-difficulty') || {}).value || 'medium';
      const n = parseInt((q('#inp-count') || {}).value, 10) || 0;
      const strategy = strategies ? strategies[strategyName] : null;

      const progressEl = q('#run-progress');
      const onProgress = (done, total) => {
        if (typeof opts.onProgress === 'function') opts.onProgress(done, total);
        if (progressEl) progressEl.textContent = `${done} / ${total}`;
      };

      if (btn.setAttribute) btn.setAttribute('disabled', 'disabled');
      try {
        const result = await batch.run(strategy, { n, difficulty, strategyName, onProgress });
        render(result);
      } finally {
        if (btn.removeAttribute) btn.removeAttribute('disabled');
      }
    });
    return true;
  }

  return {
    // pure transforms
    winRateData,
    turnCountHistogram,
    resourceCurves,
    crackdownAnalysis,
    operativeLifecycleFunnel,
    operationCompletionHeatmap,
    milestoneTimeline,
    singleGameDrilldown,
    // render / wiring
    renderAll,
    showDrilldown,
    wireControls,
    defaultChartFactory,
  };
})();
