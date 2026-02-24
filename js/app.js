/**
 * App initialization and screen routing for The Good Fight TTRPG.
 */
const App = (() => {
  let activeScreen = null;

  // d6 setup tables — exact text from the rulebook
  const RESISTANCE_VALUES = [
    'Liberty & Freedom',
    'Equality',
    'Collective Solidarity & Unity',
    'Democratic Processes',
    'Truth & Transparency',
    'Cultural & Historical Preservation',
  ];

  const REGIME_TYPES = [
    'Dictatorship',
    'Oligarchy',
    'Theocracy',
    'Surveillance State',
    'Foreign Occupation',
    'Kleptocracy',
  ];

  /**
   * Show a screen by name, hiding all others.
   * Screens are identified by data-screen attribute.
   * @param {string} name - 'title', 'setup', 'game', or 'victory'
   */
  function showScreen(name) {
    const screens = document.querySelectorAll('[data-screen]');
    for (const screen of screens) {
      screen.classList.toggle('active', screen.dataset.screen === name);
    }
    activeScreen = name;
  }

  /**
   * Get the currently active screen name.
   * @returns {string|null}
   */
  function currentScreen() {
    return activeScreen;
  }

  /**
   * Roll a d6 and check the matching checkbox in a setup table.
   * @param {string} groupName - 'resistance' or 'regime'
   */
  async function rollForSetup(groupName) {
    const result = await Dice.roll('d6');
    const checkbox = document.querySelector(
      `input[name="${groupName}"][value="${result}"]`
    );
    if (checkbox) checkbox.checked = true;
  }

  /**
   * Get the selected values from a setup checkbox group.
   * @param {string} groupName - 'resistance' or 'regime'
   * @returns {string[]} Array of selected option labels
   */
  function getSetupSelections(groupName) {
    const table = groupName === 'resistance' ? RESISTANCE_VALUES : REGIME_TYPES;
    const checkboxes = document.querySelectorAll(`input[name="${groupName}"]:checked`);
    return Array.from(checkboxes).map(cb => table[parseInt(cb.value, 10) - 1]);
  }

  /**
   * Initialize the app — show title screen, wire up navigation.
   */
  function init() {
    showScreen('title');

    // Title screen buttons
    const btnNew = document.getElementById('btn-new-game');
    if (btnNew) {
      btnNew.addEventListener('click', () => showScreen('setup'));
    }

    // Setup roll buttons
    const btnRollRes = document.getElementById('btn-roll-resistance');
    if (btnRollRes) {
      btnRollRes.addEventListener('click', () => rollForSetup('resistance'));
    }

    const btnRollReg = document.getElementById('btn-roll-regime');
    if (btnRollReg) {
      btnRollReg.addEventListener('click', () => rollForSetup('regime'));
    }

    // Victory return button
    const btnReturn = document.getElementById('btn-title-return');
    if (btnReturn) {
      btnReturn.addEventListener('click', () => showScreen('title'));
    }
  }

  return {
    showScreen,
    currentScreen,
    rollForSetup,
    getSetupSelections,
    init,
    RESISTANCE_VALUES,
    REGIME_TYPES,
  };
})();
