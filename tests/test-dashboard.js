/**
 * Tests for js/simulation/dashboard.js — the #26 dashboard's pure chart-data
 * transforms + its injectable render/wiring layer.
 *
 * The transforms are driven against small STATIC fixtures (known aggregate /
 * summaries), asserting exact labels/datasets so a shape regression is caught
 * without ever running a real batch or constructing a real Chart. The wiring
 * suite (ADR-0002) proves the Run button reaches Batch.run with the selected
 * Strategy member + difficulty + count, and that the render entry point fires
 * with the result — using an injected chartFactory spy (no <canvas> needed), so
 * it FAILS if the handler is disconnected.
 */

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Minimal per-game summary factory (only the fields the transforms read).
function fixtureSummary(over) {
  return Object.assign({
    outcome: 'stall',
    reason: 'max_turns',
    won: false,
    turns: 3,
    final: { influence: 0, supplies: 0, heat: 0, operatives: 0, initiates: 0, detained: 0, operativesLost: 0 },
    operativesLost: 0,
    crackdownsTriggered: 0,
    crackdownTierCounts: {},
    lateGameTypesCompleted: 0,
    milestones: { firstMidGame: null, firstLateGame: null, firstLateGameCompleted: null, victoryTurn: null },
    snapshots: [],
  }, over || {});
}

function snap(turn, over) {
  return Object.assign({ turn, influence: 0, supplies: 0, heat: 0, operatives: 0 }, over || {});
}

TestRunner.describe('dashboard.js — winRateData', function () {
  TestRunner.test('splits Wins vs Losses and carries winRate + outcomes', function () {
    const agg = { n: 4, wins: 3, winRate: 0.75, outcomes: { victory: 3, no_legal_moves: 1, max_turns: 0 } };
    const d = Dashboard.winRateData(agg);
    TestRunner.assertEqual(d.type, 'doughnut', 'doughnut chart');
    TestRunner.assertDeepEqual(d.labels, ['Wins', 'Losses'], 'two slices');
    TestRunner.assertDeepEqual(d.datasets[0].data, [3, 1], 'wins and losses (n - wins)');
    TestRunner.assertEqual(d.winRate, 0.75, 'winRate carried through');
    TestRunner.assertEqual(d.outcomes.no_legal_moves, 1, 'outcome counts carried through');
  });
});

TestRunner.describe('dashboard.js — turnCountHistogram', function () {
  TestRunner.test('bins turn counts into contiguous fixed-width bins (empty bins kept)', function () {
    // turns: 1,2 → bin 0 (1-5); 6 → bin 1 (6-10); 13 → bin 2 (11-15). No games in bin... all covered.
    const summaries = [
      fixtureSummary({ turns: 1 }), fixtureSummary({ turns: 2 }),
      fixtureSummary({ turns: 6 }), fixtureSummary({ turns: 13 }),
    ];
    const d = Dashboard.turnCountHistogram(summaries, 5);
    TestRunner.assertEqual(d.type, 'bar', 'bar histogram');
    TestRunner.assertDeepEqual(d.labels, ['1-5', '6-10', '11-15'], 'contiguous bin labels up to the longest game');
    TestRunner.assertDeepEqual(d.datasets[0].data, [2, 1, 1], 'counts per bin');
  });

  TestRunner.test('empty summaries → empty histogram (no throw)', function () {
    const d = Dashboard.turnCountHistogram([], 5);
    TestRunner.assertArrayLength(d.labels, 0, 'no bins');
    TestRunner.assertArrayLength(d.datasets[0].data, 0, 'no counts');
  });
});

TestRunner.describe('dashboard.js — resourceCurves', function () {
  TestRunner.test('mean per turn across games; series length === max turn', function () {
    const summaries = [
      fixtureSummary({ snapshots: [snap(1, { influence: 10, supplies: 4, heat: 0 }), snap(2, { influence: 20, supplies: 6, heat: 2 })] }),
      // second game only reached turn 1 → turn 2 mean uses game 0 only
      fixtureSummary({ snapshots: [snap(1, { influence: 30, supplies: 8, heat: 4 })] }),
    ];
    const d = Dashboard.resourceCurves(summaries);
    TestRunner.assertEqual(d.type, 'line', 'line chart');
    TestRunner.assertDeepEqual(d.labels, [1, 2], 'x axis is turn 1..maxTurn');
    const influence = d.datasets.find((s) => s.label === 'Influence');
    TestRunner.assertDeepEqual(influence.data, [20, 20], 'turn1 mean=(10+30)/2=20, turn2 mean=20 (only game 0)');
    const supplies = d.datasets.find((s) => s.label === 'Supplies');
    TestRunner.assertDeepEqual(supplies.data, [6, 6], 'turn1 mean=(4+8)/2=6, turn2=6');
    TestRunner.assertEqual(d.datasets.length, 3, 'Influence/Supplies/Heat series');
  });
});

