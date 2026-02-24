/**
 * Node + happy-dom test harness for The Good Fight TTRPG.
 *
 * Usage: node tests/run-node.js
 *
 * Sets up a browser-like environment via happy-dom, loads all game modules
 * and test files, runs the test suite, and prints results to the terminal.
 */

const { Window } = require('happy-dom');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// --- Set up browser-like environment ---
const window = new Window({ url: 'http://localhost' });
const document = window.document;

// Expose browser globals that our modules expect
global.window = window;
global.document = document;
global.localStorage = window.localStorage;

// Set up a minimal document body for the test runner's DOM output
document.body.innerHTML = `
  <h1>The Good Fight — Test Suite</h1>
  <div id="test-summary" class="summary">Running...</div>
  <div id="test-output"></div>
  <div id="app" style="display:none"></div>
`;

// --- Helper to load a script file into the global scope ---
// Browser scripts use `const X = (() => { ... })()` which creates globals
// in browser <script> scope but not in Node. We transform top-level
// `const/let/var X =` into `global.X =` so modules can reference each other.
function loadScript(filePath) {
  const absolutePath = path.resolve(__dirname, filePath);
  let code = fs.readFileSync(absolutePath, 'utf-8');
  // Replace top-level declarations (not indented) with global assignments
  code = code.replace(/^(const|let|var)\s+(\w+)\s*=/gm, 'global.$2 =');
  vm.runInThisContext(code, { filename: absolutePath });
}

// --- Load game modules ---
loadScript('../js/state.js');
loadScript('../js/dice.js');
loadScript('../js/deck.js');
loadScript('../js/ui.js');
loadScript('../js/app.js');

// --- Load test runner and test files ---
loadScript('test-runner.js');
loadScript('test-state.js');
loadScript('test-dice.js');
loadScript('test-deck.js');
loadScript('test-ui.js');
loadScript('test-app.js');

// --- Run tests and print results ---
async function main() {
  const results = await global.TestRunner.runAll();

  // Print results from the DOM (mirrors browser output)
  const suites = document.querySelectorAll('.suite');
  for (const suite of suites) {
    const header = suite.querySelector('h2');
    const badge = suite.querySelector('.suite-badge');
    const badgeClass = badge?.className.includes('fail') ? '\x1b[31m' : '\x1b[32m';
    console.log(`\n${badgeClass}[${badge?.textContent}]\x1b[0m ${header?.textContent.replace(badge?.textContent, '').trim()}`);

    const tests = suite.querySelectorAll('.test');
    for (const test of tests) {
      const icon = test.querySelector('.icon');
      const isPass = test.className.includes('pass');
      const color = isPass ? '\x1b[32m' : '\x1b[31m';
      const label = isPass ? 'PASS' : 'FAIL';
      const name = test.textContent.replace(icon?.textContent, '').trim();
      const errorDetail = test.querySelector('.error-detail');

      console.log(`  ${color}${label}\x1b[0m ${name.split('\n')[0]}`);
      if (errorDetail) {
        console.log(`       \x1b[31m${errorDetail.textContent}\x1b[0m`);
      }
    }
  }

  // Summary
  const summary = document.getElementById('test-summary');
  const isFail = summary.className.includes('fail');
  const summaryColor = isFail ? '\x1b[31m' : '\x1b[32m';
  console.log(`\n${summaryColor}${summary.textContent}\x1b[0m\n`);

  // Exit with appropriate code
  process.exit(results.totalFailed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
