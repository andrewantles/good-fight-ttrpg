/**
 * Tests for js/simulation/export.js — the #27 CSV / JSON export of batch results.
 *
 * The two serializers are driven against small STATIC fixtures (known summaries /
 * result) asserting exact header names, row values, CSV escaping and the empty
 * case. The wiring suite (ADR-0002) proves each export button reaches its
 * serializer + the injected download `trigger` (no real Blob / anchor), so it
 * FAILS if a button handler is disconnected.
 */

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function exportSummary(over) {
  return Object.assign({
    outcome: 'stall',
    reason: 'max_turns',
    won: false,
    turns: 3,
    final: {
      influence: 0, supplies: 0, heat: 0, peakInfluence: 0,
      operatives: 0, initiates: 0, detained: 0,
      lateGameCompleted: 0, operativesLost: 0, leaderSkillLevel: 0,
    },
    operativesLost: 0,
    crackdownsTriggered: 0,
    crackdownTierCounts: {},
    lateGameTypesCompleted: 0,
    milestones: { firstMidGame: null, firstLateGame: null, firstLateGameCompleted: null, victoryTurn: null },
    snapshots: [],
  }, over || {});
}

// ─── summariesToCsv ───────────────────────────────────────────────────────────

TestRunner.describe('export.js — summariesToCsv', function () {
  TestRunner.test('header names match metric names; nested final/milestones/tiers are prefixed', function () {
    const csv = Export.summariesToCsv([exportSummary()]);
    const header = csv.split('\n')[0];
    const cols = header.split(',');
    // Fixed top-level metric names.
    for (const name of ['outcome', 'reason', 'won', 'turns', 'operativesLost', 'crackdownsTriggered', 'lateGameTypesCompleted']) {
      TestRunner.assert(cols.includes(name), `header has top-level metric "${name}"`);
    }
    // Flattened nested columns.
    TestRunner.assert(cols.includes('final_influence'), 'final.* flattened as final_influence');
    TestRunner.assert(cols.includes('final_leaderSkillLevel'), 'final.* flattened as final_leaderSkillLevel');
    TestRunner.assert(cols.includes('milestone_victoryTurn'), 'milestones.* flattened as milestone_victoryTurn');
    // snapshots must NOT be a column.
    TestRunner.assert(!cols.includes('snapshots'), 'snapshots excluded from CSV');
  });

  TestRunner.test('one row per game with flattened values in column order', function () {
    const summaries = [
      exportSummary({
        outcome: 'victory', reason: 'victory', won: true, turns: 8,
        final: { influence: 42, supplies: 5, heat: 3, peakInfluence: 50, operatives: 4, initiates: 1, detained: 0, lateGameCompleted: 3, operativesLost: 1, leaderSkillLevel: 2 },
        operativesLost: 1, crackdownsTriggered: 2, lateGameTypesCompleted: 3,
        milestones: { firstMidGame: 2, firstLateGame: 5, firstLateGameCompleted: 7, victoryTurn: 8 },
        crackdownTierCounts: { Surveillance: 2 },
      }),
    ];
    const csv = Export.summariesToCsv(summaries);
    const lines = csv.split('\n');
    TestRunner.assertEqual(lines.length, 2, 'header + one data row');
    const cols = lines[0].split(',');
    const vals = lines[1].split(',');
    const at = (name) => vals[cols.indexOf(name)];
    TestRunner.assertEqual(at('outcome'), 'victory', 'outcome value');
    TestRunner.assertEqual(at('won'), 'true', 'boolean stringified');
    TestRunner.assertEqual(at('turns'), '8', 'turns value');
    TestRunner.assertEqual(at('final_influence'), '42', 'final_influence value');
    TestRunner.assertEqual(at('milestone_victoryTurn'), '8', 'milestone_victoryTurn value');
    TestRunner.assertEqual(at('crackdownTier_Surveillance'), '2', 'per-tier count column');
  });

  TestRunner.test('null milestone values render as empty fields', function () {
    const csv = Export.summariesToCsv([exportSummary()]);
    const lines = csv.split('\n');
    const cols = lines[0].split(',');
    const vals = lines[1].split(',');
    TestRunner.assertEqual(vals[cols.indexOf('milestone_victoryTurn')], '', 'null milestone → empty field');
  });

  TestRunner.test('tier columns are the sorted union across all games (missing → 0)', function () {
    const summaries = [
      exportSummary({ crackdownTierCounts: { 'Warehouse Raid': 1 } }),
      exportSummary({ crackdownTierCounts: { Surveillance: 3 } }),
    ];
    const csv = Export.summariesToCsv(summaries);
    const lines = csv.split('\n');
    const cols = lines[0].split(',');
    // Union, alphabetically sorted: Surveillance before Warehouse Raid.
    const sIdx = cols.indexOf('crackdownTier_Surveillance');
    const wIdx = cols.indexOf('crackdownTier_Warehouse Raid');
    TestRunner.assert(sIdx !== -1 && wIdx !== -1, 'both tier columns present');
    TestRunner.assert(sIdx < wIdx, 'tier columns sorted alphabetically');
    // Game 0 has no Surveillance → 0.
    const g0 = lines[1].split(',');
    TestRunner.assertEqual(g0[sIdx], '0', 'missing tier count defaults to 0');
  });

  TestRunner.test('CSV escaping: fields with commas/quotes/newlines are quoted; embedded quotes doubled', function () {
    const csv = Export.summariesToCsv([
      exportSummary({ outcome: 'a,b', reason: 'say "hi"' }),
    ]);
    const dataRow = csv.split('\n')[1];
    TestRunner.assert(dataRow.includes('"a,b"'), 'comma field quoted');
    TestRunner.assert(dataRow.includes('"say ""hi"""'), 'quote field quoted + embedded quotes doubled');
  });

  TestRunner.test('empty input → header-only row (no data lines, no throw)', function () {
    const csv = Export.summariesToCsv([]);
    const lines = csv.split('\n');
    TestRunner.assertEqual(lines.length, 1, 'only the header row');
    TestRunner.assert(lines[0].includes('outcome'), 'header present even with no games');
    TestRunner.assert(!lines[0].includes('snapshots'), 'snapshots never a column');
  });
});

