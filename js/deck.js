/**
 * Card Deck Management for The Good Fight TTRPG.
 * Supports digital (auto-draw) and physical (manual entry via provider) modes.
 */
const Deck = (() => {
  const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const VALUE_MAP = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
    '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 15,
  };

  let provider = null;

  /**
   * Set a custom provider for physical/test mode.
   * Provider signature: (count: number) => Promise<Array<{suit, rank, value}>>
   * Pass null to reset to digital mode.
   */
  function setProvider(fn) {
    provider = fn;
  }

  /**
   * Create a fresh, ordered 52-card deck.
   * @returns {Array<{suit: string, rank: string, value: number}>}
   */
  function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ suit, rank, value: VALUE_MAP[rank] });
      }
    }
    return deck;
  }

  /**
   * Shuffle a deck in place (Fisher-Yates).
   * @param {Array} deck
   */
  function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }

  /**
   * Draw cards from the deck.
   * In digital mode, pops from the deck array.
   * In physical/provider mode, calls the provider and does NOT modify the deck
   * (the caller is responsible for tracking cards in play).
   * @param {Array} deck - The deck array (modified in digital mode)
   * @param {number} count - How many cards to draw
   * @returns {Promise<Array<{suit, rank, value}>>}
   */
  async function draw(deck, count) {
    if (provider) {
      return provider(count);
    }
    return digitalDraw(deck, count);
  }

  function digitalDraw(deck, count) {
    const actual = Math.min(count, deck.length);
    const drawn = deck.splice(0, actual);
    return drawn;
  }

  /**
   * Return cards to the deck (e.g., captured operatives shuffled back in).
   * @param {Array} deck
   * @param {Array} cards
   */
  function returnCards(deck, cards) {
    deck.push(...cards);
    shuffle(deck);
  }

  /**
   * Get the numeric value for a card rank.
   * @param {string} rank
   * @returns {number}
   */
  function cardValue(rank) {
    return VALUE_MAP[rank];
  }

  return {
    createDeck,
    shuffle,
    draw,
    returnCards,
    cardValue,
    setProvider,
    SUITS,
    RANKS,
  };
})();
