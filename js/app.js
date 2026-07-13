/**
 * App initialization and screen routing for The Good Fight TTRPG.
 */
const App = (() => {
  let activeScreen = null;

  // Human-readable labels for in-progress Multi-turn Operations.
  const OPERATION_LABELS = {
    scout: 'Scout',
  };

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

  // Whether the player has dismissed the current showing of the Unwinnable
  // Advisory. Reset whenever the stuck conditions no longer hold, so the
  // advisory can reappear if the player lands back in the same position.
  let advisoryDismissed = false;

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

    // Capture difficulty (easy/medium/hard) — defaults to createInitial's value
    const difficultySelect = document.getElementById('input-difficulty');
    if (difficultySelect) state.difficulty = difficultySelect.value;

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
   * Open the in-game Settings modal (#40). Its first slice is a mid-game
   * Input Mode toggle: two selects (dice / cards) seeded from the current
   * gameState.inputMode. Applying a change updates gameState.inputMode, calls
   * syncInputProviders() so the next Dice.roll/Deck.draw honors the new mode,
   * persists via GameState.save, and closes the modal.
   *
   * This also establishes the bare settings-modal container (matching the
   * js/ui.js .modal-overlay > .modal pattern) that later settings sections
   * (e.g. save-slot management, #41) can extend.
   *
   * The save-slot management section (#41) is the UI surface for the
   * multi-slot engine functions in state.js. It lists named slots
   * (GameState.listSaves), saves the current game to a named slot
   * (GameState.save), loads a slot into the active game (GameState.load →
   * set gameState → re-render), and deletes a slot (GameState.deleteSave).
   * The internal 'current' autosave slot is hidden from the manager — it is
   * the live game, not a user-managed save — and is reserved as a slot name.
   */
  const CURRENT_SLOT = 'current';

  function openSettings() {
    if (!gameState) return;

    const modeOptions = (selected) => ['digital', 'physical']
      .map((v) => `<option value="${v}"${v === selected ? ' selected' : ''}>${v === 'digital' ? 'Digital' : 'Physical'}</option>`)
      .join('');

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h3>Settings</h3>
        <fieldset>
          <legend>Input Mode</legend>
          <label>Dice:
            <select data-settings-dice>${modeOptions(gameState.inputMode.dice)}</select>
          </label>
          <label>Cards:
            <select data-settings-cards>${modeOptions(gameState.inputMode.cards)}</select>
          </label>
        </fieldset>
        <fieldset>
          <legend>Save Slots</legend>
          <div data-settings-slots></div>
          <label>Slot name:
            <input type="text" data-settings-slot-name placeholder="e.g. before-crackdown">
          </label>
          <button type="button" data-settings-save>Save current game to slot</button>
        </fieldset>
        <div class="choice-buttons">
          <button type="button" data-settings-apply>Apply</button>
          <button type="button" data-settings-close>Close</button>
        </div>
      </div>
    `;

    const close = () => overlay.remove();

    // Render the list of user-managed save slots (everything except the
    // internal 'current' autosave), each with Load + Delete controls.
    const renderSlots = () => {
      const list = overlay.querySelector('[data-settings-slots]');
      const names = GameState.listSaves()
        .filter((name) => name !== CURRENT_SLOT)
        .sort();
      if (names.length === 0) {
        list.innerHTML = '<p class="placeholder">No saved slots yet.</p>';
        return;
      }
      list.innerHTML = names.map((name) =>
        `<div class="slot-row" data-slot="${name}">` +
          `<span class="slot-name">${name}</span>` +
          `<button type="button" data-settings-load="${name}">Load</button>` +
          `<button type="button" data-settings-delete="${name}">Delete</button>` +
        '</div>'
      ).join('');
    };

    overlay.querySelector('[data-settings-apply]').addEventListener('click', () => {
      gameState.inputMode.dice = overlay.querySelector('[data-settings-dice]').value;
      gameState.inputMode.cards = overlay.querySelector('[data-settings-cards]').value;
      syncInputProviders();
      GameState.save(gameState, CURRENT_SLOT);
      close();
    });

    overlay.querySelector('[data-settings-close]').addEventListener('click', close);

    // Save the current game to the named slot. Empty names and the reserved
    // 'current' autosave name are rejected so the manager can't clobber the
    // live game's autosave.
    overlay.querySelector('[data-settings-save]').addEventListener('click', () => {
      const input = overlay.querySelector('[data-settings-slot-name]');
      const name = input.value.trim();
      if (!name || name === CURRENT_SLOT) return;
      GameState.save(gameState, name);
      input.value = '';
      renderSlots();
    });

    // Delegate Load / Delete clicks from the slot list.
    overlay.querySelector('[data-settings-slots]').addEventListener('click', (e) => {
      const loadName = e.target.getAttribute && e.target.getAttribute('data-settings-load');
      const deleteName = e.target.getAttribute && e.target.getAttribute('data-settings-delete');
      if (loadName) {
        const loaded = GameState.load(loadName);
        if (!loaded) return;
        gameState = loaded;
        GameState.save(gameState, CURRENT_SLOT); // adopt the loaded game as the live autosave
        syncInputProviders();
        renderGameState();
        close();
      } else if (deleteName) {
        GameState.deleteSave(deleteName);
        renderSlots();
      }
    });

    renderSlots();
    document.body.appendChild(overlay);
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
    renderUnwinnableAdvisory();
    renderLog();
  }

  /**
   * Show/hide the Unwinnable Advisory (#14) — a non-blocking hint shown when
   * the player has no Operatives, no Recruit Pool, and an empty Recruitment
   * Deck. Play is never stopped; the banner is dismissible via
   * #btn-dismiss-advisory. Dismissal persists across re-renders while the
   * conditions still hold, and resets once the position recovers so the hint
   * can reappear if the player becomes stuck again.
   */
  function renderUnwinnableAdvisory() {
    const advisory = document.getElementById('unwinnable-advisory');
    if (!advisory || !gameState) return;

    const stuck =
      gameState.operatives.length === 0 &&
      gameState.recruitPool.length === 0 &&
      gameState.recruitDeck.length === 0;

    if (!stuck) {
      // Position recovered — hide and re-arm for a future recurrence.
      advisoryDismissed = false;
      advisory.hidden = true;
      return;
    }

    advisory.hidden = advisoryDismissed;

    const dismissBtn = document.getElementById('btn-dismiss-advisory');
    if (dismissBtn) {
      // Idempotent wiring — assigning onclick avoids stacking listeners
      // across the many re-renders during a game.
      dismissBtn.onclick = () => {
        advisoryDismissed = true;
        advisory.hidden = true;
      };
    }
  }

  /**
   * Render the available operations into #operations-list.
   * Minor Vandalism is the first wired operation (#33): a single button,
   * gated by Operations.canExecute — no shared "render any operation"
   * abstraction yet.
   */
  function renderOperations() {
    const container = document.getElementById('operations-list');
    if (!container || !gameState) return;

    // Availability is checked against the assignable pool (Leader + Operatives)
    // so the Leader can bootstrap K=1 Operations on a fresh game.
    const pool = GameState.assignablePool(gameState);

    const buttons = [];
    if (Operations.canExecute('minor_vandalism', gameState, pool)) {
      buttons.push(
        '<button class="btn-operation" data-operation="minor_vandalism">Minor Vandalism</button>'
      );
    }
    if (Operations.canExecute('average_vandalism', gameState, pool)) {
      buttons.push(
        '<button class="btn-operation" data-operation="average_vandalism">Average Vandalism</button>'
      );
    }
    if (Operations.canExecute('significant_vandalism', gameState, pool)) {
      buttons.push(
        '<button class="btn-operation" data-operation="significant_vandalism">Significant Vandalism</button>'
      );
    }
    if (Operations.canExecute('gather_supplies', gameState, pool)) {
      buttons.push(
        '<button class="btn-operation" data-operation="gather_supplies">Gather Supplies</button>'
      );
    }
    if (Operations.canExecute('scout', gameState, pool)) {
      buttons.push(
        '<button class="btn-operation" data-operation="scout">Scout</button>'
      );
    }

    // In-progress Multi-turn Operations (e.g. Scout) are shown alongside the
    // available-operation buttons, with their turn countdown.
    const multiTurnHtml = (gameState.multiTurnOps || []).map(op => {
      const label = OPERATION_LABELS[op.operation] || op.operation;
      const turns = op.turnsRemaining;
      return `<div class="multi-turn-op" data-operation="${op.operation}">`
        + `Multi-turn Op: ${label} — ${turns} turn${turns !== 1 ? 's' : ''} remaining</div>`;
    }).join('');

    if (buttons.length === 0 && !multiTurnHtml) {
      container.innerHTML = '<p class="placeholder">No operations available.</p>';
      return;
    }

    container.innerHTML = buttons.join('') + multiTurnHtml;

    const minorBtn = container.querySelector('[data-operation="minor_vandalism"]');
    if (minorBtn) {
      minorBtn.addEventListener('click', () => executeMinorVandalism());
    }

    const averageBtn = container.querySelector('[data-operation="average_vandalism"]');
    if (averageBtn) {
      averageBtn.addEventListener('click', () => executeAverageVandalism());
    }

    const significantBtn = container.querySelector('[data-operation="significant_vandalism"]');
    if (significantBtn) {
      significantBtn.addEventListener('click', () => executeSignificantVandalism());
    }

    const gatherBtn = container.querySelector('[data-operation="gather_supplies"]');
    if (gatherBtn) {
      gatherBtn.addEventListener('click', () => executeGatherSupplies());
    }

    const scoutBtn = container.querySelector('button[data-operation="scout"]');
    if (scoutBtn) {
      scoutBtn.addEventListener('click', () => executeScout());
    }
  }

  /**
   * Execute Minor Vandalism (#33): pick 1 Operative (K=1), resolve via the
   * engine, then reflect resources / log / personnel in the DOM.
   */
  async function executeMinorVandalism() {
    if (!gameState) return;

    const operatives = await UI.assignOperatives(1, GameState.assignablePool(gameState));
    if (!operatives || operatives.length !== 1) return;

    const result = await Operations.resolveMinorVandalism(gameState, operatives);

    if (result.success) {
      addLogEntry(`Minor Vandalism succeeded (rolled ${result.roll}). +1 Influence, +1 Heat.`);
    } else {
      addLogEntry(`Minor Vandalism failed (rolled ${result.roll}). No effect.`);
    }

    GameState.save(gameState, 'current');
    renderGameState();
  }

  /**
   * Execute Average Vandalism (#35): pick 2 Operatives (K=2), resolve via the
   * engine (3 Supplies consumed; success +3 Influence/+3 Heat/+1 recruit pool,
   * failure detains 1 Operative for 1 turn), then reflect resources / log /
   * personnel in the DOM.
   */
  async function executeAverageVandalism() {
    if (!gameState) return;

    const operatives = await UI.assignOperatives(2, GameState.assignablePool(gameState));
    if (!operatives || operatives.length !== 2) return;

    const result = await Operations.resolveAverageVandalism(gameState, operatives);

    if (result.success) {
      addLogEntry(
        `Average Vandalism succeeded (rolled ${result.roll}). +3 Influence, +3 Heat, +1 Recruit Pool.`
      );
    } else {
      addLogEntry(
        `Average Vandalism failed (rolled ${result.roll}). 1 Operative detained for 1 turn.`
      );
    }

    GameState.save(gameState, 'current');
    renderGameState();
  }

  /**
   * Execute Significant Vandalism (#36): pick 4 Operatives (K=4), resolve via
   * the engine (5 Supplies consumed; success +10 Influence/+10 Heat/+2 recruit
   * pool, failure detains 1 Operative for 2 turns plus a Compound-Failure
   * second penalty), then reflect resources / log / personnel in the DOM.
   *
   * The Compound-Failure second penalty is a player choice (detain 1 more
   * Operative vs. lose 2 Supplies) surfaced via the #37 modal. The engine
   * only exercises this choice on failure, so we pass `getSecondPenaltyChoice`
   * — the modal is shown lazily inside the engine's failure branch, never on
   * a successful roll.
   */
  async function executeSignificantVandalism() {
    if (!gameState) return;

    const operatives = await UI.assignOperatives(4, GameState.assignablePool(gameState));
    if (!operatives || operatives.length !== 4) return;

    let secondPenaltyChoice = null;
    const result = await Operations.resolveSignificantVandalism(gameState, operatives, {
      getSecondPenaltyChoice: async () => {
        secondPenaltyChoice = await UI.compoundFailureChoice();
        return secondPenaltyChoice;
      },
    });

    if (result.success) {
      addLogEntry(
        `Significant Vandalism succeeded (rolled ${result.roll}). +10 Influence, +10 Heat, +2 Recruit Pool.`
      );
    } else {
      const secondPenalty = secondPenaltyChoice === 'supplies'
        ? '−2 Supplies'
        : '1 more Operative detained 2 turns';
      addLogEntry(
        `Significant Vandalism failed (rolled ${result.roll}). Compound Failure: 1 Operative detained 2 turns, plus ${secondPenalty}.`
      );
    }

    GameState.save(gameState, 'current');
    renderGameState();
  }

  /**
   * Execute Gather Supplies (#34): pick 1 Operative (K=1), resolve via the
   * engine (3 d100 rolls, +1 Supply per success), then reflect resources /
   * log / personnel in the DOM.
   */
  async function executeGatherSupplies() {
    if (!gameState) return;

    const operatives = await UI.assignOperatives(1, GameState.assignablePool(gameState));
    if (!operatives || operatives.length !== 1) return;

    const result = await Operations.resolveGatherSupplies(gameState, operatives);

    const successes = result.rolls.filter(r => r.success).length;
    const rollList = result.rolls.map(r => r.roll).join(', ');
    addLogEntry(
      `Gather Supplies: ${successes}/3 rolls succeeded (${rollList}). +${result.gained} Supplies.`
    );

    GameState.save(gameState, 'current');
    renderGameState();
  }

  /**
   * Execute the start of a Scout operation (#38): pick 4 Operatives (K=4),
   * then call the engine's Operations.startScout, which consumes 5 Supplies,
   * removes the assigned Operatives from the available pool, and registers a
   * 2-turn Multi-turn Op. There is no dice roll at start — Scout *resolution*
   * (2 turns later, driven by End Turn) is owned by #19, so this handler has
   * no success/failure branch; it only reflects the started op in the DOM.
   */
  async function executeScout() {
    if (!gameState) return;

    const operatives = await UI.assignOperatives(4, GameState.assignablePool(gameState));
    if (!operatives || operatives.length !== 4) return;

    Operations.startScout(gameState, operatives);

    addLogEntry('Scout operation started (−5 Supplies, 4 Operatives assigned). Resolves in 2 turns.');

    GameState.save(gameState, 'current');
    renderGameState();
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
    // The Leader ("You") always counts as an Operative, so it heads the
    // Operatives list — rendered as a Joker with no Recruit/detain controls
    // (this section never shows a Recruit button). assignablePool keeps the
    // Leader-first ordering and stays safe for saves that predate it.
    renderCardList('section-operatives', GameState.assignablePool(gameState));
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
      return `<div class="card-row">${html}</div>`;
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
  }

  /**
   * Render a single card as an HTML string.
   */
  function renderCard(card) {
    const suitIcons = { hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663', spades: '\u2660', joker: '\u{1F0CF}' };
    const suitColors = { hearts: 'red', diamonds: 'red', clubs: 'dark', spades: 'dark', joker: 'leader' };
    const icon = suitIcons[card.suit] || '?';
    const colorClass = 'suit-' + (suitColors[card.suit] || 'dark');
    // The Leader is a Joker rendered as a distinct card ("Leader / You"),
    // never a bare rank/suit \u2014 and never carries Recruit/detain controls.
    if (card.isLeader) {
      return `<span class="card card-leader ${colorClass}"><span class="card-suit">${icon}</span><span class="card-rank">Leader (You)</span></span>`;
    }
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

    // Base die: d10, or d12 if the player spends 1 Supply.
    // The Leader can always attempt Recruitment (per CONTEXT.md) — this
    // flow has no per-Operative attempter selection, so no value gate applies.
    const canAffordSupply = gameState.supplies >= 1;
    const dieChoice = await UI.recruitDieChoice(canAffordSupply);
    let baseDie = 'd10';
    if (dieChoice === 'd12' && canAffordSupply) {
      baseDie = 'd12';
      GameState.addSupplies(gameState, -1);
    }

    const baseRoll = await Dice.roll(baseDie);
    let total = baseRoll;
    let rollBreakdown = `${baseDie}: ${baseRoll}`;

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
   * Render the Victory screen summary (#22): turns taken, operatives lost, and
   * peak Influence reached. Reads the run totals tracked in game state.
   */
  function renderVictory() {
    if (!gameState) return;
    const el = document.getElementById('victory-stats');
    if (!el) return;
    const turns = gameState.currentTurn;
    const lost = gameState.operativesLost || 0;
    const peak = gameState.peakInfluence || 0;
    el.innerHTML =
      `<dl class="victory-stat-list">` +
      `<dt>Turns taken</dt><dd>${turns}</dd>` +
      `<dt>Operatives lost</dt><dd>${lost}</dd>` +
      `<dt>Peak Influence</dt><dd>${peak}</dd>` +
      `</dl>`;
  }

  /**
   * End the current turn (#20). Runs the full end-of-turn sequence in the
   * documented order — timer advancement + multi-turn resolution
   * (Turn.processEndOfTurn), then the Crackdown check + Heat reduction
   * (Crackdown.resolveCrackdown) — then increments the turn counter, persists,
   * and re-renders.
   */
  async function endTurn() {
    if (!gameState) return;

    await Turn.processEndOfTurn(gameState);

    // A Late-Game Operation resolving above may have won the game. Once the
    // Victory flag is set, the run is over: skip the Crackdown/heat step and
    // the turn increment, render the summary, and route to the Victory screen.
    if (gameState.victory) {
      renderVictory();
      GameState.save(gameState, 'current');
      showScreen('victory');
      return;
    }

    const crackdown = await Crackdown.resolveCrackdown(gameState);

    if (crackdown && crackdown.triggered && crackdown.tier) {
      addLogEntry(`Crackdown! ${crackdown.tier.name} (rolled ${crackdown.roll} vs Heat).`);
    }

    gameState.currentTurn += 1;

    GameState.save(gameState, 'current');
    renderGameState();
  }

  /**
   * Update leader skill level to match the highest operative value.
   */
  function updateLeaderSkill() {
    if (!gameState) return;
    const operativeValues = gameState.operatives.map(op => op.value);
    gameState.leaderSkillLevel = Math.max(gameState.leaderSkillLevel, ...operativeValues);
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

    // End Turn button — runs the end-of-turn sequence (#20)
    const btnEndTurn = document.getElementById('btn-end-turn');
    if (btnEndTurn) {
      btnEndTurn.addEventListener('click', () => endTurn());
    }

    // Settings gear — opens the in-game Settings modal (#40)
    const btnSettings = document.getElementById('btn-settings');
    if (btnSettings) {
      btnSettings.addEventListener('click', () => openSettings());
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
    renderOperations,
    renderUnwinnableAdvisory,
    executeMinorVandalism,
    executeAverageVandalism,
    executeSignificantVandalism,
    executeGatherSupplies,
    executeScout,
    renderResources,
    getInfluenceDie,
    attemptRecruit,
    updateLeaderSkill,
    addLogEntry,
    endTurn,
    renderVictory,
    syncInputProviders,
    openSettings,
    init,
    RESISTANCE_VALUES,
    REGIME_TYPES,
  };
})();
