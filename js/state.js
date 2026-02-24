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

      // Resources
      influence: 0,
      heat: 0,
      supplies: 0,

      // Deck & Personnel
      recruitDeck: [],
      recruitPool: [],
      initiates: [],
      operatives: [],
      detainedOperatives: [],
      leaderSkillLevel: 0,

      // Turn
      currentTurn: 1,
      assignments: [],
      multiTurnOps: [],

      // Operations
      availableMidGameOps: [],
      availableLateGameOps: [],
      completedLateGameOps: [],

      // Log
      turnLog: [],
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function setInfluence(state, value) {
    state.influence = clamp(value, 0, 500);
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
