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

  // Active game state — the single source of truth while playing
  let gameState = null;

  // Selected operative indices (for operation assignment)
  let selectedOperativeIndices = new Set();

  /**
   * Get the current game state.
   * @returns {object|null}
   */
  function getState() {
    return gameState;
  }

  /**
   * Begin a new game from the setup screen.
   * Captures selections, initializes state, creates deck, transitions to game.
   */
  function beginGame() {
    const state = GameState.createInitial();

    // Capture setup selections
    state.resistanceValues = getSetupSelections('resistance');
    state.regimeType = getSetupSelections('regime');

    // Capture input mode
    const diceSelect = document.getElementById('input-mode-dice');
    const cardsSelect = document.getElementById('input-mode-cards');
    if (diceSelect) state.inputMode.dice = diceSelect.value;
    if (cardsSelect) state.inputMode.cards = cardsSelect.value;

    // Create and shuffle the recruitment deck
    state.recruitDeck = Deck.createDeck();
    Deck.shuffle(state.recruitDeck);

    // Set starting resources (per rules: start with 0 of everything)
    state.influence = 0;
    state.heat = 0;
    state.supplies = 0;
    state.currentTurn = 1;

    gameState = state;

    // Wire up input providers based on mode
    syncInputProviders();

    // Save initial state
    GameState.save(state, 'current');

    // Transition to game screen
    showScreen('game');

    // Render initial game state
    renderGameState();
  }

  /**
   * Continue a saved game.
   */
  function continueGame() {
    const state = GameState.load('current');
    if (!state) return;
    gameState = state;
    syncInputProviders();
    showScreen('game');
    renderGameState();
  }

  /**
   * Set dice/card providers based on current input mode.
   */
  function syncInputProviders() {
    if (!gameState) return;
    if (gameState.inputMode.dice === 'physical') {
      Dice.setProvider(UI.diceInput);
    } else {
      Dice.setProvider(null);
    }
    if (gameState.inputMode.cards === 'physical') {
      Deck.setProvider(UI.cardInput);
    } else {
      Deck.setProvider(null);
    }
  }

  /**
   * Update the resource display in the top bar.
   */
  function renderResources() {
    if (!gameState) return;
    const el = (id) => document.getElementById(id);
    const valInfluence = el('val-influence');
    const valHeat = el('val-heat');
    const valSupplies = el('val-supplies');
    const valTurn = el('val-turn');
    const valLeader = el('val-leader');
    if (valInfluence) valInfluence.textContent = gameState.influence;
    if (valHeat) valHeat.textContent = gameState.heat;
    if (valSupplies) valSupplies.textContent = gameState.supplies;
    if (valTurn) valTurn.textContent = gameState.currentTurn;
    if (valLeader) valLeader.textContent = gameState.leaderSkillLevel;

    // Color-code heat
    if (valHeat) {
      valHeat.classList.remove('heat-low', 'heat-med', 'heat-high', 'heat-critical');
      if (gameState.heat >= 75) valHeat.classList.add('heat-critical');
      else if (gameState.heat >= 50) valHeat.classList.add('heat-high');
      else if (gameState.heat >= 25) valHeat.classList.add('heat-med');
      else valHeat.classList.add('heat-low');
    }
  }

  /**
   * Render the full game state (resources + personnel + log).
   */
  function renderGameState() {
    renderResources();
    renderPersonnel();
    renderOperations();
  }

  /**
   * Render personnel panel sections.
   */
  function renderPersonnel() {
    if (!gameState) return;

    renderCardList('section-recruit-pool', gameState.recruitPool, { showRecruit: true });
    renderCardList('section-initiates', gameState.initiates.map(i => i.card), {
      badges: gameState.initiates.map(i => `${i.turnsRemaining} turn${i.turnsRemaining !== 1 ? 's' : ''}`)
    });
    renderCardList('section-operatives', gameState.operatives, { selectable: true });
    renderCardList('section-detained', gameState.detainedOperatives.map(d => d.card), {
      badges: gameState.detainedOperatives.map(d => `${d.turnsRemaining} turn${d.turnsRemaining !== 1 ? 's' : ''}`)
    });
  }

  /**
   * Render a list of cards into a section's .card-list container.
   */
  function renderCardList(sectionId, cards, options) {
    options = options || {};
    const section = document.getElementById(sectionId);
    if (!section) return;
    const container = section.querySelector('.card-list');
    if (!container) return;

    if (!cards || cards.length === 0) {
      container.innerHTML = '<span class="empty-list">None</span>';
      return;
    }

    container.innerHTML = cards.map((card, i) => {
      let html = renderCard(card);
      if (options.badges && options.badges[i]) {
        html += ` <span class="badge">${options.badges[i]}</span>`;
      }
      if (options.showRecruit) {
        html += ` <button class="btn-recruit" data-card-index="${i}">Recruit</button>`;
      }
      const selectedClass = (options.selectable && selectedOperativeIndices.has(i)) ? ' selected' : '';
      return `<div class="card-row${selectedClass}" data-operative-index="${i}">${html}</div>`;
    }).join('');

    // Wire recruit buttons
    if (options.showRecruit) {
      container.querySelectorAll('.btn-recruit').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.cardIndex, 10);
          attemptRecruit(idx);
        });
      });
    }

    // Wire operative selection click handlers
    if (options.selectable) {
      container.querySelectorAll('.card-row').forEach(row => {
        row.addEventListener('click', (e) => {
          // Don't toggle if they clicked a button inside the row
          if (e.target.tagName === 'BUTTON') return;
          const idx = parseInt(row.dataset.operativeIndex, 10);
          if (selectedOperativeIndices.has(idx)) {
            deselectOperative(idx);
          } else {
            selectOperative(idx);
          }
          renderPersonnel();
          renderOperations();
        });
      });
    }
  }

  /**
   * Render a single card as an HTML string.
   */
  function renderCard(card) {
    const suitIcons = { hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663', spades: '\u2660' };
    const suitColors = { hearts: 'red', diamonds: 'red', clubs: 'dark', spades: 'dark' };
    const icon = suitIcons[card.suit] || '?';
    const colorClass = 'suit-' + (suitColors[card.suit] || 'dark');
    return `<span class="card ${colorClass}"><span class="card-suit">${icon}</span><span class="card-rank">${card.rank}</span><span class="card-value">(${card.value})</span></span>`;
  }

  /**
   * Get the influence die upgrade tier.
   * 50=+d4, 100=+d6, 150=+d8, 200=+d10, 250=+d12, 300+=+d20
   */
  function getInfluenceDie(influence) {
    if (influence >= 300) return 'd20';
    if (influence >= 250) return 'd12';
    if (influence >= 200) return 'd10';
    if (influence >= 150) return 'd8';
    if (influence >= 100) return 'd6';
    if (influence >= 50) return 'd4';
    return null;
  }

  /**
   * Attempt to recruit a card from the recruit pool.
   * @param {number} poolIndex - Index of the card in recruitPool
   */
  async function attemptRecruit(poolIndex) {
    if (!gameState) return;
    const card = gameState.recruitPool[poolIndex];
    if (!card) return;

    // Roll d10 base
    const baseRoll = await Dice.roll('d10');
    let total = baseRoll;
    let rollBreakdown = `d10: ${baseRoll}`;

    // Influence bonus die
    const bonusDie = getInfluenceDie(gameState.influence);
    if (bonusDie) {
      const bonusRoll = await Dice.roll(bonusDie);
      total += bonusRoll;
      rollBreakdown += ` + ${bonusDie}: ${bonusRoll}`;
    }

    const target = card.value;
    const success = total >= target;

    if (success) {
      // Move from pool to initiates with 2-turn timer
      gameState.recruitPool.splice(poolIndex, 1);
      gameState.initiates.push({ card: card, turnsRemaining: 2 });
      addLogEntry(`Recruit success! ${card.rank}${suitSymbol(card.suit)} (${rollBreakdown} = ${total} vs ${target}) → Initiate (2 turns)`);
    } else {
      addLogEntry(`Recruit failed. ${card.rank}${suitSymbol(card.suit)} (${rollBreakdown} = ${total} vs ${target}) — stays in pool.`);
    }

    GameState.save(gameState, 'current');
    renderGameState();
  }

  function suitSymbol(suit) {
    const icons = { hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663', spades: '\u2660' };
    return icons[suit] || '';
  }

  /**
   * Add an entry to the turn log.
   */
  function addLogEntry(text) {
    if (!gameState) return;
    gameState.turnLog.push({ turn: gameState.currentTurn, text: text });
    renderLog();
  }

  /**
   * Render the turn log panel.
   */
  function renderLog() {
    const logEl = document.getElementById('turn-log');
    if (!logEl || !gameState) return;
    if (gameState.turnLog.length === 0) {
      logEl.innerHTML = '<p class="placeholder">Events will appear here as you play.</p>';
      return;
    }
    logEl.innerHTML = gameState.turnLog.map(entry =>
      `<div class="log-entry"><span class="log-turn">T${entry.turn}</span> ${entry.text}</div>`
    ).join('');
    logEl.scrollTop = logEl.scrollHeight;
  }

  /**
   * Draw cards to the recruit pool.
   * @param {number} count
   */
  async function drawToPool(count) {
    if (!gameState) return;
    const drawn = await Deck.draw(gameState.recruitDeck, count);
    gameState.recruitPool.push(...drawn);
    for (const card of drawn) {
      addLogEntry(`Drew ${card.rank}${suitSymbol(card.suit)} (value ${card.value}) to recruit pool.`);
    }
    GameState.save(gameState, 'current');
    renderGameState();
  }

  /**
   * Update leader skill level to match the highest operative value.
   */
  function updateLeaderSkill() {
    if (!gameState) return;
    if (gameState.operatives.length === 0) {
      gameState.leaderSkillLevel = 0;
    } else {
      gameState.leaderSkillLevel = Math.max(...gameState.operatives.map(op => op.value));
    }
  }

  // ─── Operative Selection ─────────────────────────────────────────────────────

  /**
   * Select an operative by index.
   * @param {number} index - Index in gameState.operatives
   */
  function selectOperative(index) {
    if (!gameState || index < 0 || index >= gameState.operatives.length) return;
    selectedOperativeIndices.add(index);
  }

  /**
   * Deselect an operative by index.
   * @param {number} index - Index in gameState.operatives
   */
  function deselectOperative(index) {
    selectedOperativeIndices.delete(index);
  }

  /**
   * Get currently selected operatives.
   * @returns {Array} Array of operative card objects
   */
  function getSelectedOperatives() {
    if (!gameState) return [];
    return Array.from(selectedOperativeIndices)
      .filter(i => i < gameState.operatives.length)
      .sort((a, b) => a - b)
      .map(i => gameState.operatives[i]);
  }

  // ─── Operations List ────────────────────────────────────────────────────────

  /** Standard operations to display in the operations panel. */
  const STANDARD_OPERATIONS = [
    { id: 'minor_vandalism',       name: 'Minor Vandalism',       reqOps: 1, reqSupplies: 0 },
    { id: 'average_vandalism',     name: 'Average Vandalism',     reqOps: 2, reqSupplies: 3 },
    { id: 'significant_vandalism', name: 'Significant Vandalism', reqOps: 4, reqSupplies: 5 },
    { id: 'gather_supplies',       name: 'Gather Supplies',       reqOps: 1, reqSupplies: 0 },
    { id: 'scout',                 name: 'Scout / Recon',         reqOps: 4, reqSupplies: 5 },
  ];

  /**
   * Render the operations list in the center panel.
   */
  function renderOperations() {
    const container = document.getElementById('operations-list');
    if (!container || !gameState) return;

    const selected = getSelectedOperatives();

    container.innerHTML = STANDARD_OPERATIONS.map(op => {
      const canExec = Operations.canExecute(op.id, gameState, selected);
      const statusClass = canExec ? 'op-available' : 'op-unavailable';
      const reqMet = canExec ? 'Requirements met' : `Needs ${op.reqOps} operative${op.reqOps !== 1 ? 's' : ''}${op.reqSupplies > 0 ? ', ' + op.reqSupplies + ' supplies' : ''}`;

      return `<div class="operation-entry ${statusClass}" data-operation="${op.id}">
        <div class="op-header">
          <span class="op-name">${op.name}</span>
          <span class="op-reqs">${reqMet}</span>
        </div>
        <button class="btn-execute" ${canExec ? '' : 'disabled'} data-operation="${op.id}">Execute</button>
      </div>`;
    }).join('');

    // Wire execute buttons
    container.querySelectorAll('.btn-execute').forEach(btn => {
      btn.addEventListener('click', () => {
        executeOperation(btn.dataset.operation);
      });
    });
  }

  // ─── Operation Execution ────────────────────────────────────────────────────

  /**
   * Execute an operation with currently selected operatives.
   * @param {string} operationId
   */
  async function executeOperation(operationId) {
    if (!gameState) return;
    const selected = getSelectedOperatives();
    if (!Operations.canExecute(operationId, gameState, selected)) return;

    // Copy selected operatives for the operation (some operations shift from the array)
    const ops = [...selected];

    let result;
    let effects = [];
    let playerChoice = null;

    const stateBefore = {
      influence: gameState.influence,
      heat: gameState.heat,
      supplies: gameState.supplies,
    };

    switch (operationId) {
      case 'minor_vandalism': {
        result = await Operations.resolveMinorVandalism(gameState, ops);
        if (result.success) {
          effects.push('+1 influence', '+1 heat');
        }
        break;
      }
      case 'average_vandalism': {
        result = await Operations.resolveAverageVandalism(gameState, ops);
        effects.push('-3 supplies');
        if (result.success) {
          effects.push('+3 influence', '+3 heat', '+1 recruit');
        } else {
          effects.push('1 operative detained (1 turn)');
        }
        break;
      }
      case 'significant_vandalism': {
        // For Sig Vandalism, we need to ask the player their penalty choice before resolving
        // because the resolution function applies penalties immediately.
        // We do a pre-execution choice if relevant.
        const preChoice = await askPreExecutionChoice(operationId);
        result = await Operations.resolveSignificantVandalism(gameState, ops, { secondPenaltyChoice: preChoice || 'detain' });
        effects.push('-5 supplies');
        if (result.success) {
          effects.push('+10 influence', '+10 heat', '+2 recruits');
        } else {
          effects.push('1 operative detained (2 turns)');
          if (preChoice === 'supplies') {
            effects.push('-2 supplies (chosen penalty)');
          } else {
            effects.push('1 more operative detained (2 turns)');
          }
        }
        break;
      }
      case 'gather_supplies': {
        result = await Operations.resolveGatherSupplies(gameState, ops);
        if (result.gained > 0) {
          effects.push(`+${result.gained} supplies`);
        } else {
          effects.push('No supplies gained');
        }
        break;
      }
      case 'scout': {
        // Scout is a multi-turn op — start it
        Operations.startScout(gameState, ops);
        result = { roll: null, success: null };
        effects.push('-5 supplies', 'Scout started (2 turns)');
        break;
      }
    }

    // Clear selection
    selectedOperativeIndices.clear();

    // Build rolls array for the modal
    let rolls = [];
    if (result && result.roll !== undefined && result.roll !== null) {
      const target = 100 - stateBefore.heat;
      rolls.push({ value: result.roll, target: target, success: result.success });
    } else if (result && result.rolls) {
      // Gather supplies has multiple rolls
      const target = 100 - stateBefore.heat + Math.floor(stateBefore.influence / 2);
      rolls = result.rolls.map(r => ({ value: r.roll, target: target, success: r.success }));
    }

    // Save and re-render
    GameState.save(gameState, 'current');
    renderGameState();
    renderOperations();

    // Find the operation name
    const opDef = STANDARD_OPERATIONS.find(o => o.id === operationId);
    const opName = opDef ? opDef.name : operationId;

    // Log the result
    if (result && result.success !== null) {
      addLogEntry(`${opName}: ${result.success ? 'Success' : 'Failure'}. ${effects.join(', ')}`);
    } else {
      addLogEntry(`${opName}: ${effects.join(', ')}`);
    }

    GameState.save(gameState, 'current');
  }

  /**
   * For operations with player choice on failure, ask before execution.
   * Returns the choice value or null if not applicable.
   */
  async function askPreExecutionChoice(operationId) {
    // Only significant_vandalism and scout need pre-execution choices
    if (operationId !== 'significant_vandalism' && operationId !== 'scout') return null;
    // We'll show a simple choice modal
    const prompt = 'If this operation fails, choose your penalty:';
    const options = [
      { label: 'Detain 1 more operative', value: 'detain' },
      { label: 'Lose 2 supplies', value: 'supplies' },
    ];
    return UI.showResolutionModal({
      operationName: 'Penalty Choice',
      rolls: [],
      effects: [],
      playerChoice: { prompt, options },
    });
  }

  /**
   * Initialize the app — show title screen, wire up navigation.
   */
  function init() {
    // Check for existing save to enable Continue button
    const hasSave = GameState.load('current') !== null;

    showScreen('title');

    // Title screen buttons
    const btnNew = document.getElementById('btn-new-game');
    if (btnNew) {
      btnNew.addEventListener('click', () => showScreen('setup'));
    }

    const btnContinue = document.getElementById('btn-continue');
    if (btnContinue) {
      btnContinue.disabled = !hasSave;
      btnContinue.addEventListener('click', () => continueGame());
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

    // Begin button
    const btnBegin = document.getElementById('btn-begin');
    if (btnBegin) {
      btnBegin.addEventListener('click', () => beginGame());
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
    beginGame,
    continueGame,
    getState,
    renderCard,
    renderPersonnel,
    renderGameState,
    renderResources,
    renderOperations,
    getInfluenceDie,
    attemptRecruit,
    drawToPool,
    updateLeaderSkill,
    addLogEntry,
    syncInputProviders,
    selectOperative,
    deselectOperative,
    getSelectedOperatives,
    executeOperation,
    init,
    RESISTANCE_VALUES,
    REGIME_TYPES,
  };
})();
