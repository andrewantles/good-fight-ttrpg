/**
 * Minimal browser-based test runner for The Good Fight TTRPG.
 * No dependencies — just open tests.html in a browser.
 */

const TestRunner = (() => {
  const suites = [];
  let currentSuite = null;

  /**
   * Define a test suite (group of related tests).
   * @param {string} name - Suite name (e.g., "deck.js")
   * @param {Function} fn - Function containing test() calls
   */
  function describe(name, fn) {
    currentSuite = { name, tests: [], passed: 0, failed: 0, errors: [] };
    suites.push(currentSuite);
    fn();
    currentSuite = null;
  }

  /**
   * Define a single test within a suite.
   * @param {string} name - Test description
   * @param {Function} fn - Test function (can be async)
   */
  function test(name, fn) {
    if (!currentSuite) {
      throw new Error(`test("${name}") called outside of describe()`);
    }
    currentSuite.tests.push({ name, fn });
  }

  // --- Assertions ---

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  function assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(
        message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
      );
    }
  }

  function assertNotEqual(actual, expected, message) {
    if (actual === expected) {
      throw new Error(
        message || `Expected value to differ from ${JSON.stringify(expected)}`
      );
    }
  }

  function assertDeepEqual(actual, expected, message) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) {
      throw new Error(message || `Expected ${b}, got ${a}`);
    }
  }

  function assertThrows(fn, message) {
    let threw = false;
    try {
      fn();
    } catch (e) {
      threw = true;
    }
    if (!threw) {
      throw new Error(message || 'Expected function to throw');
    }
  }

  function assertInRange(value, min, max, message) {
    if (value < min || value > max) {
      throw new Error(
        message || `Expected ${value} to be in range [${min}, ${max}]`
      );
    }
  }

  function assertArrayLength(arr, length, message) {
    if (arr.length !== length) {
      throw new Error(
        message || `Expected array length ${length}, got ${arr.length}`
      );
    }
  }

  // --- Runner ---

  async function runAll() {
    const output = document.getElementById('test-output');
    const summary = document.getElementById('test-summary');
    output.innerHTML = '';

    let totalPassed = 0;
    let totalFailed = 0;

    for (const suite of suites) {
      const suiteEl = document.createElement('div');
      suiteEl.className = 'suite';

      const suiteHeader = document.createElement('h2');
      suiteHeader.textContent = suite.name;
      suiteEl.appendChild(suiteHeader);

      for (const t of suite.tests) {
        const testEl = document.createElement('div');
        testEl.className = 'test';

        try {
          await t.fn();
          suite.passed++;
          totalPassed++;
          testEl.className = 'test pass';
          testEl.innerHTML = `<span class="icon">PASS</span> ${escapeHtml(t.name)}`;
        } catch (e) {
          suite.failed++;
          totalFailed++;
          suite.errors.push({ test: t.name, error: e });
          testEl.className = 'test fail';
          testEl.innerHTML = `<span class="icon">FAIL</span> ${escapeHtml(t.name)}<div class="error-detail">${escapeHtml(e.message)}</div>`;
        }

        suiteEl.appendChild(testEl);
      }

      // Suite summary badge
      const badge = document.createElement('span');
      badge.className = suite.failed > 0 ? 'suite-badge fail' : 'suite-badge pass';
      badge.textContent = `${suite.passed}/${suite.tests.length}`;
      suiteHeader.appendChild(badge);

      output.appendChild(suiteEl);
    }

    // Overall summary
    const total = totalPassed + totalFailed;
    summary.className = totalFailed > 0 ? 'summary fail' : 'summary pass';
    summary.textContent = `${totalPassed} passed, ${totalFailed} failed — ${total} total`;

    return { totalPassed, totalFailed, suites };
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return {
    describe,
    test,
    assert,
    assertEqual,
    assertNotEqual,
    assertDeepEqual,
    assertThrows,
    assertInRange,
    assertArrayLength,
    runAll,
  };
})();
