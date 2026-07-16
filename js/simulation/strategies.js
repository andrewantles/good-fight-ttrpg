/**
 * AI strategies for The Good Fight TTRPG headless simulator (#24).
 *
 * Four strategies — Cautious, Aggressive, Balanced, Random — each a plug for the
 * Simulator strategy contract (simulator.js). Every strategy is exported as:
 *
 *     { chooseAction(state) => actionDescriptor | null,
 *       compoundFailureChoice(state) => 'detain' | 'supplies' }
 *
 * so a caller (the batch runner, #25) wires it straight into runGame:
 *
 *     const s = Strategies.Aggressive;
 *     Simulator.runGame(s.chooseAction, {
 *       difficulty,
 *       compoundFailureChoice: s.compoundFailureChoice,
 *     });
 *
 * `chooseAction` is called repeatedly within a turn (the simulator re-queries
 * after each executed action, which taps the units it uses); it returns the next
 * action or null to end the turn. `compoundFailureChoice` supplies the
 * player-chosen second Compound-Failure penalty (detain 1 more operative vs. lose
 * Supplies) for Significant Vandalism and the Scout/Late-Game-Scout resolutions.
 *
 * ── Legality (the invariant these strategies guarantee) ─────────────────────
 * A strategy MUST only ever return an action the engine will accept. Rather than
 * each strategy re-deriving legality, all four share `legalActions(state)`, which
 * enumerates every currently-legal action descriptor by filtering candidate
 * actions through the SAME engine checks the app/simulator use:
 *   • K=1 ops (Minor Vandalism, Gather Supplies): any untapped unit.
 *   • Multi-operative ops (Average/Significant Vandalism, Scout): Operations.canExecute
 *     (headcount + Supplies) against the untapped pool.
 *   • Late-Game Scout: 6 untapped units + 8 Supplies (its startLateGameScout cost;
 *     it has no canExecute entry in operations.js, so the requirement is inlined).
 *   • Mid/Late-Game Ops: an available opportunity + Operations.canExecuteMid/LateGameOp
 *     (headcount + Supplies + difficulty-gated Influence threshold).
 *   • Recruit: a pooled card with an eligible untapped attributer (Leader always,
 *     or an Operative whose value exceeds the card's — mirrors app.js attemptRecruit).
 * A strategy then picks among that legal set by its personality; when the set is
 * empty (nothing legal or desirable remains) it returns null to end the turn.
 *
 * ── Operative selection & the un-losable Leader ─────────────────────────────
 * `untappedPool` lists the Leader first (assignablePool = [leader, ...operatives]).
 *   • Detain-risk ops (Vandalism, Scout) and K=1 ops keep the Leader first: the
 *     engine's detainOperatives SKIPS the Leader, so a real Operative absorbs any
 *     hit while the free Leader is spent on the action.
 *   • Capture-risk ops (Mid/Late-Game Ops) EXCLUDE the Leader: their failure path
 *     (captureOperatives) shifts victims from the FRONT and does NOT skip the
 *     Leader, so including it risks recycling the permanent Leader card into the
 *     Recruitment Deck. These ops (6/12 operatives) are assigned real Operatives
 *     only — a defensible, safe reading; the Leader is never one of the twelve.
 *
 * ── Personalities (priority orderings over action kinds) ────────────────────
 * PRD user story 19 fixes the Compound-Failure rule per strategy and sketches the
 * personalities; the fuller action orderings below are a defensible fill-in
 * (plan/simulation.md, which detailed them, was deleted — flagged as a PRD-silent
 * choice). Common to all: taking an available Late/Mid-Game Op or a Scout ranks
 * ABOVE the always-legal K=1 fillers, otherwise a strategy would Gather/Minor
 * every turn and never progress toward Victory.
 *   • Cautious   — protects headcount. Vandalism (detain/capture-heavy) sinks to
 *     the bottom; favors headcount-building Recruit and no-risk Gather among the
 *     fillers. Compound: 'supplies' (never lose an operative).
 *   • Aggressive — spends operatives. Vandalism ranks ABOVE the economy fillers;
 *     pushes Significant then Average Vandalism for Influence. Compound: 'detain'
 *     (never lose Supplies — it wants them for the next op).
 *   • Balanced   — trades off: takes wins/scouts, uses moderate Average Vandalism,
 *     keeps Recruit/Gather reasonably high, shuns the riskiest Significant
 *     Vandalism. Compound: whichever resource has more RELATIVE SLACK (below).
 *   • Random     — picks uniformly among the legal set; Compound flips a coin.
 *     Uses an injectable RNG (Strategies.setRandomSource) so tests are deterministic.
 */