TestRunner.describe('dashboard.js — crackdownAnalysis', function () {
  TestRunner.test('bars the aggregate tier distribution with mean/total carried', function () {
    const agg = { crackdowns: { meanPerGame: 1.5, total: 6, tierDistribution: { Surveillance: 4, 'Warehouse Raid': 2 } } };
    const d = Dashboard.crackdownAnalysis(agg);
    TestRunner.assertEqual(d.type, 'bar', 'bar chart');
    TestRunner.assertDeepEqual(d.labels, ['Surveillance', 'Warehouse Raid'], 'tier names');
    TestRunner.assertDeepEqual(d.datasets[0].data, [4, 2], 'per-tier counts');
    TestRunner.assertEqual(d.total, 6, 'total carried');
    TestRunner.assertEqual(d.meanPerGame, 1.5, 'mean per game carried');
  });
});

TestRunner.describe('dashboard.js — operativeLifecycleFunnel', function () {
  TestRunner.test('sums final headcount per stage across games plus captures', function () {
    const summaries = [
      fixtureSummary({ final: { initiates: 2, operatives: 3, detained: 1, operativesLost: 1 }, operativesLost: 1 }),
      fixtureSummary({ final: { initiates: 1, operatives: 4, detained: 0, operativesLost: 2 }, operativesLost: 2 }),
    ];
    const d = Dashboard.operativeLifecycleFunnel(summaries);
    TestRunner.assertDeepEqual(d.labels, ['In Training', 'Active', 'Detained', 'Captured'], 'lifecycle stages');
    TestRunner.assertDeepEqual(d.datasets[0].data, [3, 7, 1, 3], 'summed initiates/operatives/detained/lost');
  });
});

TestRunner.describe('dashboard.js — operationCompletionHeatmap', function () {
  TestRunner.test('one cell per (game, op-stage) carrying the turn reached + gameIndex', function () {
    const summaries = [
      fixtureSummary({ milestones: { firstMidGame: 2, firstLateGame: 5, firstLateGameCompleted: null, victoryTurn: null } }),
      fixtureSummary({ milestones: { firstMidGame: 1, firstLateGame: null, firstLateGameCompleted: null, victoryTurn: null } }),
    ];
    const d = Dashboard.operationCompletionHeatmap(summaries);
    TestRunner.assertDeepEqual(d.stages, ['Mid-Game', 'Late-Game', 'Late-Game Done'], 'three op stages');
    TestRunner.assertEqual(d.cells.length, 6, '2 games x 3 stages');
    TestRunner.assertEqual(d.gameCount, 2, 'game count');
    TestRunner.assertEqual(d.maxTurn, 5, 'max reached turn');
    // Game 0, stage 0 (Mid-Game) reached at turn 2.
    const c00 = d.cells.find((c) => c.gameIndex === 0 && c.stageIndex === 0);
    TestRunner.assertEqual(c00.turn, 2, 'game0 mid-game at turn 2');
    // Game 1, Late-Game never reached → null.
    const c11 = d.cells.find((c) => c.gameIndex === 1 && c.stageIndex === 1);
    TestRunner.assertEqual(c11.turn, null, 'game1 late-game never reached');
    // Scatter datapoints carry gameIndex for drilldown.
    TestRunner.assertEqual(d.datasets[0].data[0].gameIndex, 0, 'datapoint carries gameIndex');
  });

  TestRunner.test('Y axis is explicitly labeled "Game #" (not a turn count)', function () {
    const summaries = [
      fixtureSummary({ milestones: { firstMidGame: 2, firstLateGame: 5, firstLateGameCompleted: null, victoryTurn: null } }),
    ];
    const d = Dashboard.operationCompletionHeatmap(summaries);
    TestRunner.assertEqual(d.options.scales.y.title.text, 'Game #', 'Y axis titled Game #');
    TestRunner.assertEqual(d.options.scales.y.title.display, true, 'Y axis title is displayed');
  });

  TestRunner.test('each point is color-encoded by its actual turn on a sequential scale', function () {
    const summaries = [
      fixtureSummary({ milestones: { firstMidGame: 2, firstLateGame: 8, firstLateGameCompleted: null, victoryTurn: null } }),
    ];
    const d = Dashboard.operationCompletionHeatmap(summaries);
    const colors = d.datasets[0].pointBackgroundColor;
    TestRunner.assert(Array.isArray(colors), 'dataset carries a per-point pointBackgroundColor array');
    TestRunner.assertEqual(colors.length, d.cells.length, 'one color per cell');
    // Each cell also carries a color derived from its turn value.
    const cLow = d.cells.find((c) => c.turn === 2);
    const cHigh = d.cells.find((c) => c.turn === 8);
    const cNull = d.cells.find((c) => c.turn === null);
    TestRunner.assert(cLow.color != null, 'cell with a turn carries a color');
    TestRunner.assert(cLow.color !== cHigh.color, 'different turns → different colors (sequential, not flat)');
    TestRunner.assert(cNull.color !== cLow.color, 'never-reached cell is visually distinct from a reached one');
    // The dataset color array mirrors the per-cell colors in order.
    TestRunner.assertEqual(colors[0], d.cells[0].color, 'pointBackgroundColor mirrors cell colors');
  });
});

