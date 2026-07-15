/**
 * Headless simulator for The Good Fight TTRPG (#23).
 *
 * Runs ONE complete game using ONLY the real engine modules
 * (state / deck / dice / operations / crackdown / turn) — no DOM, no App/UI
 * layer. This is the substrate the AI strategies (#24), metrics (#25) and batch
 * runner build on. Because it drives the SAME engine functions the playable
 * game does, the rules can never drift between simulation and play (PRD:
 * "Simulation reuses the engine modules with zero parallel implementation").
 *
 * ── Strategy contract (what #24 implements) ─────────────────────────────────
 *   strategy(state) => actionDescriptor | null
 *     Called repeatedly within a turn. Returns the next action to take, or null
 *     (or { type: 'end_turn' }) to end the turn. The simulator re-queries the
 *     strategy after each executed action, so a strategy may take several
 *     actions per turn (each tapping the units it uses), exactly like a human
 *     clicking multiple Operation/Recruit buttons before pressing End Turn.
 *
 *   Action descriptors (mirroring the app's handlers):
 *     { type: 'end_turn' }                                    // or return null
 *     { type: 'recruit', poolIndex, attributer?, die? }       // die: 'd10'|'d12'
 *     { type: 'minor_vandalism',       operatives }
 *     { type: 'gather_supplies',       operatives }
 *     { type: 'average_vandalism',     operatives }
 *     { type: 'significant_vandalism', operatives, secondPenaltyChoice? }
 *     { type: 'scout',                 operatives }
 *     { type: 'late_game_scout',       operatives }
 *     { type: 'mid_game_op',           op, operatives }   // op ∈ availableMidGameOps
 *     { type: 'late_game_op',          op, operatives }   // op ∈ availableLateGameOps
 *   `operatives` is an array of live unit references drawn from
 *   GameState.untappedPool(state). The simulator marks them tapped (mirroring
 *   the app's tapUnits) before invoking the engine resolver, so untapping is
 *   handled for free by Turn.processEndOfTurn → untapAll.
 *
 *   Compound-Failure resolver hook (optional):
 *     options.compoundFailureChoice(state) => 'detain' | 'supplies'
 *   Supplies the player-chosen second penalty for Compound Failures. Used both
 *   for immediate ops (Significant Vandalism, when the action descriptor does
 *   not carry its own secondPenaltyChoice) and for Multi-turn ops (Scout /
 *   Late-Game Scout) that resolve inside Turn.processEndOfTurn. Defaults to
 *   'detain' when absent (matching the app, which passes no options and lets
 *   the engine default apply).
 *
 * ── Result ──────────────────────────────────────────────────────────────────
 *   runGame(...) => Promise<{ outcome: 'victory'|'stall', turns, state, reason }>
 *     outcome 'victory' — the engine set state.victory (3 distinct Late-Game
 *       Operation types completed).
 *     outcome 'stall'   — no legal move was available for STALL_LIMIT (10)
 *       consecutive turns (reason: 'no_legal_moves'), or the maxTurns safety cap
 *       was hit (reason: 'max_turns').
 */
