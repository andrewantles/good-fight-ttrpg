/**
 * Game State Management for The Good Fight TTRPG.
 * Handles state creation, persistence (localStorage), and resource clamping.
 */
const GameState = (() => {
  const STORAGE_PREFIX = 'good-fight-save-';

  function createInitial() {
    return {
      // Setup
      resistanceValues: [],
      regimeType: [],

      // Input Mode
      inputMode: {
        dice: 'digital',
        cards: 'digital',
      },

      // Difficulty (easy/medium/hard) — gates Mid/Late-Game Operation
      // Influence thresholds. Chosen once at Setup; has real mechanical effect.
      difficulty: 'medium',

      // Resources
      influence: 0,
      heat: 0,
      supplies: 0,

      // Highest Influence ever reached this game (monotonic; updated by
      // setInfluence). Reported on the Victory screen.
      peakInfluence: 0,

      // Deck & Personnel
      recruitDeck: [],
      recruitPool: [],
      initiates: [],
      operatives: [],
      detainedOperatives: [],

      // The Leader ("yourself") — the player's permanent, un-losable unit,
      // represented by a Joker. Always counts as an Operative (see
      // assignablePool) but is held OUTSIDE state.operatives so it is never
      // recruited, detained, or captured. Value stays 0 (Leader Skill Level is
      // tracked separately by leaderSkillLevel).
      leader: { isLeader: true, suit: 'joker', rank: 'Joker', value: 0 },
      leaderSkillLevel: 0,

      // Cumulative count of Operatives permanently lost (captured and recycled
      // to the Recruitment Deck — detainment is temporary and not counted).
      // Reported on the Victory screen.
      operativesLost: 0,

      // Turn
      currentTurn: 1,
      assignments: [],
      multiTurnOps: [],

      // Operations
      availableMidGameOps: [],
      availableLateGameOps: [],
      completedLateGameOps: [],

      // Victory — set true once 3 distinct Late-Game Operation types are
      // completed (the game's win condition). Consumed by the Victory screen.
      victory: false,

      // Log
      turnLog: [],
    };
  }

  /**
   * The pool of units assignable to Operations: the Leader plus every
   * Operative. The Leader always counts as an Operative (per CONTEXT.md), so
   * routing availability and assignment through this accessor lets K=1
   * Operations (Minor Vandalism, Gather Supplies) light up on a fresh game.
   * Guards against saves that predate state.leader — those simply yield the
   * operatives alone rather than crashing.
   * @param {object} state
   * @returns {Array} [leader, ...operatives] (or just operatives if no leader)
   */
  function assignablePool(state) {
    return state.leader ? [state.leader, ...state.operatives] : [...state.operatives];
  }

  /**
   * Update the Leader's skill level — a monotonic high-water mark equal to the
   * highest value among current Operatives (per the rulebook: "counting
   * yourself as an Operative with skill level matching your highest Operative
   * ... your skill doesn't go down if an Operative is lost"). The mark only
   * ever rises, so losing/detaining an Operative never lowers it.
   *
   * Also syncs state.leader.value to the skill level so the Leader contributes
   * its skill to operation success math (checkWithOperatives sums operative
   * values). Lives in the engine so headless simulations get correct Leader
   * skill without any App/DOM layer.
   *
   * Guards the empty-operatives case (mark holds) and saves that predate
   * state.leader (skill still ratchets; no leader to sync).
   * @param {object} state
   */
  function updateLeaderSkill(state) {
    const values = state.operatives.map((op) => op.value);
    const prior = state.leaderSkillLevel || 0;
    state.leaderSkillLevel = values.length ? Math.max(prior, ...values) : prior;
    if (state.leader) state.leader.value = state.leaderSkillLevel;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function setInfluence(state, value) {
    state.influence = clamp(value, 0, 500);
    state.peakInfluence = Math.max(state.peakInfluence || 0, state.influence);
  }

  function setHeat(state, value) {
    state.heat = clamp(value, 0, 100);
  }

  function setSupplies(state, value) {
    state.supplies = Math.max(0, value);
  }

  function addInfluence(state, delta) {
    setInfluence(state, state.influence + delta);
  }

  function addHeat(state, delta) {
    setHeat(state, state.heat + delta);
  }

  function addSupplies(state, delta) {
    setSupplies(state, state.supplies + delta);
  }

  function save(state, slotName) {
    const key = STORAGE_PREFIX + slotName;
    localStorage.setItem(key, JSON.stringify(state));
  }

  function load(slotName) {
    const key = STORAGE_PREFIX + slotName;
    const data = localStorage.getItem(key);
    if (data === null) return null;
    return JSON.parse(data);
  }

  function deleteSave(slotName) {
    const key = STORAGE_PREFIX + slotName;
    localStorage.removeItem(key);
  }

  function listSaves() {
    const saves = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(STORAGE_PREFIX)) {
        saves.push(key.slice(STORAGE_PREFIX.length));
      }
    }
    return saves;
  }

  return {
    createInitial,
    assignablePool,
    updateLeaderSkill,
    setInfluence,
    setHeat,
    setSupplies,
    addInfluence,
    addHeat,
    addSupplies,
    save,
    load,
    deleteSave,
    listSaves,
  };
})();