// ─── resultToJson ─────────────────────────────────────────────────────────────

TestRunner.describe('export.js — resultToJson', function () {
  TestRunner.test('round-trips the full dataset including per-turn snapshots', function () {
    const result = {
      summaries: [
        exportSummary({
          turns: 2,
          snapshots: [
            { turn: 1, influence: 5, supplies: 2, heat: 1, operatives: 1 },
            { turn: 2, influence: 9, supplies: 3, heat: 0, operatives: 2 },
          ],
        }),
      ],
      aggregate: { n: 1, strategy: 'Balanced', difficulty: 'medium', wins: 0, winRate: 0 },
    };
    const json = Export.resultToJson(result);
    const parsed = JSON.parse(json);
    TestRunner.assertDeepEqual(parsed, result, 'JSON round-trips to a deep-equal object');
    TestRunner.assertEqual(parsed.summaries[0].snapshots.length, 2, 'snapshots ARE present in the JSON');
    TestRunner.assertEqual(parsed.summaries[0].snapshots[1].influence, 9, 'per-turn snapshot values preserved');
  });
});

// ─── downloadFile (injectable trigger — no real Blob / anchor) ─────────────────

TestRunner.describe('export.js — downloadFile', function () {
  TestRunner.test('routes filename/mime/content to the injected trigger', function () {
    const calls = [];
    Export.downloadFile('x.csv', 'text/csv', 'a,b', { trigger: (f, m, c) => calls.push({ f, m, c }) });
    TestRunner.assertEqual(calls.length, 1, 'trigger called once');
    TestRunner.assertEqual(calls[0].f, 'x.csv', 'filename forwarded');
    TestRunner.assertEqual(calls[0].m, 'text/csv', 'mime forwarded');
    TestRunner.assertEqual(calls[0].c, 'a,b', 'content forwarded');
  });

  TestRunner.test('default download path never throws under the test environment', function () {
    // The default trigger must be safe to invoke with no injected spy — whether or
    // not URL.createObjectURL exists it guards the DOM mechanics rather than throwing.
    let threw = false;
    try { Export.downloadFile('x.json', 'application/json', '{}'); } catch (e) { threw = true; }
    TestRunner.assert(!threw, 'default download path is a guarded no-op (no throw)');
  });
});

