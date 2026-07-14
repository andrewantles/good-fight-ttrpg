/**
 * Turn Lifecycle Engine for The Good Fight TTRPG.
 * End-of-turn processing: advances Initiate timers, releases Detained
 * Operatives whose timer has expired, and advances Multi-turn Operations
 * (Scout / Late-Game Scout), resolving any that complete this turn.
 *
 * Engine-only (no DOM). Does NOT run the Crackdown check or increment the
 * turn counter — those are separate steps orchestrated by the End Turn
 * handler (#18, #20).
 */
const Turn = (() => {

  /**
   * Advance Initiate timers. Each Initiate's turnsRemaining decrements by 1;
   * when it reaches 0 the card is promoted to an Operative (pushed onto
   * state.operatives) and removed from state.initiates.
   */
  function advanceInitiates(state) {
    const remaining = [];
    for (const initiate of state.initiates) {
      initiate.turnsRemaining -= 1;
      if (initiate.turnsRemaining <= 0) {
        state.operatives.push(initiate.card);
      } else {
        remaining.push(initiate);
      }
    }
    state.initiates = remaining;
  }

  /**
   * Release Detained Operatives whose timer has expired. Each detained
   * entry's turnsRemaining decrements by 1; when it reaches 0 the card is
   * returned to state.operatives and removed from state.detainedOperatives.
   */
  function releaseDetained(state) {
    const remaining = [];
    for (const detained of state.detainedOperatives) {
      detained.turnsRemaining -= 1;
      if (detained.turnsRemaining <= 0) {
        state.operatives.push(detained.card);
      } else {
        remaining.push(detained);
      }
    }
    state.detainedOperatives = remaining;
  }

  // Resolver dispatch for Multi-turn Operations. Keyed by the op's
  // `operation` tag. Future multi-turn ops (e.g. Late-Game Scout, #17) add
  // their resolver here.
  const MULTI_TURN_RESOLVERS = {
    scout: (state, op, options) =>
      Operations.resolveScout(state, op.assignedOperatives, options),
    late_game_scout: (state, op, options) =>
      Operations.resolveLateGameScout(state, op.assignedOperatives, options),
    late_game_op: (state, op) =>
      Operations.resolveLateGameOp(state, op.opportunity, op.assignedOperatives),
  };

  /**
   * Advance Multi-turn Operations (Scout / Late-Game Scout). Each op's
   * turnsRemaining decrements by 1; when it reaches 0 the op is resolved via
   * its registered resolver and removed from state.multiTurnOps.
   *
   * @param {object} state
   * @param {object} [options] - Passed through to the resolver (e.g.
   *   { secondPenaltyChoice } for a Compound Failure). Absent → the
   *   resolver's own default applies.
   */
  async function advanceMultiTurnOps(state, options) {
    const remaining = [];
    for (const op of state.multiTurnOps) {
      op.turnsRemaining -= 1;
      if (op.turnsRemaining <= 0) {
        const resolver = MULTI_TURN_RESOLVERS[op.operation];
        if (resolver) await resolver(state, op, options);
      } else {
        remaining.push(op);
      }
    }
    state.multiTurnOps = remaining;
  }

  /**
   * Run end-of-turn processing. Does NOT run Crackdown or increment the turn
   * counter — those are separate steps (#18, #20).
   *
   * @param {object} state
   * @param {object} [options] - Passed through to multi-turn resolvers.
   */
  async function processEndOfTurn(state, options) {
    advanceInitiates(state);
    // A newly-promoted (possibly higher-value) Operative may raise the Leader's
    // skill high-water mark (#48). Recompute right after promotions so the mark
    // rises when a new Operative appears — and, being monotonic, never falls
    // when one is later lost or detained.
    GameState.updateLeaderSkill(state);
    releaseDetained(state);
    await advanceMultiTurnOps(state, options);
  }

  return {
    processEndOfTurn,
  };
})();