const Strategies = (() => {

  // ─── Injectable RNG (Random strategy) ──────────────────────────────────────
  // Defaults to Math.random; tests override via setRandomSource for determinism
  // (mirrors Dice.setProvider). Passing null/undefined restores Math.random.
  let randomSource = Math.random;
  function setRandomSource(fn) { randomSource = fn || Math.random; }

  // ─── Per-op requirements used to size the assigned operative set ────────────
  // K = operatives to assign (mirrors operations.js OPERATION_REQS headcounts).
  // Late-Game Scout has no OPERATION_REQS entry; its cost lives in startLateGameScout.
  const LATE_GAME_SCOUT_OPERATIVES = 6;
  const LATE_GAME_SCOUT_SUPPLIES = 8;
  const MID_GAME_OP_OPERATIVES = 6;
  const LATE_GAME_OP_OPERATIVES = 12;

  // ─── Recruit-attributer eligibility (mirrors app.js / simulator.js) ─────────
  function eligibleAttributers(state, card) {
    const leader = (state.leader && !state.leader.tapped) ? [state.leader] : [];
    return leader.concat(state.operatives.filter((op) => !op.tapped && op.value > card.value));
  }

  // ─── Legal-action enumeration ───────────────────────────────────────────────

  /**
   * Every currently-legal action descriptor, grouped by kind. Each descriptor
   * carries a fresh `operatives` array of live untapped unit references (or, for
   * Recruit, a poolIndex + chosen attributer). Empty arrays for illegal kinds.
   * @param {object} state
   * @returns {object} map of kind => actionDescriptor[]
   */
  function candidatesByKind(state) {
    const untapped = GameState.untappedPool(state);        // Leader first
    const reals = untapped.filter((u) => !u.isLeader);     // Leader excluded

    const byKind = {
      recruit: [],
      minor_vandalism: [],
      gather_supplies: [],
      average_vandalism: [],
      significant_vandalism: [],
      scout: [],
      late_game_scout: [],
      mid_game_op: [],
      late_game_op: [],
    };

    // Recruit: one candidate per pooled card that has an eligible attributer.
    for (let i = 0; i < state.recruitPool.length; i++) {
      const eligible = eligibleAttributers(state, state.recruitPool[i]);
      if (eligible.length > 0) {
        byKind.recruit.push({ type: 'recruit', poolIndex: i, attributer: eligible[0] });
      }
    }

    // K=1 ops: any untapped unit (Leader first — free unit, no failure penalty).
    if (untapped.length >= 1) {
      byKind.minor_vandalism.push({ type: 'minor_vandalism', operatives: untapped.slice(0, 1) });
      byKind.gather_supplies.push({ type: 'gather_supplies', operatives: untapped.slice(0, 1) });
    }

    // Detain-risk multi-operative ops: engine availability check, Leader kept
    // first (detainOperatives skips it, so a real Operative absorbs the hit).
    if (Operations.canExecute('average_vandalism', state, untapped)) {
      byKind.average_vandalism.push({ type: 'average_vandalism', operatives: untapped.slice(0, 2) });
    }
    if (Operations.canExecute('significant_vandalism', state, untapped)) {
      byKind.significant_vandalism.push({ type: 'significant_vandalism', operatives: untapped.slice(0, 4) });
    }
    if (Operations.canExecute('scout', state, untapped)) {
      byKind.scout.push({ type: 'scout', operatives: untapped.slice(0, 4) });
    }
    if (untapped.length >= LATE_GAME_SCOUT_OPERATIVES && state.supplies >= LATE_GAME_SCOUT_SUPPLIES) {
      byKind.late_game_scout.push({
        type: 'late_game_scout',
        operatives: untapped.slice(0, LATE_GAME_SCOUT_OPERATIVES),
      });
    }

    // Capture-risk ops: Leader EXCLUDED (capture doesn't skip it). One candidate
    // per available opportunity; the engine check gates headcount/Supplies/Influence.
    if (state.availableMidGameOps.length > 0 &&
        reals.length >= MID_GAME_OP_OPERATIVES &&
        Operations.canExecuteMidGameOp(state, reals)) {
      for (const op of state.availableMidGameOps) {
        byKind.mid_game_op.push({ type: 'mid_game_op', op, operatives: reals.slice(0, MID_GAME_OP_OPERATIVES) });
      }
    }
    if (state.availableLateGameOps.length > 0 &&
        reals.length >= LATE_GAME_OP_OPERATIVES &&
        Operations.canExecuteLateGameOp(state, reals)) {
      for (const op of state.availableLateGameOps) {
        byKind.late_game_op.push({ type: 'late_game_op', op, operatives: reals.slice(0, LATE_GAME_OP_OPERATIVES) });
      }
    }

    return byKind;
  }

  /**
   * Flat list of every currently-legal action descriptor (used by Random and by
   * tests to prove a chosen action is a member of the legal set).
   * @param {object} state
   * @returns {Array}
   */
  function legalActions(state) {
    const byKind = candidatesByKind(state);
    return Object.keys(byKind).reduce((all, kind) => all.concat(byKind[kind]), []);
  }

  /**
   * Pick the first legal candidate whose kind is highest in `order`. Returns null
   * (end turn) when no kind in the ordering has a legal candidate.
   */
  function pickByPriority(state, order) {
    const byKind = candidatesByKind(state);
    for (const kind of order) {
      const list = byKind[kind];
      if (list && list.length > 0) return list[0];
    }
    return null;
  }

  /**
   * Uniform sample from the full legal action set (the same set Random uses),
   * via the injectable RNG. Returns null (end turn) when nothing is legal.
   */
  function uniformPick(state) {
    const legal = legalActions(state);
    if (legal.length === 0) return null;
    return legal[Math.floor(randomSource() * legal.length)];
  }

  /**
   * Epsilon-greedy choice for the three fixed strategies (#59): with probability
   * `epsilon` EXPLORE — sample uniformly from the full legal set instead of
   * following the priority ordering; otherwise EXPLOIT — take the priority top.
   * This frees a fixed strategy from starving on a permanently-preferred action
   * (e.g. Cautious ranking Gather above Minor Vandalism, the only op that can
   * seed the Recruit Pool with just the Leader). Draws from the SAME injectable
   * RNG so tests stay deterministic. Random is unaffected (it always explores).
   */
  function epsilonGreedy(state, order, epsilon) {
    if (randomSource() < epsilon) return uniformPick(state);
    return pickByPriority(state, order);
  }

  // ─── Priority orderings (high → low) ────────────────────────────────────────
  const CAUTIOUS_ORDER = [
    'late_game_op', 'mid_game_op', 'late_game_scout', 'scout',
    'recruit', 'gather_supplies', 'minor_vandalism',
    'average_vandalism', 'significant_vandalism',
  ];
  const AGGRESSIVE_ORDER = [
    'late_game_op', 'mid_game_op', 'late_game_scout', 'scout',
    'significant_vandalism', 'average_vandalism', 'minor_vandalism',
    'recruit', 'gather_supplies',
  ];
  const BALANCED_ORDER = [
    'late_game_op', 'mid_game_op', 'late_game_scout', 'scout',
    'average_vandalism', 'recruit', 'gather_supplies', 'minor_vandalism',
    'significant_vandalism',
  ];

  // ─── Compound-Failure rules ─────────────────────────────────────────────────

  // Peak per-op resource needs (the most demanding requirement each resource
  // faces: a Late-Game Operation wants 12 operatives and 20 Supplies). Relative
  // slack normalizes each resource against its peak need so the two are comparable.
  const OP_SLACK_REF = LATE_GAME_OP_OPERATIVES;   // 12
  const SUPPLY_SLACK_REF = 20;                    // Late-Game Op Supplies cost

  /**
   * Balanced Compound-Failure rule: sacrifice the resource with MORE relative
   * slack. Relative slack = (real operatives / 12) for headcount vs.
   * (supplies / 20) for Supplies. If operatives are as-or-more plentiful relative
   * to their peak need, detain one; otherwise spend Supplies. (Leader excluded
   * from the headcount — it is never losable.)
   */
  function balancedCompoundChoice(state) {
    const opSlack = state.operatives.length / OP_SLACK_REF;
    const supplySlack = (state.supplies || 0) / SUPPLY_SLACK_REF;
    return opSlack >= supplySlack ? 'detain' : 'supplies';
  }

  // ─── Epsilon-greedy exploration rates (#59) ─────────────────────────────────
  // Per-choice probability that a fixed strategy ignores its priority ordering
  // and samples uniformly from the legal set instead — anti-starvation, scaled
  // by risk appetite (Cautious explores least, Aggressive most).
  const CAUTIOUS_EPSILON = 0.05;
  const BALANCED_EPSILON = 0.10;
  const AGGRESSIVE_EPSILON = 0.15;

  // ─── Public strategy objects ────────────────────────────────────────────────
  const Cautious = {
    chooseAction: (state) => epsilonGreedy(state, CAUTIOUS_ORDER, CAUTIOUS_EPSILON),
    compoundFailureChoice: () => 'supplies',
  };
  const Aggressive = {
    chooseAction: (state) => epsilonGreedy(state, AGGRESSIVE_ORDER, AGGRESSIVE_EPSILON),
    compoundFailureChoice: () => 'detain',
  };
  const Balanced = {
    chooseAction: (state) => epsilonGreedy(state, BALANCED_ORDER, BALANCED_EPSILON),
    compoundFailureChoice: (state) => balancedCompoundChoice(state),
  };
  const Random = {
    chooseAction: (state) => uniformPick(state),
    compoundFailureChoice: () => (randomSource() < 0.5 ? 'detain' : 'supplies'),
  };

  return {
    Cautious,
    Aggressive,
    Balanced,
    Random,
    legalActions,
    setRandomSource,
  };
})();