const Simulator = (() => {

  // Consecutive turns with no legal move available before a game is declared a
  // Stall (a simulation-only outcome; normal play has no loss condition).
  const STALL_LIMIT = 10;

  // Safety cap so a strategy that always has a legal move but never reaches
  // Victory cannot loop forever (e.g. endless Minor Vandalism with the Leader).
  // Not a game rule — a batch-runner guard. Reaching it ends the game as a
  // Stall with reason 'max_turns'.
  const DEFAULT_MAX_TURNS = 1000;

  // ─── Legal-move availability (engine-based) ────────────────────────────────

  /**
   * Whether ANY legal move is currently available, evaluated purely against the
   * engine's availability checks — independent of what the strategy chooses.
   * The Stall detector uses this: a game where this stays false for STALL_LIMIT
   * consecutive turns has genuinely run out of options.
   *
   * A move is available when any of these hold:
   *   • an untapped unit exists (Minor Vandalism / Gather Supplies are K=1,
   *     0-supply, 0-influence — always executable with ≥1 untapped unit),
   *   • a Recruit Attempt is possible (a card in the Recruit Pool plus an
   *     eligible untapped attributer — the Leader, or an Operative whose value
   *     exceeds the card's), or
   *   • an available Mid/Late-Game Operation is executable right now.
   * @param {object} state
   * @returns {boolean}
   */
  function hasLegalMove(state) {
    const untapped = GameState.untappedPool(state);

    // K=1 operations (Minor Vandalism, Gather Supplies) need only one untapped
    // unit and no resources, so any untapped unit is already a legal move.
    if (untapped.length > 0) return true;

    // Recruit Attempt: a pooled card with an eligible untapped attributer.
    if (recruitableCard(state) !== null) return true;

    // An available Mid/Late-Game Operation that clears its requirements now.
    // (The threshold/headcount checks don't depend on WHICH opportunity, so a
    // single availability check per tier suffices.)
    if (state.availableMidGameOps.length > 0 && Operations.canExecuteMidGameOp(state, untapped)) return true;
    if (state.availableLateGameOps.length > 0 && Operations.canExecuteLateGameOp(state, untapped)) return true;
    return false;
  }

  /**
   * The first Recruit-Pool index that can be attempted this turn — i.e. one for
   * which an eligible, untapped attributer exists (the Leader is always eligible
   * regardless of value; a non-Leader Operative only if its value exceeds the
   * card's), mirroring app.js attemptRecruit. Returns null if none.
   * @param {object} state
   * @returns {number|null}
   */
  function recruitableCard(state) {
    for (let i = 0; i < state.recruitPool.length; i++) {
      if (eligibleAttributers(state, state.recruitPool[i]).length > 0) return i;
    }
    return null;
  }

  /**
   * Untapped units eligible to perform a Recruit Attempt on `card` (#49):
   * the Leader (always, if untapped) plus any untapped Operative whose value is
   * strictly greater than the card's. Mirrors app.js attemptRecruit.
   */
  function eligibleAttributers(state, card) {
    const leader = (state.leader && !state.leader.tapped) ? [state.leader] : [];
    return leader.concat(state.operatives.filter((op) => !op.tapped && op.value > card.value));
  }

  // ─── Recruit Attempt (orchestrated) ────────────────────────────────────────
  //
  // The Recruit Attempt lives only in the App layer (app.js attemptRecruit), not
  // in an engine module, so it is orchestrated here from the same primitives the
  // app uses (Dice + GameState). This is the one place the simulator is not a
  // pure pass-through to an engine rule module — see the report/flag for #23.

  // Influence bonus die thresholds (mirrors app.js getInfluenceDie).
  function influenceDie(influence) {
    if (influence >= 300) return 'd20';
    if (influence >= 250) return 'd12';
    if (influence >= 200) return 'd10';
    if (influence >= 150) return 'd8';
    if (influence >= 100) return 'd6';
    if (influence >= 50) return 'd4';
    return null;
  }

  /**
   * Perform one Recruit Attempt, mirroring app.js attemptRecruit sans DOM:
   * taps the attributer, optionally spends 1 Supply to upgrade the base die to
   * d12, rolls base + Influence-bonus die, and on total >= card.value promotes
   * the card from the Recruit Pool to an Initiate (2-turn timer).
   * @returns {boolean} whether the attempt executed (false if illegal)
   */
  async function executeRecruit(state, action) {
    const card = state.recruitPool[action.poolIndex];
    if (!card) return false;

    const eligible = eligibleAttributers(state, card);
    if (eligible.length === 0) return false;
    const attributer = action.attributer && eligible.includes(action.attributer)
      ? action.attributer
      : eligible[0];

    // Spend the attributer's action for the turn.
    attributer.tapped = true;

    let baseDie = 'd10';
    if (action.die === 'd12' && state.supplies >= 1) {
      baseDie = 'd12';
      GameState.addSupplies(state, -1);
    }

    let total = await Dice.roll(baseDie);
    const bonusDie = influenceDie(state.influence);
    if (bonusDie) total += await Dice.roll(bonusDie);

    if (total >= card.value) {
      state.recruitPool.splice(action.poolIndex, 1);
      state.initiates.push({ card, turnsRemaining: 2 });
    }
    return true;
  }

  // ─── Action dispatch ───────────────────────────────────────────────────────

  /**
   * Mark a set of units tapped (mirrors app.js tapUnits): each spends its one
   * action for the turn and drops out of the untapped pool until End Turn.
   */
  function tapUnits(units) {
    (units || []).forEach((u) => { if (u) u.tapped = true; });
  }

  /**
   * Execute one action descriptor against the engine, tapping the units it uses.
   * Returns whether the action actually executed (false for an unknown/illegal
   * descriptor — the caller treats that as end-of-turn to stay loop-safe).
   * @param {object} state
   * @param {object} action
   * @param {object} runOpts - carries compoundFailureChoice
   * @returns {Promise<boolean>}
   */
  async function executeAction(state, action, runOpts) {
    if (!action || action.type === 'end_turn') return false;

    const compound = (choice) =>
      choice || (runOpts.compoundFailureChoice
        ? runOpts.compoundFailureChoice(state)
        : 'detain');

    switch (action.type) {
      case 'recruit':
        return executeRecruit(state, action);

      case 'minor_vandalism':
        tapUnits(action.operatives);
        await Operations.resolveMinorVandalism(state, action.operatives);
        return true;

      case 'gather_supplies':
        tapUnits(action.operatives);
        await Operations.resolveGatherSupplies(state, action.operatives);
        return true;

      case 'average_vandalism':
        tapUnits(action.operatives);
        await Operations.resolveAverageVandalism(state, action.operatives);
        return true;

      case 'significant_vandalism':
        tapUnits(action.operatives);
        await Operations.resolveSignificantVandalism(state, action.operatives, {
          secondPenaltyChoice: compound(action.secondPenaltyChoice),
        });
        return true;

      case 'scout':
        tapUnits(action.operatives);
        Operations.startScout(state, action.operatives);
        return true;

      case 'late_game_scout':
        tapUnits(action.operatives);
        Operations.startLateGameScout(state, action.operatives);
        return true;

      case 'mid_game_op':
        tapUnits(action.operatives);
        await Operations.resolveMidGameOp(state, action.op, action.operatives);
        return true;

      case 'late_game_op':
        tapUnits(action.operatives);
        Operations.startLateGameOp(state, action.op, action.operatives);
        return true;

      default:
        return false;
    }
  }

  // ─── Full-game loop ────────────────────────────────────────────────────────

  /**
   * Build a fresh game state with Input Mode forced to digital. Callers may pass
   * options.setup(state) to seed a custom starting position (used by tests); by
   * default it mirrors app.js beginGame: a shuffled 52-card Recruitment Deck and
   * zeroed resources at turn 1.
   */
  function createGame(options) {
    let state;
    if (typeof options.setup === 'function') {
      state = options.setup(GameState.createInitial());
    } else {
      state = GameState.createInitial();
      state.recruitDeck = Deck.createDeck();
      Deck.shuffle(state.recruitDeck);
    }
    // Difficulty is a game-wide setting fixing the Mid/Late-Game Influence
    // thresholds (state.js / operations.js read state.difficulty). Honor an
    // explicit options.difficulty in BOTH paths so it drives the game whether or
    // not a custom setup seeded the state.
    if (options.difficulty) state.difficulty = options.difficulty;
    forceDigital(state);
    return state;
  }

  /**
   * Force Input Mode to digital at the state level. Dice/Deck providers are
   * cleared to their internal RNG/deck path by the caller (see runGame) so
   * Dice.roll / Deck.draw never reach for a DOM manual-entry provider.
   */
  function forceDigital(state) {
    state.inputMode = { dice: 'digital', cards: 'digital' };
  }

  /**
   * Run one complete game to Victory or Stall.
   * @param {Function} strategy - strategy(state) => actionDescriptor | null
   * @param {object} [options]
   *   - difficulty {string} 'easy'|'medium'|'hard' (default from createInitial)
   *   - compoundFailureChoice {(state)=>'detain'|'supplies'} Compound-Failure hook
   *   - setup {(state)=>state} seed a custom start (tests)
   *   - maxTurns {number} safety cap (default 1000)
   * @returns {Promise<{outcome:string, turns:number, state:object, reason:string}>}
   */
  async function runGame(strategy, options = {}) {
    // Digital input mode: clear any DOM manual-entry providers so Dice.roll /
    // Deck.draw use their internal RNG / deck. Tests install their own
    // deterministic Dice provider and restore it themselves; only Deck's
    // provider is force-cleared here (the engine deck is always digital in sim).
    Deck.setProvider(null);

    const state = createGame(options);
    const maxTurns = options.maxTurns || DEFAULT_MAX_TURNS;

    let noMoveStreak = 0;

    while (true) {
      // Stall detection (engine-based): count consecutive turns entered with no
      // legal move available. Evaluated at the START of the turn, before the
      // strategy acts, so a move that appears mid-game (a released Detained
      // Operative, a promoted Initiate) resets the streak.
      if (hasLegalMove(state)) {
        noMoveStreak = 0;
      } else {
        noMoveStreak += 1;
        if (noMoveStreak >= STALL_LIMIT) {
          return { outcome: 'stall', reason: 'no_legal_moves', turns: state.currentTurn, state };
        }
      }

      // Action phase: query the strategy repeatedly until it ends the turn.
      while (true) {
        const action = await strategy(state);
        const executed = await executeAction(state, action, options);
        if (!executed) break;              // null / end_turn / illegal => end turn
        if (state.victory) break;          // an action won the game
      }

      // End-of-turn engine step: timers, multi-turn resolution, untap. The
      // Compound-Failure hook feeds any Multi-turn op (Scout / Late-Game Scout)
      // resolving this turn; absent hook => engine default ('detain').
      const eotOptions = options.compoundFailureChoice
        ? { secondPenaltyChoice: options.compoundFailureChoice(state) }
        : undefined;
      await Turn.processEndOfTurn(state, eotOptions);

      // Victory can only be set by a Late-Game Operation resolving in
      // processEndOfTurn (or, defensively, by an action above). Mirror app.js
      // endTurn: on Victory the run is over — skip Crackdown and the increment.
      if (state.victory) {
        return { outcome: 'victory', reason: 'victory', turns: state.currentTurn, state };
      }

      await Crackdown.resolveCrackdown(state);
      state.currentTurn += 1;

      if (state.currentTurn > maxTurns) {
        return { outcome: 'stall', reason: 'max_turns', turns: state.currentTurn, state };
      }
    }
  }

  return {
    runGame,
    hasLegalMove,
    STALL_LIMIT,
  };
})();
