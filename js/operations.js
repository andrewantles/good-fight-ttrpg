/**
 * Operations Engine for The Good Fight TTRPG (Phase 3).
 * Defines operation requirements, check formulas, and resolution logic.
 */
const Operations = (() => {

  // ─── Operation Definitions ──────────────────────────────────────────────────

  const OPERATION_REQS = {
    minor_vandalism:       { operatives: 1,  supplies: 0,  influence: 0  },
    average_vandalism:     { operatives: 2,  supplies: 3,  influence: 0  },
    significant_vandalism: { operatives: 4,  supplies: 5,  influence: 0  },
    gather_supplies:       { operatives: 1,  supplies: 0,  influence: 0  },
    scout:                 { operatives: 4,  supplies: 5,  influence: 0  },
    mid_game_op:           { operatives: 6,  supplies: 10, influence: 0  },
    late_game_op:          { operatives: 12, supplies: 20, influence: 0  },
  };

  // ─── Availability Check ─────────────────────────────────────────────────────

  /**
   * Check whether an operation can be executed given current state and assigned operatives.
   * @param {string} operationId
   * @param {object} state - Game state
   * @param {Array} assignedOperatives - Operatives assigned to this operation
   * @param {object} [options] - Additional options (e.g. influenceThreshold for mid/late ops)
   * @returns {boolean}
   */
  function canExecute(operationId, state, assignedOperatives, options) {
    const reqs = OPERATION_REQS[operationId];
    if (!reqs) return false;

    if (assignedOperatives.length < reqs.operatives) return false;
    if (state.supplies < reqs.supplies) return false;

    // Mid/late-game ops have a dynamic influence threshold
    const influenceThreshold = (options && options.influenceThreshold) || reqs.influence;
    if (state.influence < influenceThreshold) return false;

    return true;
  }

  // ─── Check Formulas ─────────────────────────────────────────────────────────

  /**
   * Basic check: roll <= (100 - heat).
   */
  function checkBasic(roll, state) {
    return roll <= (100 - state.heat);
  }

  /**
   * Gather Supplies check: roll <= (100 - heat + floor(influence / 2)).
   */
  function checkGatherSupplies(roll, state) {
    return roll <= (100 - state.heat + Math.floor(state.influence / 2));
  }

  /**
   * Check with operative values: roll <= (100 - heat + sum of operative values).
   */
  function checkWithOperatives(roll, state, operatives) {
    const opSum = operatives.reduce((sum, op) => sum + op.value, 0);
    return roll <= (100 - state.heat + opSum);
  }

  // ─── Mid-Game Operations Table (d6) ──────────────────────────────────────────

  const MID_GAME_TABLE = {
    1: { name: 'Embed Mole / Bribe Official',                    apply: (s) => { GameState.addHeat(s, -35); } },
    2: { name: 'Hack/Tap/Destroy Comm Tower',                    apply: (s) => { GameState.addInfluence(s, 25); GameState.addHeat(s, -15); } },
    3: { name: 'Stage Industry Strike / Public Demonstration',   apply: (s) => { GameState.addHeat(s, -35); } },
    4: { name: 'Break Out Imprisoned Operatives',                apply: async (s) => { const drawn = await Deck.draw(s.recruitDeck, 2); s.operatives.push(...drawn); } },
    5: { name: 'Intercept Supply Convoy / Raid Storehouse',      apply: (s) => { GameState.addHeat(s, 10); GameState.addSupplies(s, 15); } },
    6: { name: 'Provide Clandestine Goods/Services to Population', apply: (s) => { GameState.addHeat(s, 10); GameState.addInfluence(s, 50); } },
  };

  // ─── Late-Game Operations Table (d8, re-roll 7-8 or duplicates) ─────────────

  const LATE_GAME_TABLE = {
    1: { name: 'Neutralize Regime Leadership',                          apply: (s) => { GameState.addHeat(s, -50); } },
    2: { name: 'Establish News Agency and Seize Communications Networks', apply: (s) => { GameState.addInfluence(s, 50); GameState.addHeat(s, -15); } },
    3: { name: 'Establish Militia and Security Forces',                 apply: (s) => { GameState.addHeat(s, -50); } },
    4: { name: 'Liberate Prison Facilities',                            apply: async (s) => { const drawn = await Deck.draw(s.recruitDeck, 5); s.operatives.push(...drawn); } },
    5: { name: 'Control Supply Networks / Egress Points',               apply: (s) => { GameState.addHeat(s, 15); GameState.addSupplies(s, 25); } },
    6: { name: 'Establish Provisional Government / Organize Elections',  apply: (s) => { GameState.addHeat(s, 15); GameState.addInfluence(s, 50); } },
  };

  // ─── Helper: detain operatives ──────────────────────────────────────────────

  function detainOperatives(state, operatives, count, turns) {
    for (let i = 0; i < count && operatives.length > 0; i++) {
      const op = operatives.shift();
      state.detainedOperatives.push({ card: op, turnsRemaining: turns });
      // Also remove from state.operatives if present
      const idx = state.operatives.indexOf(op);
      if (idx !== -1) state.operatives.splice(idx, 1);
    }
  }

  // ─── Resolution: Minor Vandalism ────────────────────────────────────────────

  /**
   * Resolve Minor Vandalism.
   * Success: +1 influence, +1 heat. Roll d4; if 1, draw 1 card to recruit pool.
   * Failure: nothing.
   */
  async function resolveMinorVandalism(state, operatives) {
    const roll = await Dice.roll('d100');
    const success = checkBasic(roll, state);

    if (success) {
      GameState.addInfluence(state, 1);
      GameState.addHeat(state, 1);

      const d4 = await Dice.roll('d4');
      if (d4 === 1) {
        const drawn = await Deck.draw(state.recruitDeck, 1);
        state.recruitPool.push(...drawn);
      }
    }

    return { roll, success };
  }

  // ─── Resolution: Average Vandalism ──────────────────────────────────────────

  /**
   * Resolve Average Vandalism.
   * Costs 3 supplies (consumed regardless).
   * Success: +3 influence, +3 heat, +1 recruit pool.
   * Failure: 1 operative detained 1 turn.
   */
  async function resolveAverageVandalism(state, operatives) {
    GameState.addSupplies(state, -3);

    const roll = await Dice.roll('d100');
    const success = checkBasic(roll, state);

    if (success) {
      GameState.addInfluence(state, 3);
      GameState.addHeat(state, 3);
      const drawn = await Deck.draw(state.recruitDeck, 1);
      state.recruitPool.push(...drawn);
    } else {
      detainOperatives(state, operatives, 1, 1);
    }

    return { roll, success };
  }

  // ─── Resolution: Significant Vandalism ──────────────────────────────────────

  /**
   * Resolve Significant Vandalism.
   * Costs 5 supplies (consumed regardless).
   * Success: +10 influence, +10 heat, +2 recruit pool.
   * Failure:
   *   Bullet 1 (unconditional): 1 operative detained 2 turns.
   *   Bullet 2 (player choice): detain 1 more operative 2 turns OR -2 supplies.
   *
   * @param {object} state
   * @param {Array} operatives
   * @param {object} [options] - { secondPenaltyChoice: 'detain' | 'supplies' }
   */
  async function resolveSignificantVandalism(state, operatives, options) {
    GameState.addSupplies(state, -5);

    const roll = await Dice.roll('d100');
    const success = checkBasic(roll, state);

    if (success) {
      GameState.addInfluence(state, 10);
      GameState.addHeat(state, 10);
      const drawn = await Deck.draw(state.recruitDeck, 2);
      state.recruitPool.push(...drawn);
    } else {
      // Bullet 1: 1 operative detained 2 turns
      detainOperatives(state, operatives, 1, 2);

      // Bullet 2: player choice
      const choice = (options && options.secondPenaltyChoice) || 'detain';
      if (choice === 'detain') {
        detainOperatives(state, operatives, 1, 2);
      } else {
        GameState.addSupplies(state, -2);
      }
    }

    return { roll, success };
  }

  // ─── Resolution: Gather Supplies ────────────────────────────────────────────

  /**
   * Resolve Gather Supplies.
   * 3 rolls of d100, each checked with checkGatherSupplies.
   * +1 supply per success.
   */
  async function resolveGatherSupplies(state, operatives) {
    const rolls = [];
    let gained = 0;

    for (let i = 0; i < 3; i++) {
      const roll = await Dice.roll('d100');
      const success = checkGatherSupplies(roll, state);
      rolls.push({ roll, success });
      if (success) gained++;
    }

    if (gained > 0) {
      GameState.addSupplies(state, gained);
    }

    return { rolls, gained };
  }

  // ─── Scout: Multi-turn Setup ────────────────────────────────────────────────

  /**
   * Start a Scout operation (2-turn multi-turn op).
   * Consumes 5 supplies and locks assigned operatives.
   */
  function startScout(state, operatives) {
    GameState.addSupplies(state, -5);
    state.multiTurnOps.push({
      operation: 'scout',
      turnsRemaining: 2,
      assignedOperatives: [...operatives],
    });
  }

  // ─── Scout: Resolution ──────────────────────────────────────────────────────

  /**
   * Resolve a completed Scout operation.
   * Check with operative values.
   * Success: roll d6 for mid-game table, add to availableMidGameOps.
   * Failure:
   *   Bullet 1 (unconditional): 1 operative detained 1 turn.
   *   Bullet 2 (player choice): detain 1 more operative 1 turn OR -2 supplies.
   *
   * @param {object} state
   * @param {Array} operatives
   * @param {object} [options] - { secondPenaltyChoice: 'detain' | 'supplies' }
   */
  async function resolveScout(state, operatives, options) {
    const roll = await Dice.roll('d100');
    const success = checkWithOperatives(roll, state, operatives);

    if (success) {
      const tableRoll = await Dice.roll('d6');
      state.availableMidGameOps.push({ tableRoll });
    } else {
      // Bullet 1: 1 operative detained 1 turn
      detainOperatives(state, operatives, 1, 1);

      // Bullet 2: player choice
      const choice = (options && options.secondPenaltyChoice) || 'detain';
      if (choice === 'detain') {
        detainOperatives(state, operatives, 1, 1);
      } else {
        GameState.addSupplies(state, -2);
      }
    }

    return { roll, success };
  }

  // ─── Helper: capture/kill operatives (returned to deck) ──────────────────────

  function captureOperatives(state, operatives, count) {
    for (let i = 0; i < count && operatives.length > 0; i++) {
      const op = operatives.shift();
      const idx = state.operatives.indexOf(op);
      if (idx !== -1) state.operatives.splice(idx, 1);
      Deck.returnCards(state.recruitDeck, [op]);
    }
  }

  // ─── Resolution: Mid-Game Operation ─────────────────────────────────────────

  async function resolveMidGameOp(state, operatives) {
    GameState.addSupplies(state, -10);

    const roll = await Dice.roll('d100');
    const success = checkWithOperatives(roll, state, operatives);

    if (success) {
      const tableRoll = await Dice.roll('d6');
      const entry = MID_GAME_TABLE[tableRoll];
      await entry.apply(state);
    } else {
      captureOperatives(state, operatives, 1);
    }

    return { roll, success };
  }

  // ─── Late-Game Scout: Multi-turn Setup ──────────────────────────────────────

  function startLateGameScout(state, operatives) {
    GameState.addSupplies(state, -8);
    state.multiTurnOps.push({
      operation: 'late_game_scout',
      turnsRemaining: 3,
      assignedOperatives: [...operatives],
    });
  }

  // ─── Late-Game Scout: Resolution ────────────────────────────────────────────

  async function resolveLateGameScout(state, operatives, options) {
    const roll = await Dice.roll('d100');
    const success = checkWithOperatives(roll, state, operatives);

    if (success) {
      const tableRoll = await Dice.roll('d8');
      state.availableLateGameOps.push({ tableRoll });
    } else {
      // Bullet 1: 2 operatives detained 2 turns
      detainOperatives(state, operatives, 2, 2);

      // Bullet 2: player choice
      const choice = (options && options.secondPenaltyChoice) || 'detain';
      if (choice === 'detain') {
        detainOperatives(state, operatives, 1, 2);
      } else {
        GameState.addSupplies(state, -4);
      }
    }

    return { roll, success };
  }

  // ─── Mid-Game Operation: Multi-turn Setup ───────────────────────────────────

  function startMidGameOp(state, operatives) {
    GameState.addSupplies(state, -10);
    state.multiTurnOps.push({
      operation: 'mid_game_op',
      turnsRemaining: 1,
      assignedOperatives: [...operatives],
    });
  }

  // ─── Late-Game Operation: Multi-turn Setup ──────────────────────────────────

  function startLateGameOp(state, operatives) {
    GameState.addSupplies(state, -20);
    state.multiTurnOps.push({
      operation: 'late_game_op',
      turnsRemaining: 3,
      assignedOperatives: [...operatives],
    });
  }

  // ─── Resolution: Late-Game Operation ────────────────────────────────────────

  async function resolveLateGameOp(state, operatives) {
    GameState.addSupplies(state, -20);

    const roll = await Dice.roll('d100');
    const success = checkWithOperatives(roll, state, operatives);

    if (success) {
      // Roll d8, re-roll if already completed (or 7-8)
      let tableRoll;
      do {
        tableRoll = await Dice.roll('d8');
      } while (
        tableRoll > 6 ||
        state.completedLateGameOps.some(op => op.tableRoll === tableRoll)
      );

      const entry = LATE_GAME_TABLE[tableRoll];
      await entry.apply(state);
      state.completedLateGameOps.push({ tableRoll, name: entry.name });
    } else {
      captureOperatives(state, operatives, 2);
    }

    return { roll, success };
  }

  // ─── Multi-Turn Operation Tracking ──────────────────────────────────────────

  function advanceMultiTurnOps(state) {
    for (const op of state.multiTurnOps) {
      op.turnsRemaining--;
    }
  }

  // ─── Victory Check ─────────────────────────────────────────────────────────

  function checkVictory(state) {
    return state.completedLateGameOps.length >= 3;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  return {
    canExecute,
    checkBasic,
    checkGatherSupplies,
    checkWithOperatives,
    resolveMinorVandalism,
    resolveAverageVandalism,
    resolveSignificantVandalism,
    resolveGatherSupplies,
    startScout,
    resolveScout,
    MID_GAME_TABLE,
    LATE_GAME_TABLE,
    resolveMidGameOp,
    startLateGameScout,
    resolveLateGameScout,
    startMidGameOp,
    startLateGameOp,
    resolveLateGameOp,
    advanceMultiTurnOps,
    checkVictory,
  };
})();
