/**
 * Dice Rolling Engine for The Good Fight TTRPG.
 * Supports digital (Math.random) and physical (manual entry via provider) modes.
 * All rolls are async to support both modes with the same API.
 */
const Dice = (() => {
  const DIE_MAX = {
    d4: 4,
    d6: 6,
    d8: 8,
    d10: 10,
    d12: 12,
    d20: 20,
    d100: 100,
  };

  let provider = null;

  /**
   * Set a custom provider for physical/test mode.
   * Provider signature: (dieType: string) => Promise<number>
   * Pass null to reset to digital mode.
   */
  function setProvider(fn) {
    provider = fn;
  }

  /**
   * Roll a die of the given type.
   * @param {string} dieType - One of 'd4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'
   * @returns {Promise<number>} The roll result (1 to max inclusive)
   */
  async function roll(dieType) {
    if (provider) {
      return provider(dieType);
    }
    return digitalRoll(dieType);
  }

  function digitalRoll(dieType) {
    const max = DIE_MAX[dieType];
    if (!max) throw new Error(`Unknown die type: ${dieType}`);
    return Math.floor(Math.random() * max) + 1;
  }

  /**
   * Get the maximum value for a die type.
   * @param {string} dieType
   * @returns {number}
   */
  function getDieMax(dieType) {
    return DIE_MAX[dieType];
  }

  return {
    roll,
    setProvider,
    getDieMax,
  };
})();
