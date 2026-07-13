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

  // ─── Mid-Game Operations table (d6) ─────────────────────────────────────────
  // The Scout Success column rolls d6 here to type a scouted opportunity.
  const MID_GAME_OPS = {
    1: 'embed_mole',
    2: 'hack_comm_tower',
    3: 'industry_strike',
    4: 'break_out',
    5: 'intercept_supply',
    6: 'clandestine_goods',
  };

  // Difficulty-gated Influence threshold for executing a Mid-Game Operation.
  const MID_GAME_INFLUENCE_THRESHOLD = { easy: 30, medium: 45, hard: 60 };

  // ─── Late-Game Operations table (d6) ────────────────────────────────────────
  // The Late-Game Scout Success column rolls d6 here to type a scouted
  // opportunity. The rulebook prints this table as "d8" but only defines rows
  // 1-6 (confirmed a misprint — the Mid-Game Operations table above is
  // correctly labeled d6 for its own 6 rows); a d6 roll is used instead.
  const LATE_GAME_OPS = {
    1: 'neutralize_leadership',
    2: 'news_agency',
    3: 'establish_militia',
    4: 'liberate_prison',
    5: 'control_supply',
    6: 'provisional_government',
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

  /**
   * Difficulty-appropriate Influence threshold for a Mid-Game Operation.
   * @param {object} state - Game state (reads state.difficulty)
   * @returns {number}
   */
  function midGameInfluenceThreshold(state) {
    return MID_GAME_INFLUENCE_THRESHOLD[state.difficulty] ?? MID_GAME_INFLUENCE_THRESHOLD.medium;
  }

  /**
   * Whether a Mid-Game Operation can be executed: 6 Operatives, 10 Supplies,
   * and total Influence at or above the difficulty-gated threshold (30/45/60).
   * @param {object} state
   * @param {Array} assignedOperatives
   * @returns {boolean}
   */
  function canExecuteMidGameOp(state, assignedOperatives) {
    return canExecute('mid_game_op', state, assignedOperatives, {
      influenceThreshold: midGameInfluenceThreshold(state),
    });
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

  // ─── Helper: Compound Failure second bullet (player choice) ────────────────

  /**
   * Resolve a Compound Failure's second, player-chosen bullet: detain 1 more
   * operative, or lose 2 supplies instead. The choice is either supplied
   * synchronously up front (`options.secondPenaltyChoice`, used by engine
   * tests and AI simulation strategies that pre-decide) or fetched lazily via
   * an async callback (`options.getSecondPenaltyChoice`, used by the UI so a
   * choice modal only appears once a failure is confirmed, not on every
   * attempt).
   * @param {object} options - { secondPenaltyChoice?: 'detain' | 'supplies', getSecondPenaltyChoice?: () => Promise<'detain' | 'supplies'> }
   * @param {number} detainTurns - turns to detain if the player picks 'detain'
   * @param {number} [suppliesPenalty=2] - supplies lost if the player picks 'supplies'
   */
  async function resolveCompoundChoice(state, operatives, options, detainTurns, suppliesPenalty = 2) {
    let choice = (options && options.secondPenaltyChoice) || 'detain';
    if (options && typeof options.getSecondPenaltyChoice === 'function') {
      choice = await options.getSecondPenaltyChoice();
    }
    if (choice === 'detain') {
      detainOperatives(state, operatives, 1, detainTurns);
    } else {
      GameState.addSupplies(state, -suppliesPenalty);
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
      await resolveCompoundChoice(state, operatives, options, 2);
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
    const assigned = [...operatives];
    for (const op of assigned) {
      const idx = state.operatives.indexOf(op);
      if (idx !== -1) state.operatives.splice(idx, 1);
    }
    state.multiTurnOps.push({
      operation: 'scout',
      turnsRemaining: 2,
      assignedOperatives: assigned,
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
      state.availableMidGameOps.push({ tableRoll, type: MID_GAME_OPS[tableRoll] });
    } else {
      // Bullet 1: 1 operative detained 1 turn
      detainOperatives(state, operatives, 1, 1);

      // Bullet 2: player choice
      await resolveCompoundChoice(state, operatives, options, 1);
    }

    // Any assigned operative not detained (all of them on success, survivors
    // on failure) is done being tapped for this op and returns to the pool.
    for (const op of operatives) {
      if (!state.operatives.includes(op)) {
        state.operatives.push(op);
      }
    }

    return { roll, success };
  }

  // ─── Late-Game Scout: Multi-turn Setup ──────────────────────────────────────

  /**
   * Start a Late-Game Scout operation (3-turn multi-turn op).
   * Consumes 8 supplies and locks 6 assigned operatives until it resolves.
   */
  function startLateGameScout(state, operatives) {
    GameState.addSupplies(state, -8);
    const assigned = [...operatives];
    for (const op of assigned) {
      const idx = state.operatives.indexOf(op);
      if (idx !== -1) state.operatives.splice(idx, 1);
    }
    state.multiTurnOps.push({
      operation: 'late_game_scout',
      turnsRemaining: 3,
      assignedOperatives: assigned,
    });
  }

  // ─── Late-Game Scout: Resolution ────────────────────────────────────────────

  /**
   * Roll a d6 on the Late-Game Operations table to produce a typed opportunity,
   * re-rolling if the resulting type is already completed OR already sitting
   * unexecuted in availableLateGameOps (dedup deviation — see PRD.md: broader
   * than the rulebook's literal "already been successfully executed" wording).
   * Returns the {tableRoll, type} entry, or null if every mapped type is
   * already held/completed (no opportunity can be produced).
   */
  async function rollLateGameOpportunity(state) {
    const held = new Set([
      ...state.availableLateGameOps.map(o => o.type),
      ...state.completedLateGameOps.map(o => o.type),
    ]);
    const remaining = Object.values(LATE_GAME_OPS).filter(t => !held.has(t));
    if (remaining.length === 0) return null;

    // Re-roll until the d6 lands on a not-already-held/completed type.
    let tableRoll, type;
    do {
      tableRoll = await Dice.roll('d6');
      type = LATE_GAME_OPS[tableRoll];
    } while (held.has(type));

    return { tableRoll, type };
  }

  /**
   * Resolve a completed Late-Game Scout operation.
   * Check: d100 - Heat + combined value of assigned operative cards.
   * Success: roll d6 on the Late-Game Operations table (deduped) and add the
   *   typed opportunity to availableLateGameOps.
   * Failure (harsher than Scout):
   *   Bullet 1 (unconditional): 2 operatives detained 2 turns.
   *   Bullet 2 (player choice): detain 1 more operative 2 turns OR -4 supplies.
   *
   * @param {object} state
   * @param {Array} operatives - operatives assigned to this operation
   * @param {object} [options] - { secondPenaltyChoice: 'detain' | 'supplies' }
   */
  async function resolveLateGameScout(state, operatives, options) {
    const roll = await Dice.roll('d100');
    const success = checkWithOperatives(roll, state, operatives);

    if (success) {
      const opportunity = await rollLateGameOpportunity(state);
      if (opportunity) state.availableLateGameOps.push(opportunity);
    } else {
      // Bullet 1: 2 operatives detained 2 turns
      detainOperatives(state, operatives, 2, 2);

      // Bullet 2: player choice — detain 1 more 2 turns OR -4 supplies
      await resolveCompoundChoice(state, operatives, options, 2, 4);
    }

    // Any assigned operative not detained returns to the pool.
    for (const op of operatives) {
      if (!state.operatives.includes(op)) {
        state.operatives.push(op);
      }
    }

    return { roll, success };
  }

  // ─── Helper: capture operatives (recycled to Recruitment Deck) ──────────────

  /**
   * Capture (permanently lose) `count` assigned operatives: remove them from
   * the Op Team and shuffle their cards back into the Recruitment Deck. This is
   * the Operation-tier failure consequence — distinct from Detained (which
   * returns operatives after a timer). Mutates the passed `operatives` array.
   * @returns {Array} the captured cards
   */
  function captureOperatives(state, operatives, count) {
    const captured = [];
    for (let i = 0; i < count && operatives.length > 0; i++) {
      const op = operatives.shift();
      const idx = state.operatives.indexOf(op);
      if (idx !== -1) state.operatives.splice(idx, 1);
      captured.push(op);
    }
    if (captured.length > 0) {
      Deck.returnCards(state.recruitDeck, captured);
    }
    return captured;
  }

  // ─── Mid-Game Operation: success effects ────────────────────────────────────

  /**
   * Apply the d6 Mid-Game Operations table's Success-column effect for `type`.
   */
  async function applyMidGameEffect(state, type) {
    switch (type) {
      case 'embed_mole': // Embed Mole / Bribe Regime Official
        GameState.addHeat(state, -35);
        break;
      case 'hack_comm_tower': // Hack/Tap/Destroy Comm Tower
        GameState.addInfluence(state, 25);
        GameState.addHeat(state, -15);
        break;
      case 'industry_strike': // Stage Industry Strike / Public Demonstration
        GameState.addHeat(state, -35);
        break;
      case 'break_out': { // Break Out Imprisoned Operatives
        // +2 Operatives drawn directly to Operatives (bypasses Recruit Pool/Initiate)
        const drawn = await Deck.draw(state.recruitDeck, 2);
        state.operatives.push(...drawn);
        GameState.addHeat(state, 10);
        break;
      }
      case 'intercept_supply': // Intercept Supply Convoy / Raid Storehouse
        GameState.addSupplies(state, 15);
        GameState.addHeat(state, 10);
        break;
      case 'clandestine_goods': // Provide Clandestine Goods/Services
        GameState.addInfluence(state, 50);
        break;
    }
  }

  // ─── Mid-Game Operation: resolution ─────────────────────────────────────────

  /**
   * Execute an available Mid-Game Operation.
   * Consumes 10 Supplies, then a d100 - Heat + operative-values check.
   * Success: applies the d6 table effect for the opportunity's type and
   *   consumes (removes) the fulfilled opportunity from availableMidGameOps.
   * Failure: captures 1 random assigned Operative (card recycled to the
   *   Recruitment Deck) — not detained; the opportunity is left available.
   *
   * @param {object} state
   * @param {object} op - the availableMidGameOps entry (has `.type`)
   * @param {Array} operatives - operatives assigned to this operation
   * @returns {{roll: number, success: boolean}}
   */
  async function resolveMidGameOp(state, op, operatives) {
    GameState.addSupplies(state, -10);

    const roll = await Dice.roll('d100');
    const success = checkWithOperatives(roll, state, operatives);

    if (success) {
      await applyMidGameEffect(state, op.type);
      const idx = state.availableMidGameOps.indexOf(op);
      if (idx !== -1) state.availableMidGameOps.splice(idx, 1);
    } else {
      captureOperatives(state, operatives, 1);
    }

    return { roll, success };
  }

  // ─── Late-Game Operation: availability / threshold ──────────────────────────

  // Difficulty-gated Influence threshold for executing a Late-Game Operation.
  const LATE_GAME_INFLUENCE_THRESHOLD = { easy: 60, medium: 90, hard: 120 };

  /**
   * Difficulty-appropriate Influence threshold for a Late-Game Operation.
   * @param {object} state - Game state (reads state.difficulty)
   * @returns {number}
   */
  function lateGameInfluenceThreshold(state) {
    return LATE_GAME_INFLUENCE_THRESHOLD[state.difficulty] ?? LATE_GAME_INFLUENCE_THRESHOLD.medium;
  }

  /**
   * Whether a Late-Game Operation can be executed: 12 Operatives, 20 Supplies,
   * and total Influence at or above the difficulty-gated threshold (60/90/120).
   * Influence gates but is not consumed.
   * @param {object} state
   * @param {Array} assignedOperatives
   * @returns {boolean}
   */
  function canExecuteLateGameOp(state, assignedOperatives) {
    return canExecute('late_game_op', state, assignedOperatives, {
      influenceThreshold: lateGameInfluenceThreshold(state),
    });
  }

  // ─── Late-Game Operation: success effects ───────────────────────────────────

  /**
   * Apply the d6 (rulebook-misprinted "d8") Late-Game Operations table's
   * Success-column effect for `type`.
   */
  async function applyLateGameEffect(state, type) {
    switch (type) {
      case 'neutralize_leadership': // Neutralize Regime Leadership
        GameState.addHeat(state, -50);
        break;
      case 'news_agency': // Establish News Agency / Seize Communications
        GameState.addInfluence(state, 50);
        GameState.addHeat(state, -15);
        break;
      case 'establish_militia': // Establish Militia and Security Forces
        GameState.addHeat(state, -50);
        break;
      case 'liberate_prison': { // Liberate Prison Facilities
        // +5 Operatives drawn directly to Operatives (bypasses Recruit Pool/Initiate)
        const drawn = await Deck.draw(state.recruitDeck, 5);
        state.operatives.push(...drawn);
        GameState.addHeat(state, 15);
        break;
      }
      case 'control_supply': // Control Supply Networks / Egress Points
        GameState.addSupplies(state, 25);
        GameState.addHeat(state, 15);
        break;
      case 'provisional_government': // Establish Provisional Government / Elections
        GameState.addInfluence(state, 50);
        break;
    }
  }

  // ─── Late-Game Operation: Multi-turn Setup ──────────────────────────────────

  /**
   * Start executing an available Late-Game Operation. Per the rulebook this
   * "Takes 3 turns" (unlike the immediate Mid-Game Operation), so it runs as a
   * multi-turn op mirroring Scout/Late-Game Scout: consumes 20 Supplies up
   * front, taps (removes from the pool) the 12 assigned Operatives, and carries
   * the opportunity so the resolver can apply the right effect on completion.
   * The opportunity is left in availableLateGameOps while in flight (removed on
   * success, retained on failure), keeping the Late-Game Scout dedup honest —
   * you can't be handed a duplicate type while one is mid-execution.
   * @param {object} state
   * @param {object} op - the availableLateGameOps entry (has `.type`)
   * @param {Array} operatives - the 12 operatives assigned to this operation
   */
  function startLateGameOp(state, op, operatives) {
    GameState.addSupplies(state, -20);
    const assigned = [...operatives];
    for (const o of assigned) {
      const idx = state.operatives.indexOf(o);
      if (idx !== -1) state.operatives.splice(idx, 1);
    }
    state.multiTurnOps.push({
      operation: 'late_game_op',
      turnsRemaining: 3,
      assignedOperatives: assigned,
      opportunity: op,
    });
  }

  // ─── Late-Game Operation: record completion / Victory ───────────────────────

  /**
   * Record a successfully executed Late-Game Operation (deduped by type) and,
   * once 3 distinct types are completed, set the Victory flag (the win
   * condition — "complete any 3 Late-Game Operations").
   */
  function recordLateGameCompletion(state, op) {
    const already = state.completedLateGameOps.some(o => o.type === op.type);
    if (!already) state.completedLateGameOps.push(op);
    const distinct = new Set(state.completedLateGameOps.map(o => o.type)).size;
    if (distinct >= 3) state.victory = true;
  }

  // ─── Late-Game Operation: resolution ────────────────────────────────────────

  /**
   * Resolve a Late-Game Operation whose 3-turn assignment has completed.
   * Check: d100 - Heat + combined value of assigned operative cards.
   * Success: applies the Late-Game table effect for the opportunity's type,
   *   removes the fulfilled opportunity from availableLateGameOps, records the
   *   completion (setting Victory on the 3rd distinct type).
   * Failure: captures 2 assigned Operatives (cards recycled to the Recruitment
   *   Deck — not detained); the opportunity is left available to retry.
   * Either way, surviving assigned operatives return to the pool.
   *
   * @param {object} state
   * @param {object} op - the availableLateGameOps entry (has `.type`)
   * @param {Array} operatives - operatives assigned to this operation
   * @returns {{roll: number, success: boolean}}
   */
  async function resolveLateGameOp(state, op, operatives) {
    const roll = await Dice.roll('d100');
    const success = checkWithOperatives(roll, state, operatives);

    if (success) {
      await applyLateGameEffect(state, op.type);
      const idx = state.availableLateGameOps.indexOf(op);
      if (idx !== -1) state.availableLateGameOps.splice(idx, 1);
      recordLateGameCompletion(state, op);
    } else {
      captureOperatives(state, operatives, 2);
    }

    // Any assigned operative not captured returns to the pool.
    for (const o of operatives) {
      if (!state.operatives.includes(o)) {
        state.operatives.push(o);
      }
    }

    return { roll, success };
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  return {
    canExecute,
    canExecuteMidGameOp,
    canExecuteLateGameOp,
    midGameInfluenceThreshold,
    lateGameInfluenceThreshold,
    checkBasic,
    checkGatherSupplies,
    checkWithOperatives,
    resolveMinorVandalism,
    resolveAverageVandalism,
    resolveSignificantVandalism,
    resolveGatherSupplies,
    startScout,
    resolveScout,
    startLateGameScout,
    resolveLateGameScout,
    resolveMidGameOp,
    startLateGameOp,
    resolveLateGameOp,
  };
})();
