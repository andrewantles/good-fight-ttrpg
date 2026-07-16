/**
 * App initialization and screen routing for The Good Fight TTRPG.
 */
const App = (() => {
  let activeScreen = null;

  // Static rule-content tooltip for the Recruit action (#61). Recruit is a
  // d10/d12 roll-over Attempt, not a d100 Operation, so it has no OPERATION_META
  // entry; its tooltip is sourced here in the same requirements/success/failure
  // shape as the Operation tooltips.
  const RECRUIT_TOOLTIP = [
    'Recruit',
    'Requires: an eligible Operative (or the Leader) whose value beats the target card; optionally spend 1 Supply to upgrade the die (d10 → d12).',
    'Success: the card joins as an Initiate (activates in 2 turns).',
    'Failure: the card stays in the Recruit Pool.',
  ].join('\n');

  // Human-readable labels for in-progress Multi-turn Operations.
  const OPERATION_LABELS = {
    scout: 'Scout',
    late_game_scout: 'Late-Game Scout',
    late_game_op: 'Late-Game Operation',
  };

  // Fixed Operations rendered every turn (as opposed to the per-opportunity
  // Mid/Late-Game Operation buttons, which only appear once scouted). Order is
  // display order. Late-Game Scout shares the late_game_op requirements, so its
  // availability is gated by canExecute('late_game_op', …).
  const FIXED_OPERATIONS = [
    'minor_vandalism',
    'average_vandalism',
    'significant_vandalism',
    'gather_supplies',
    'scout',
    'late_game_scout',
  ];

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
    // Back-compat: a mid-game save may carry a nonzero leaderSkillLevel while
    // leader.value predates the sync (#48). Reconcile so the Leader contributes
    // its skill to operation math immediately. Guards saves with no leader.
    GameState.updateLeaderSkill(gameState);
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

    // Proximity-to-max fill bars (Heat 0–100, Influence 0–500). Supplies has
    // no fixed ceiling, so it gets no bar. (#58)
    const pct = (value, max) => Math.max(0, Math.min(100, (value / max) * 100)) + '%';
    const barInfluence = el('bar-influence');
    const barHeat = el('bar-heat');
    if (barInfluence) barInfluence.style.width = pct(gameState.influence, 500);
    if (barHeat) barHeat.style.width = pct(gameState.heat, 100);

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
   * Difficulty-appropriate Influence threshold to display / gate an Operation.
   * Mid/Late-Game types carry an `influenceThreshold` map (easy/medium/hard);
   * every other Operation uses its flat `requirements.influence` (usually 0).
   * @param {object} meta - an OPERATION_META entry
   * @returns {number}
   */
  function operationInfluenceThreshold(meta) {
    if (meta.influenceThreshold) {
      const diff = (gameState && gameState.difficulty) || 'medium';
      return meta.influenceThreshold[diff] ?? meta.influenceThreshold.medium;
    }
    return (meta.requirements && meta.requirements.influence) || 0;
  }

  /**
   * Human-readable "Requires: …" line for an Operation, listing only the
   * resource costs that actually apply (non-zero), read from OPERATION_META.
   * @param {object} meta - an OPERATION_META entry
   * @returns {string}
   */
  function formatOperationRequirements(meta) {
    const reqs = meta.requirements || {};
    const parts = [];
    if (reqs.operatives) {
      parts.push(`${reqs.operatives} Operative${reqs.operatives !== 1 ? 's' : ''}`);
    }
    if (reqs.supplies) parts.push(`${reqs.supplies} Supplies`);
    const influence = operationInfluenceThreshold(meta);
    if (influence) parts.push(`${influence} Influence`);
    return 'Requires: ' + (parts.length ? parts.join(', ') : 'None');
  }

  /**
   * "Locked: needs X (have Y)" line (#62) naming every resource type an
   * Operation is currently short on — Influence, then Supplies, then
   * Operatives, in that order — comparing the OPERATION_META requirements
   * against live state. Returns '' when nothing is short.
   * @param {object} meta - an OPERATION_META entry
   * @param {object} state - live game state
   * @param {Array} pool - untapped assignable units
   * @returns {string}
   */
  function formatLockedReason(meta, state, pool) {
    const reqs = meta.requirements || {};
    const shorts = [];
    const influenceNeed = operationInfluenceThreshold(meta);
    if (influenceNeed && state.influence < influenceNeed) {
      shorts.push(`${influenceNeed} Influence (have ${state.influence})`);
    }
    if (reqs.supplies && state.supplies < reqs.supplies) {
      shorts.push(`${reqs.supplies} Supplies (have ${state.supplies})`);
    }
    if (reqs.operatives && pool.length < reqs.operatives) {
      shorts.push(`${reqs.operatives} Operative${reqs.operatives !== 1 ? 's' : ''} (have ${pool.length})`);
    }
    return shorts.length ? 'Locked: needs ' + shorts.join(', ') : '';
  }

  /**
   * Static rule-content tooltip for an Operation (#61): its resource
   * requirements, success effect, and failure consequence — all sourced from
   * the shared OPERATION_META table (#54), never a computed success chance.
   * When the Operation is currently unavailable (#62), a "Locked: …" line is
   * appended naming exactly the short resource(s).
   * @param {string} metaId - key into OPERATION_META
   * @param {object} [state] - live game state (for the Locked line)
   * @param {Array} [pool] - untapped assignable units (for the Locked line)
   * @param {object} [descriptor] - render descriptor carrying `.available`
   * @returns {string} newline-separated tooltip text (empty if unknown)
   */
  function operationTooltip(metaId, state, pool, descriptor) {
    const meta = Operations.OPERATION_META[metaId];
    if (!meta) return '';
    const lines = [
      formatOperationRequirements(meta),
      `Success: ${meta.success}`,
      `Failure: ${meta.failure}`,
    ];
    if (descriptor && !descriptor.available && state && pool) {
      const locked = formatLockedReason(meta, state, pool);
      if (locked) lines.push(locked);
    }
    return lines.join('\n');
  }

  /**
   * Render the available operations into #operations-list.
   * Minor Vandalism is the first wired operation (#33): a single button,
   * gated by Operations.canExecute — no shared "render any operation"
   * abstraction yet.
   */
  // Handlers for the fixed (always-considered) Operations, keyed by id.
  const FIXED_OPERATION_HANDLERS = {
    minor_vandalism: executeMinorVandalism,
    average_vandalism: executeAverageVandalism,
    significant_vandalism: executeSignificantVandalism,
    gather_supplies: executeGatherSupplies,
    scout: executeScout,
    late_game_scout: executeLateGameScout,
  };

  /**
   * Build the ordered list of Operation-button descriptors for the current
   * state: the fixed Operations plus one entry per scouted Mid/Late-Game
   * opportunity. Each descriptor carries its own availability flag (from the
   * matching engine predicate) and click handler, so the render loop stays a
   * flat map instead of a pile of per-operation `if` blocks.
   * @param {object} state
   * @param {Array} pool - untapped assignable units
   * @returns {Array<{key,dataOp,metaId,label,available,onClick}>}
   */
  function collectOperationDescriptors(state, pool) {
    const descriptors = [];

    for (const id of FIXED_OPERATIONS) {
      const meta = Operations.OPERATION_META[id];
      // Late-Game Scout shares the late_game_op requirements table.
      const gateId = id === 'late_game_scout' ? 'late_game_op' : id;
      descriptors.push({
        key: id,
        dataOp: id,
        metaId: id,
        label: meta.label,
        available: Operations.canExecute(gateId, state, pool),
        onClick: FIXED_OPERATION_HANDLERS[id],
      });
    }

    // Scouted Mid-Game opportunities — one button per available opportunity.
    (state.availableMidGameOps || []).forEach((op, i) => {
      const meta = Operations.OPERATION_META[op.type];
      descriptors.push({
        key: `mid_game_op:${i}`,
        dataOp: op.type,
        metaId: op.type,
        label: meta.label,
        available: Operations.canExecuteMidGameOp(state, pool),
        onClick: () => executeMidGameOp(op),
      });
    });

    // Scouted Late-Game opportunities — one button per available opportunity.
    (state.availableLateGameOps || []).forEach((op, i) => {
      const meta = Operations.OPERATION_META[op.type];
      descriptors.push({
        key: `late_game_op:${i}`,
        dataOp: op.type,
        metaId: op.type,
        label: meta.label,
        available: Operations.canExecuteLateGameOp(state, pool),
        onClick: () => executeLateGameOp(op),
      });
    });

    return descriptors;
  }

  function renderOperations() {
    const container = document.getElementById('operations-list');
    if (!container || !gameState) return;

    // Availability is checked against the UNTAPPED pool (Leader + Operatives
    // that have not yet acted this turn, #52) so the Leader can bootstrap K=1
    // Operations on a fresh game, but units already spent this turn no longer
    // light up Operations they can't actually crew.
    const pool = GameState.untappedPool(gameState);

    // Every Operation renders at all times (#62); the ones whose requirements
    // aren't met render disabled/grayed rather than being hidden.
    const descriptors = collectOperationDescriptors(gameState, pool);

    const buttons = descriptors.map((d) => {
      const lockedClass = d.available ? '' : ' op-locked';
      const disabledAttr = d.available ? '' : ' disabled';
      return `<button class="btn-operation${lockedClass}" data-operation="${d.dataOp}"`
        + ` data-op-key="${d.key}"${disabledAttr}>${d.label}</button>`;
    });

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

    // Wire each rendered Operation button to its handler and its static
    // rule-content tooltip (#61). The `.btn-operation[data-op-key]` selector
    // scopes to buttons (never a Multi-turn Op div) and uniquely identifies
    // each descriptor even when two scouted opportunities share a type.
    descriptors.forEach((d) => {
      const btn = container.querySelector(`.btn-operation[data-op-key="${d.key}"]`);
      if (!btn) return;
      btn.title = operationTooltip(d.metaId, gameState, pool, d);
      // A disabled/grayed Operation is inert — no handler is wired, so it can
      // neither be clicked nor activated.
      if (d.available) btn.addEventListener('click', () => d.onClick());
    });
  }

  /**
   * Execute Minor Vandalism (#33): pick 1 Operative (K=1), resolve via the
   * engine, then reflect resources / log / personnel in the DOM.
   */
  async function executeMinorVandalism() {
    if (!gameState) return;

    const operatives = await UI.assignOperatives(1, GameState.untappedPool(gameState));
    if (!operatives || operatives.length !== 1) return;
    tapUnits(operatives);

    // Capture Heat before resolution — a success adds Heat, but the check ran
    // against the pre-resolution Heat, so the logged threshold must use it too.
    const heatAtCheck = gameState.heat;
    const result = await Operations.resolveMinorVandalism(gameState, operatives);
    const check = formatRollCheck(result.roll, { heat: heatAtCheck });

    if (result.success) {
      addLogEntry(`Minor Vandalism succeeded — ${check}. +1 Influence, +1 Heat.`);
    } else {
      addLogEntry(`Minor Vandalism failed — ${check}. No effect.`);
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

    const operatives = await UI.assignOperatives(2, GameState.untappedPool(gameState));
    if (!operatives || operatives.length !== 2) return;
    tapUnits(operatives);

    const heatAtCheck = gameState.heat;
    const result = await Operations.resolveAverageVandalism(gameState, operatives);
    const check = formatRollCheck(result.roll, { heat: heatAtCheck });

    if (result.success) {
      addLogEntry(
        `Average Vandalism succeeded — ${check}. +3 Influence, +3 Heat, +1 Recruit Pool.`
      );
    } else {
      addLogEntry(
        `Average Vandalism failed — ${check}. 1 Operative detained for 1 turn.`
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

    const operatives = await UI.assignOperatives(4, GameState.untappedPool(gameState));
    if (!operatives || operatives.length !== 4) return;
    tapUnits(operatives);

    let secondPenaltyChoice = null;
    const heatAtCheck = gameState.heat;
    const result = await Operations.resolveSignificantVandalism(gameState, operatives, {
      getSecondPenaltyChoice: async () => {
        secondPenaltyChoice = await UI.compoundFailureChoice();
        return secondPenaltyChoice;
      },
    });
    const check = formatRollCheck(result.roll, { heat: heatAtCheck });

    if (result.success) {
      addLogEntry(
        `Significant Vandalism succeeded — ${check}. +10 Influence, +10 Heat, +2 Recruit Pool.`
      );
    } else {
      const secondPenalty = secondPenaltyChoice === 'supplies'
        ? '−2 Supplies'
        : '1 more Operative detained 2 turns';
      addLogEntry(
        `Significant Vandalism failed — ${check}. Compound Failure: 1 Operative detained 2 turns, plus ${secondPenalty}.`
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

    const operatives = await UI.assignOperatives(1, GameState.untappedPool(gameState));
    if (!operatives || operatives.length !== 1) return;
    tapUnits(operatives);

    // Gather Supplies rolls each check against 100 − Heat + floor(Influence/2);
    // capture both before resolution (which only changes Supplies) so every
    // per-roll threshold reflects the state the rolls actually ran against.
    const heatAtCheck = gameState.heat;
    const influenceBonus = Math.floor(gameState.influence / 2);
    const result = await Operations.resolveGatherSupplies(gameState, operatives);

    const successes = result.rolls.filter(r => r.success).length;
    const rollList = result.rolls
      .map(r => formatRollCheck(r.roll, { heat: heatAtCheck, influenceBonus }))
      .join('; ');
    addLogEntry(
      `Gather Supplies: ${successes}/3 rolls succeeded. ${rollList}. +${result.gained} Supplies.`
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

    const operatives = await UI.assignOperatives(4, GameState.untappedPool(gameState));
    if (!operatives || operatives.length !== 4) return;
    tapUnits(operatives);

    Operations.startScout(gameState, operatives);

    addLogEntry('Scout operation started (−5 Supplies, 4 Operatives assigned). Resolves in 2 turns.');

    GameState.save(gameState, 'current');
    renderGameState();
  }

  /**
   * Start a Late-Game Scout (multi-turn, mirrors executeScout): assign 6
   * Operatives, hand off to the engine (−8 Supplies, 3-turn multi-turn op),
   * then reflect the started op in the DOM. Resolution is driven by End Turn.
   */
  async function executeLateGameScout() {
    if (!gameState) return;

    const operatives = await UI.assignOperatives(6, GameState.untappedPool(gameState));
    if (!operatives || operatives.length !== 6) return;
    tapUnits(operatives);

    Operations.startLateGameScout(gameState, operatives);

    addLogEntry('Late-Game Scout operation started (−8 Supplies, 6 Operatives assigned). Resolves in 3 turns.');

    GameState.save(gameState, 'current');
    renderGameState();
  }

  /**
   * Execute a scouted Mid-Game Operation (immediate resolution, mirrors the
   * Vandalism tiers): assign 6 Operatives, resolve via the engine (−10
   * Supplies, d100 − Heat + operative-value check), and log the roll and the
   * type-specific effect. On success the opportunity is consumed; on failure
   * one assigned Operative is captured.
   * @param {object} op - the availableMidGameOps entry (has `.type`)
   */
  async function executeMidGameOp(op) {
    if (!gameState) return;

    const operatives = await UI.assignOperatives(6, GameState.untappedPool(gameState));
    if (!operatives || operatives.length !== 6) return;
    tapUnits(operatives);

    const meta = Operations.OPERATION_META[op.type];
    const heatAtCheck = gameState.heat;
    const operativeBonus = operatives.reduce((sum, o) => sum + o.value, 0);
    const result = await Operations.resolveMidGameOp(gameState, op, operatives);
    const check = formatRollCheck(result.roll, { heat: heatAtCheck, operativeBonus });

    if (result.success) {
      addLogEntry(`${meta.label} succeeded — ${check}. ${meta.success}`);
    } else {
      addLogEntry(`${meta.label} failed — ${check}. ${meta.failure}`);
    }

    GameState.save(gameState, 'current');
    renderGameState();
  }

  /**
   * Start a scouted Late-Game Operation (multi-turn, mirrors Scout): assign 12
   * Operatives, hand off to the engine (−20 Supplies, 3-turn multi-turn op
   * carrying the opportunity), then reflect the started op in the DOM.
   * Resolution — applying the type-specific effect and the Victory check — is
   * driven by End Turn.
   * @param {object} op - the availableLateGameOps entry (has `.type`)
   */
  async function executeLateGameOp(op) {
    if (!gameState) return;

    const operatives = await UI.assignOperatives(12, GameState.untappedPool(gameState));
    if (!operatives || operatives.length !== 12) return;
    tapUnits(operatives);

    const meta = Operations.OPERATION_META[op.type];
    Operations.startLateGameOp(gameState, op, operatives);

    addLogEntry(`${meta.label} started (−20 Supplies, 12 Operatives assigned). Resolves in 3 turns.`);

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
        btn.title = RECRUIT_TOOLTIP;
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
    // A unit that has acted this turn (#52) carries the `tapped` class so the
    // Operatives panel renders it visually distinct (dimmed / rotated via CSS).
    const tappedClass = card.tapped ? ' tapped' : '';
    // The Leader is a Joker rendered as a distinct card ("Leader / You"),
    // never a bare rank/suit \u2014 and never carries Recruit/detain controls.
    if (card.isLeader) {
      return `<span class="card card-leader ${colorClass}${tappedClass}"><span class="card-suit">${icon}</span><span class="card-rank">Leader (You)</span></span>`;
    }
    return `<span class="card ${colorClass}${tappedClass}"><span class="card-suit">${icon}</span><span class="card-rank">${card.rank}</span><span class="card-value">(${card.value})</span></span>`;
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

    // Attributer eligibility (#49): the Leader is always eligible to perform a
    // Recruit Attempt (per the rules: "...or yourself"), regardless of the
    // target's value. A non-Leader Operative qualifies only if its value is
    // strictly greater than the target Recruit's value. The Leader guarantees
    // ≥1 eligible unit, so we prompt only when more than one qualifies.
    // Tapped units (#52) have already spent their action this turn, so they are
    // excluded from the eligible set — both the Leader (if tapped) and any
    // higher-value Operative that has already acted.
    const eligible = (gameState.leader && !gameState.leader.tapped ? [gameState.leader] : [])
      .concat(gameState.operatives.filter((op) => !op.tapped && op.value > card.value));
    if (eligible.length === 0) return; // every eligible attributer has already acted
    let attributer = eligible[0];
    if (eligible.length > 1) {
      attributer = await UI.recruitAttributerChoice(eligible);
      if (!attributer) return; // player dismissed the picker without choosing
    }

    // Performing the Recruit Attempt spends the attributer's action for the turn
    // (#52), so it taps and drops out of the assignable / eligible pools.
    tapUnits([attributer]);

    // Base die: d10, or d12 if the player spends 1 Supply.
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
      addLogEntry(`Recruit success! ${attributerLabel(attributer)} recruited ${card.rank}${suitSymbol(card.suit)} (${rollBreakdown} = ${total} vs ${target}) → Initiate (2 turns)`);
    } else {
      addLogEntry(`Recruit failed. ${attributerLabel(attributer)} attempted ${card.rank}${suitSymbol(card.suit)} (${rollBreakdown} = ${total} vs ${target}) — stays in pool.`);
    }

    GameState.save(gameState, 'current');
    renderGameState();
  }

  function suitSymbol(suit) {
    const icons = { hearts: '\u2665', diamonds: '\u2666', clubs: '\u2663', spades: '\u2660' };
    return icons[suit] || '';
  }

  /**
   * Tap a set of units (#52): mark each as having spent its one action for the
   * turn. Tapped units are filtered out of GameState.untappedPool, so they no
   * longer appear in Operation availability, assignment pickers, or the
   * Recruit-attributer eligibility set until End Turn untaps them. Mutates the
   * unit objects in place (they are the live Leader / Operative references).
   */
  function tapUnits(units) {
    (units || []).forEach((unit) => { if (unit) unit.tapped = true; });
  }

  /**
   * Human-readable label for a Recruit-Attempt attributer (#49), used in the
   * turn log: "Leader" for the Leader, else the operative's rank + suit glyph.
   */
  function attributerLabel(unit) {
    if (!unit) return 'Leader';
    return unit.isLeader ? 'Leader' : `${unit.rank}${suitSymbol(unit.suit)}`;
  }

  /**
   * Shared roll-vs-threshold log fragment for every d100 roll-UNDER check (#57)
   * — Vandalism tiers, Gather Supplies (per roll), Scout, Late-Game Scout, and
   * Mid/Late-Game Operations. Generalizes the Recruit-Attempt line style: the
   * roll and the roll-under threshold it had to clear are rendered in distinct,
   * visually distinguishable spans (`.roll-value` / `.roll-threshold`), followed
   * by the formula that produced the threshold (base 100, minus Heat, plus any
   * operative-value / Influence bonus).
   *
   * @param {number} roll - the d100 result
   * @param {object} mods - { heat, operativeBonus?, influenceBonus? }
   * @returns {string} e.g.
   *   'rolled <span class="roll-value">62</span>, needed ≤
   *    <span class="roll-threshold">85</span> (base 100 − 15 Heat)'
   */
  function formatRollCheck(roll, mods) {
    const heat = (mods && mods.heat) || 0;
    const operativeBonus = (mods && mods.operativeBonus) || 0;
    const influenceBonus = (mods && mods.influenceBonus) || 0;
    const threshold = 100 - heat + operativeBonus + influenceBonus;

    let formula = `base 100 − ${heat} Heat`;
    if (operativeBonus) formula += ` + ${operativeBonus} operative value`;
    if (influenceBonus) formula += ` + ${influenceBonus} Influence`;

    return `rolled <span class="roll-value">${roll}</span>, needed ≤ `
      + `<span class="roll-threshold">${threshold}</span> (${formula})`;
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
   * Update leader skill level to match the highest operative value. Thin
   * wrapper delegating to the single engine implementation
   * (GameState.updateLeaderSkill), which owns the monotonic high-water-mark
   * logic and the leader.value sync — no competing copy lives here (#48).
   */
  function updateLeaderSkill() {
    if (!gameState) return;
    GameState.updateLeaderSkill(gameState);
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
    formatRollCheck,
    endTurn,
    renderVictory,
    syncInputProviders,
    openSettings,
    init,
    RESISTANCE_VALUES,
    REGIME_TYPES,
  };
})();