// ─── DOM-wiring (ADR-0002): export buttons reach serializer + trigger ──────────

TestRunner.describe('export.js — export button wiring (#27)', function () {
  function exportDOM() {
    const root = document.createElement('div');
    root.innerHTML = `
      <div id="export-actions">
        <button id="btn-export-csv" disabled>Export CSV</button>
        <button id="btn-export-json" disabled>Export JSON</button>
      </div>
    `;
    document.body.appendChild(root);
    return root;
  }

  TestRunner.test('buttons start disabled and enable once a result is set', function () {
    const root = exportDOM();
    try {
      const controller = Export.wireExportControls(root, {});
      TestRunner.assert(root.querySelector('#btn-export-csv').hasAttribute('disabled'), 'CSV disabled before a run');
      TestRunner.assert(root.querySelector('#btn-export-json').hasAttribute('disabled'), 'JSON disabled before a run');
      controller.setResult({ summaries: [exportSummary()], aggregate: { n: 1, strategy: 'Balanced', difficulty: 'medium' } });
      TestRunner.assert(!root.querySelector('#btn-export-csv').hasAttribute('disabled'), 'CSV enabled after result');
      TestRunner.assert(!root.querySelector('#btn-export-json').hasAttribute('disabled'), 'JSON enabled after result');
    } finally {
      root.remove();
    }
  });

  TestRunner.test('clicking Export CSV reaches summariesToCsv → trigger with a .csv filename + text/csv mime', function () {
    const root = exportDOM();
    try {
      const calls = [];
      const controller = Export.wireExportControls(root, { trigger: (f, m, c) => calls.push({ f, m, c }) });
      controller.setResult({
        summaries: [exportSummary({ outcome: 'victory', won: true })],
        aggregate: { n: 1, strategy: 'Balanced', difficulty: 'medium' },
      });

      root.querySelector('#btn-export-csv').click();

      TestRunner.assertEqual(calls.length, 1, 'download trigger fired once (handler connected)');
      TestRunner.assertEqual(calls[0].m, 'text/csv', 'CSV mime type');
      TestRunner.assert(/\.csv$/.test(calls[0].f), 'filename ends in .csv');
      TestRunner.assert(/Balanced/.test(calls[0].f) && /medium/.test(calls[0].f), 'filename carries strategy + difficulty');
      // Content is real CSV from summariesToCsv (has the header row).
      TestRunner.assert(calls[0].c.split('\n')[0].includes('outcome'), 'content is the serialized CSV');
    } finally {
      root.remove();
    }
  });

  TestRunner.test('clicking Export JSON reaches resultToJson → trigger with a .json filename + application/json mime', function () {
    const root = exportDOM();
    try {
      const calls = [];
      const controller = Export.wireExportControls(root, { trigger: (f, m, c) => calls.push({ f, m, c }) });
      const result = {
        summaries: [exportSummary({ snapshots: [{ turn: 1, influence: 5, supplies: 0, heat: 0, operatives: 0 }] })],
        aggregate: { n: 1, strategy: 'Aggressive', difficulty: 'hard' },
      };
      controller.setResult(result);

      root.querySelector('#btn-export-json').click();

      TestRunner.assertEqual(calls.length, 1, 'download trigger fired once (handler connected)');
      TestRunner.assertEqual(calls[0].m, 'application/json', 'JSON mime type');
      TestRunner.assert(/\.json$/.test(calls[0].f), 'filename ends in .json');
      // Content is the full dataset (snapshots included).
      const parsed = JSON.parse(calls[0].c);
      TestRunner.assertEqual(parsed.summaries[0].snapshots.length, 1, 'JSON payload includes per-turn snapshots');
    } finally {
      root.remove();
    }
  });

  TestRunner.test('clicking before any result is a guarded no-op', function () {
    const root = exportDOM();
    try {
      const calls = [];
      Export.wireExportControls(root, { trigger: (f, m, c) => calls.push({ f, m, c }) });
      root.querySelector('#btn-export-csv').click();
      root.querySelector('#btn-export-json').click();
      TestRunner.assertEqual(calls.length, 0, 'no download without a last result');
    } finally {
      root.remove();
    }
  });
});
