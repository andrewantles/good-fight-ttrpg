/**
 * CSV / JSON export of simulation batch results (#27).
 *
 * Two PURE serializers (no DOM, no side effects — driven straight against
 * fixtures in tests) plus a thin, INJECTABLE download seam and a button-wiring
 * helper for simulate.html's #export-actions slot.
 *
 *   summariesToCsv(summaries) => string
 *     One row per per-game summary. Nested groups are flattened into prefixed
 *     columns (`final_*`, `milestone_*`, `crackdownTier_*`); the big per-turn
 *     `snapshots` array is EXCLUDED. Column order is deterministic (see COLUMNS
 *     below); the dynamic `crackdownTier_*` columns are the sorted union of tier
 *     names seen across the batch, missing → 0. Fields containing commas, quotes
 *     or newlines are quoted and embedded quotes doubled (RFC-4180 style).
 *     Empty input → header-only row.
 *
 *   resultToJson(result) => string
 *     Pretty-printed JSON.stringify of the WHOLE { summaries, aggregate }
 *     dataset, snapshots and all. Round-trips via JSON.parse.
 *
 *   downloadFile(filename, mime, content, { trigger }) — hands (filename, mime,
 *     content) to `trigger`, which defaults to a real Blob + URL.createObjectURL
 *     + anchor-click flow. The default trigger GUARDS on a missing
 *     URL.createObjectURL (happy-dom) so a test run never throws; tests pass a
 *     spy trigger and never touch real Blob/anchor behaviour.
 *
 *   wireExportControls(root, { trigger, result }) — wires the two #export-actions
 *     buttons, returns a controller whose `.setResult(result)` records the last
 *     batch result and enables the buttons. Clicking a button serializes that
 *     last result and calls downloadFile; before any result it's a no-op.
 *
 * PRD-silent choices (flagged): column ordering, the `final_` / `milestone_` /
 * `crackdownTier_` prefixes, alphabetical tier-column order, header-only output
 * for empty input, and the `goodfight-<strategy>-<difficulty>-<n>.<ext>`
 * filename scheme are all defensible defaults the PRD does not pin down.
 */