TestRunner.describe('dashboard.js — milestoneTimeline', function () {
  TestRunner.test('mean turn + reach count per milestone (only reaching games counted)', function () {
    const summaries = [
      fixtureSummary({ milestones: { firstMidGame: 2, firstLateGame: 6, firstLateGameCompleted: null, victoryTurn: null } }),
      fixtureSummary({ milestones: { firstMidGame: 4, firstLateGame: null, firstLateGameCompleted: null, victoryTurn: null } }),
    ];
    const d = Dashboard.milestoneTimeline(summaries);
    TestRunner.assertDeepEqual(d.labels, ['First Mid-Game', 'First Late-Game', 'First Late-Game Done', 'Victory'], 'milestone rows');
    const midRow = d.rows.find((r) => r.milestone === 'First Mid-Game');
    TestRunner.assertEqual(midRow.meanTurn, 3, 'mean of turns 2 and 4');
    TestRunner.assertEqual(midRow.count, 2, 'both games reached mid-game');
    const lateRow = d.rows.find((r) => r.milestone === 'First Late-Game');
    TestRunner.assertEqual(lateRow.meanTurn, 6, 'only game 0 reached late-game');
    TestRunner.assertEqual(lateRow.count, 1, 'one game reached late-game');
    const vicRow = d.rows.find((r) => r.milestone === 'Victory');
    TestRunner.assertEqual(vicRow.count, 0, 'no victories');
    TestRunner.assertEqual(vicRow.meanTurn, 0, 'no reaching games → mean 0');
  });
});

TestRunner.describe('dashboard.js — singleGameDrilldown', function () {
  TestRunner.test('turn-by-turn series from one game snapshot list', function () {
    const summary = fixtureSummary({
      snapshots: [
        snap(1, { influence: 5, supplies: 2, heat: 1, operatives: 1 }),
        snap(2, { influence: 9, supplies: 3, heat: 0, operatives: 2 }),
      ],
    });
    const d = Dashboard.singleGameDrilldown(summary);
    TestRunner.assertEqual(d.type, 'line', 'line chart');
    TestRunner.assertDeepEqual(d.labels, [1, 2], 'x axis is this game turns');
    TestRunner.assertDeepEqual(d.datasets.find((s) => s.label === 'Influence').data, [5, 9], 'influence series');
    TestRunner.assertDeepEqual(d.datasets.find((s) => s.label === 'Operatives').data, [1, 2], 'headcount series');
  });
});

// ─── Render layer (injected chartFactory spy — no real canvas) ────────────────

TestRunner.describe('dashboard.js — renderAll (injected chartFactory)', function () {
  function makeDoc(ids) {
    const wrap = document.createElement('div');
    for (const id of ids) {
      const c = document.createElement('canvas');
      c.id = id;
      wrap.appendChild(c);
    }
    document.body.appendChild(wrap);
    return wrap;
  }

  TestRunner.test('builds one chart per present canvas via the injected factory', function () {
    const ids = ['chart-winrate', 'chart-turns', 'chart-resources', 'chart-crackdown',
      'chart-funnel', 'chart-heatmap', 'chart-milestones'];
    const wrap = makeDoc(ids);
    try {
      const built = [];
      const chartFactory = (canvas, cfg) => { built.push({ id: canvas.id, type: cfg.type }); return { destroy() {} }; };
      const result = {
        summaries: [fixtureSummary({ turns: 2, snapshots: [snap(1), snap(2)] })],
        aggregate: { n: 1, wins: 0, winRate: 0, outcomes: { victory: 0, no_legal_moves: 0, max_turns: 1 }, crackdowns: { tierDistribution: {}, meanPerGame: 0, total: 0 } },
      };
      const rendered = Dashboard.renderAll(result, { chartFactory, document });
      TestRunner.assertEqual(built.length, ids.length, 'one chart built per canvas');
      TestRunner.assert(rendered['chart-winrate'] != null, 'returns the created chart per id');
    } finally {
      wrap.remove();
    }
  });

  TestRunner.test('no Chart / no canvas is a guarded no-op (never throws)', function () {
    // No canvases in the doc, and an explicit null factory → returns {} without throwing.
    const rendered = Dashboard.renderAll(
      { summaries: [], aggregate: { n: 0, wins: 0, crackdowns: { tierDistribution: {} } } },
      { chartFactory: null, document }
    );
    TestRunner.assertEqual(Object.keys(rendered).length, 0, 'nothing rendered, no throw');
  });
});

