/**
 * Crackdown Engine for The Good Fight TTRPG (#18).
 *
 * At the end of every turn the Regime rolls d100. If the roll is <= current
 * Heat, a Crackdown is triggered and a penalty is applied from the 5-tier table
 * (selected by the roll's value). Heat is then reduced by the roll's value
 * every turn, regardless of whether the Crackdown triggered.
 *
 * Engine-only (no DOM). Uses injected Dice / Deck / GameState providers.
 */
const Crackdown = (() => {

  // ─── Penalty Tier Table ─────────────────────────────────────────────────────
  //
  // Selected by the Crackdown roll's value. `base` is the primary personnel /
  // supply cost; `influence` is a flat, unconditional Influence loss applied on
  // top (only the two harshest tiers have one).
  const TIER_TABLE = [
    { max: 20,  name: 'Stockpile raid',       base: { type: 'supplies',   amount: 3 }, influence: 0  },
    { max: 40,  name: 'Training ground raid', base: { type: 'initiates',  amount: 1 }, influence: 0  },
    { max: 60,  name: 'Safehouse raid',       base: { type: 'operatives', amount: 1 }, influence: 0  },
    { max: 80,  name: 'Warehouse raid',       base: { type: 'operatives', amount: 2 }, influence: 20 },
    { max: 100, name: 'Headquarters raid',    base: { type: 'operatives', amount: 4 }, influence: 50 },
  ];

  function tierForRoll(roll) {
    return TIER_TABLE.find((tier) => roll <= tier.max);
  }

  // ─── Cascade Substitution ───────────────────────────────────────────────────
  //
  // A penalty demanding `amount` of `type`: remove as many as are available; for
  // every unit that cannot be paid, convert it to 2 of the next type down
  // (Operative -> Initiate -> Supplies). The conversion chains a second time if
  // the intermediate type is also unavailable. Captured Operative / Initiate
  // cards are shuffled back into the Recruitment Deck.
  //
  // `penalties` accumulates the units actually paid at each level.
  function applyPenalty(state, type, amount, captured, penalties) {
    if (amount <= 0) return;

    if (type === 'supplies') {
      GameState.addSupplies(state, -amount);
      penalties.supplies += amount;
      return;
    }

    if (type === 'operatives') {
      const removed = Math.min(amount, state.operatives.length);
      for (let i = 0; i < removed; i++) {
        captured.push(state.operatives.shift());
      }
      penalties.operatives += removed;
      const missing = amount - removed;
      if (missing > 0) {
        applyPenalty(state, 'initiates', missing * 2, captured, penalties);
      }
      return;
    }

    if (type === 'initiates') {
      const removed = Math.min(amount, state.initiates.length);
      for (let i = 0; i < removed; i++) {
        captured.push(state.initiates.shift().card);
      }
      penalties.initiates += removed;
      const missing = amount - removed;
      if (missing > 0) {
        applyPenalty(state, 'supplies', missing * 2, captured, penalties);
      }
    }
  }

  /**
   * Run the end-of-turn Crackdown check.
   *
   * @param {object} state - Game state (mutated in place)
   * @returns {Promise<{roll:number, triggered:boolean, tier:?object,
   *   penalties:{operatives:number, initiates:number, supplies:number,
   *   influence:number}}>}
   */
  async function resolveCrackdown(state) {
    const roll = await Dice.roll('d100');
    const triggered = roll <= state.heat;

    let tier = null;
    const penalties = { operatives: 0, initiates: 0, supplies: 0, influence: 0 };

    if (triggered) {
      tier = tierForRoll(roll);
      const captured = [];

      applyPenalty(state, tier.base.type, tier.base.amount, captured, penalties);

      if (tier.influence > 0) {
        GameState.addInfluence(state, -tier.influence);
        penalties.influence = tier.influence;
      }

      // Captured Operative / Initiate cards are shuffled back into the deck.
      if (captured.length > 0) {
        Deck.returnCards(state.recruitDeck, captured);
      }
    }

    // Heat cools by the roll's value every turn, triggered or not (PRD.md).
    GameState.setHeat(state, state.heat - roll);

    return { roll, triggered, tier, penalties };
  }

  return {
    resolveCrackdown,
  };
})();