const Export = (() => {

  // ─── Column layout (deterministic) ──────────────────────────────────────────

  // Fixed top-level metric columns (names match the summary field names).
  const TOP_LEVEL = [
    'outcome', 'reason', 'won', 'turns',
    'operativesLost', 'crackdownsTriggered', 'lateGameTypesCompleted',
  ];
  // Nested `final.*` fields, flattened to `final_<key>`.
  const FINAL_KEYS = [
    'influence', 'supplies', 'heat', 'peakInfluence',
    'operatives', 'initiates', 'detained',
    'lateGameCompleted', 'operativesLost', 'leaderSkillLevel',
  ];
  // Nested `milestones.*` fields, flattened to `milestone_<key>`.
  const MILESTONE_KEYS = [
    'firstMidGame', 'firstLateGame', 'firstLateGameCompleted', 'victoryTurn',
  ];

  // ─── CSV ─────────────────────────────────────────────────────────────────────

  /** RFC-4180-style escape: quote fields with comma/quote/newline, double quotes. */
  function csvEscape(value) {
    const s = value == null ? '' : String(value);
    if (/[",\n\r]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  /**
   * Flatten a batch of per-game summaries to a CSV string (header + one row per
   * game). The big `snapshots` array is intentionally omitted.
   * @param {Array} summaries - per-game summaries (metrics.js shape)
   * @returns {string} CSV text (header-only when `summaries` is empty)
   */
  function summariesToCsv(summaries) {
    const list = summaries || [];

    // Dynamic tier columns: the sorted union of every tier seen across the batch.
    const tierSet = new Set();
    for (const s of list) {
      for (const k of Object.keys((s && s.crackdownTierCounts) || {})) tierSet.add(k);
    }
    const tiers = Array.from(tierSet).sort();

    const header = [
      ...TOP_LEVEL,
      ...FINAL_KEYS.map((k) => 'final_' + k),
      ...MILESTONE_KEYS.map((k) => 'milestone_' + k),
      ...tiers.map((k) => 'crackdownTier_' + k),
    ];

    const lines = [header.map(csvEscape).join(',')];
    for (const s of list) {
      const final = (s && s.final) || {};
      const milestones = (s && s.milestones) || {};
      const tierCounts = (s && s.crackdownTierCounts) || {};
      const values = [
        ...TOP_LEVEL.map((k) => s[k]),
        ...FINAL_KEYS.map((k) => final[k]),
        ...MILESTONE_KEYS.map((k) => milestones[k]),
        ...tiers.map((k) => (tierCounts[k] != null ? tierCounts[k] : 0)),
      ];
      lines.push(values.map(csvEscape).join(','));
    }
    return lines.join('\n');
  }

  // ─── JSON ──────────────────────────────────────────────────────────────────────

  /**
   * Serialize the full batch result (summaries WITH snapshots + aggregate).
   * @param {object} result - { summaries, aggregate }
   * @returns {string} pretty-printed JSON
   */
  function resultToJson(result) {
    return JSON.stringify(result, null, 2);
  }

  // ─── Download seam (injectable; guarded for happy-dom) ──────────────────────

  /**
   * Default trigger: real Blob + object URL + anchor click. Guarded so a missing
   * URL.createObjectURL / document (happy-dom, Node) is a silent no-op, never a
   * throw — the path the default tests exercise.
   */
  function defaultDownloadTrigger(filename, mime, content) {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function'
      || typeof document === 'undefined') {
      return;
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    if (document.body) document.body.appendChild(a);
    a.click();
    if (document.body && a.parentNode === document.body) document.body.removeChild(a);
    if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
  }

  /**
   * Trigger a file download. The actual browser mechanics live in `trigger`
   * (default: {@link defaultDownloadTrigger}); tests inject a spy.
   * @param {string} filename
   * @param {string} mime
   * @param {string} content
   * @param {object} [opts] - { trigger }
   */
  function downloadFile(filename, mime, content, opts = {}) {
    const trigger = opts.trigger || defaultDownloadTrigger;
    return trigger(filename, mime, content);
  }

  // ─── Filenames ───────────────────────────────────────────────────────────────

  /** `goodfight-<strategy>-<difficulty>-<n>.<ext>` from the batch aggregate. */
  function filenameFor(ext, result) {
    const agg = (result && result.aggregate) || {};
    const strategy = agg.strategy || 'strategy';
    const difficulty = agg.difficulty || 'difficulty';
    const n = agg.n != null
      ? agg.n
      : ((result && result.summaries) ? result.summaries.length : 0);
    return `goodfight-${strategy}-${difficulty}-${n}.${ext}`;
  }

  // ─── Wiring (#export-actions buttons) ───────────────────────────────────────

  /**
   * Wire the Export CSV / Export JSON buttons. Buttons are disabled until a
   * result is set (via the returned controller's `.setResult`). A click
   * serializes the last result and hands it to downloadFile; injectable
   * `trigger` keeps the download testable without real Blob/anchor behaviour.
   * @param {Element|Document} root - element containing the export buttons
   * @param {object} [opts] - { trigger, result }
   * @returns {?object} controller { setResult, getResult } (null if root missing)
   */
  function wireExportControls(root, opts = {}) {
    if (!root) return null;
    const q = (sel) => root.querySelector(sel);
    const csvBtn = q('#btn-export-csv');
    const jsonBtn = q('#btn-export-json');
    const trigger = opts.trigger;

    let lastResult = opts.result || null;

    function setEnabled(enabled) {
      for (const btn of [csvBtn, jsonBtn]) {
        if (!btn) continue;
        if (enabled) btn.removeAttribute('disabled');
        else btn.setAttribute('disabled', 'disabled');
      }
    }
    setEnabled(!!lastResult);

    if (csvBtn) {
      csvBtn.addEventListener('click', () => {
        if (!lastResult) return;
        const csv = summariesToCsv(lastResult.summaries);
        downloadFile(filenameFor('csv', lastResult), 'text/csv', csv, { trigger });
      });
    }
    if (jsonBtn) {
      jsonBtn.addEventListener('click', () => {
        if (!lastResult) return;
        const json = resultToJson(lastResult);
        downloadFile(filenameFor('json', lastResult), 'application/json', json, { trigger });
      });
    }

    return {
      setResult(result) { lastResult = result; setEnabled(!!result); },
      getResult() { return lastResult; },
    };
  }

  return {
    // pure serializers
    summariesToCsv,
    resultToJson,
    // download seam + wiring
    downloadFile,
    defaultDownloadTrigger,
    filenameFor,
    wireExportControls,
  };
})();