TestRunner.describe('dashboard.js — showDrilldown (injected chartFactory)', function () {
  TestRunner.test('renders a game drilldown into #chart-drilldown and captions it', function () {
    const wrap = document.createElement('div');
    const c = document.createElement('canvas'); c.id = 'chart-drilldown';
    const cap = document.createElement('div'); cap.id = 'drilldown-caption';
    wrap.appendChild(c); wrap.appendChild(cap);
    document.body.appendChild(wrap);
    try {
      let builtType = null;
      const chartFactory = (canvas, cfg) => { builtType = cfg.type; return { destroy() {} }; };
      const summary = fixtureSummary({ outcome: 'victory', turns: 7, snapshots: [snap(1), snap(2)] });
      const chart = Dashboard.showDrilldown(summary, 3, { chartFactory, document });
      TestRunner.assert(chart != null, 'drilldown chart created');
      TestRunner.assertEqual(builtType, 'line', 'drilldown is a line chart');
      TestRunner.assertEqual(cap.textContent, 'Game #4 — victory in 7 turns', 'caption reflects the game');
    } finally {
      wrap.remove();
    }
  });
});

// ─── DOM-wiring (ADR-0002): Run button reaches Batch.run + render ─────────────

TestRunner.describe('dashboard.js — Run button wiring (#26)', function () {
  function controlsDOM(strategy, difficulty, count) {
    const root = document.createElement('div');
    root.innerHTML = `
      <select id="sel-strategy"><option value="${strategy}" selected>${strategy}</option></select>
      <select id="sel-difficulty"><option value="${difficulty}" selected>${difficulty}</option></select>
      <input id="inp-count" value="${count}">
      <button id="btn-run">Run</button>
      <span id="run-progress"></span>
    `;
    document.body.appendChild(root);
    return root;
  }

  TestRunner.test('clicking Run calls Batch.run with the selected Strategy member + difficulty + count, then renders the result', async function () {
    const root = controlsDOM('Aggressive', 'hard', '7');
    try {
      const calls = [];
      const fakeResult = { summaries: [], aggregate: {} };
      const batchSpy = { run: (strategy, opts) => { calls.push({ strategy, opts }); return Promise.resolve(fakeResult); } };
      let renderedWith = null;
      const renderSpy = (result) => { renderedWith = result; };

      const wired = Dashboard.wireControls(root, {
        batch: batchSpy,
        strategies: Strategies,
        render: renderSpy,
      });
      TestRunner.assert(wired, 'wireControls found and wired the Run button');

      root.querySelector('#btn-run').click();
      await new Promise((resolve) => setTimeout(resolve, 0)); // let the async handler settle

      TestRunner.assertEqual(calls.length, 1, 'Batch.run invoked exactly once');
      TestRunner.assertEqual(calls[0].strategy, Strategies.Aggressive, 'passed the selected Strategy MEMBER (not its name)');
      TestRunner.assertEqual(calls[0].opts.difficulty, 'hard', 'selected difficulty forwarded');
      TestRunner.assertEqual(calls[0].opts.n, 7, 'game count parsed to a number and forwarded');
      TestRunner.assertEqual(calls[0].opts.strategyName, 'Aggressive', 'strategy name label forwarded');
      TestRunner.assertEqual(renderedWith, fakeResult, 'render entry point called with the batch result');
    } finally {
      root.remove();
    }
  });

  TestRunner.test('renderAll is reached with the result through the default render path (chartFactory spy fires)', async function () {
    const root = controlsDOM('Balanced', 'easy', '1');
    const c = document.createElement('canvas'); c.id = 'chart-winrate';
    document.body.appendChild(c);
    try {
      const fakeResult = {
        summaries: [fixtureSummary()],
        aggregate: { n: 1, wins: 0, winRate: 0, outcomes: {}, crackdowns: { tierDistribution: {} } },
      };
      const batchSpy = { run: () => Promise.resolve(fakeResult) };
      let factoryFired = false;
      const chartFactory = () => { factoryFired = true; return { destroy() {} }; };

      // No `render` override → default render path = Dashboard.renderAll(result, opts).
      Dashboard.wireControls(root, { batch: batchSpy, strategies: Strategies, chartFactory, document });
      root.querySelector('#btn-run').click();
      await new Promise((resolve) => setTimeout(resolve, 0));

      TestRunner.assert(factoryFired, 'default render path reached renderAll → chartFactory (no real canvas needed)');
    } finally {
      root.remove();
      c.remove();
    }
  });
});
