/* global TestRunner, Deck */

TestRunner.describe('deck.js — Card Deck Management', () => {

  TestRunner.test('fresh deck contains exactly 52 cards', () => {
    const deck = Deck.createDeck();
    TestRunner.assertEqual(deck.length, 52);
  });

  TestRunner.test('all cards are unique (no duplicate suit+rank combos)', () => {
    const deck = Deck.createDeck();
    const keys = deck.map(c => `${c.suit}-${c.rank}`);
    const unique = new Set(keys);
    TestRunner.assertEqual(unique.size, 52, `Found ${unique.size} unique cards, expected 52`);
  });

  TestRunner.test('card values: 2-10 face value, J=11, Q=12, K=13, A=15', () => {
    const deck = Deck.createDeck();
    const byRank = {};
    for (const card of deck) {
      byRank[card.rank] = card.value;
    }

    TestRunner.assertEqual(byRank['2'], 2);
    TestRunner.assertEqual(byRank['3'], 3);
    TestRunner.assertEqual(byRank['4'], 4);
    TestRunner.assertEqual(byRank['5'], 5);
    TestRunner.assertEqual(byRank['6'], 6);
    TestRunner.assertEqual(byRank['7'], 7);
    TestRunner.assertEqual(byRank['8'], 8);
    TestRunner.assertEqual(byRank['9'], 9);
    TestRunner.assertEqual(byRank['10'], 10);
    TestRunner.assertEqual(byRank['J'], 11);
    TestRunner.assertEqual(byRank['Q'], 12);
    TestRunner.assertEqual(byRank['K'], 13);
    TestRunner.assertEqual(byRank['A'], 15);
  });

  TestRunner.test('deck contains all four suits', () => {
    const deck = Deck.createDeck();
    const suits = new Set(deck.map(c => c.suit));
    TestRunner.assertEqual(suits.size, 4);
    TestRunner.assert(suits.has('hearts'));
    TestRunner.assert(suits.has('diamonds'));
    TestRunner.assert(suits.has('clubs'));
    TestRunner.assert(suits.has('spades'));
  });

  TestRunner.test('each suit has 13 cards', () => {
    const deck = Deck.createDeck();
    const bySuit = {};
    for (const card of deck) {
      bySuit[card.suit] = (bySuit[card.suit] || 0) + 1;
    }
    TestRunner.assertEqual(bySuit['hearts'], 13);
    TestRunner.assertEqual(bySuit['diamonds'], 13);
    TestRunner.assertEqual(bySuit['clubs'], 13);
    TestRunner.assertEqual(bySuit['spades'], 13);
  });

  TestRunner.test('draw(1) removes one card from deck and returns it', async () => {
    const deck = Deck.createDeck();
    Deck.shuffle(deck);
    Deck.setProvider(null); // digital mode
    const drawn = await Deck.draw(deck, 1);
    TestRunner.assertEqual(drawn.length, 1);
    TestRunner.assertEqual(deck.length, 51);
    TestRunner.assert(drawn[0].suit !== undefined);
    TestRunner.assert(drawn[0].rank !== undefined);
    TestRunner.assert(drawn[0].value !== undefined);
  });

  TestRunner.test('draw(5) removes five cards, deck size decreases by 5', async () => {
    const deck = Deck.createDeck();
    Deck.shuffle(deck);
    Deck.setProvider(null);
    const drawn = await Deck.draw(deck, 5);
    TestRunner.assertEqual(drawn.length, 5);
    TestRunner.assertEqual(deck.length, 47);
  });

  TestRunner.test('drawn cards are no longer in the deck', async () => {
    const deck = Deck.createDeck();
    Deck.shuffle(deck);
    Deck.setProvider(null);
    const drawn = await Deck.draw(deck, 3);
    for (const card of drawn) {
      const found = deck.find(c => c.suit === card.suit && c.rank === card.rank);
      TestRunner.assertEqual(found, undefined, `Card ${card.rank} of ${card.suit} should not be in deck`);
    }
  });

  TestRunner.test('drawing from empty deck returns empty array', async () => {
    const deck = [];
    Deck.setProvider(null);
    const drawn = await Deck.draw(deck, 1);
    TestRunner.assertEqual(drawn.length, 0);
  });

  TestRunner.test('drawing more cards than deck contains returns only remaining cards', async () => {
    const deck = Deck.createDeck();
    // Remove all but 3 cards
    deck.splice(0, 49);
    TestRunner.assertEqual(deck.length, 3);
    Deck.setProvider(null);
    const drawn = await Deck.draw(deck, 5);
    TestRunner.assertEqual(drawn.length, 3);
    TestRunner.assertEqual(deck.length, 0);
  });

  TestRunner.test('returnCards() adds cards back to deck', () => {
    const deck = Deck.createDeck();
    const removed = deck.splice(0, 5);
    TestRunner.assertEqual(deck.length, 47);
    Deck.returnCards(deck, removed);
    TestRunner.assertEqual(deck.length, 52);
  });

  TestRunner.test('returned cards can be drawn again', async () => {
    const deck = Deck.createDeck();
    Deck.shuffle(deck);
    Deck.setProvider(null);

    const drawn = await Deck.draw(deck, 1);
    const card = drawn[0];
    TestRunner.assertEqual(deck.length, 51);

    Deck.returnCards(deck, [card]);
    TestRunner.assertEqual(deck.length, 52);

    // The card should be findable in the deck now
    const found = deck.find(c => c.suit === card.suit && c.rank === card.rank);
    TestRunner.assert(found !== undefined, 'Returned card should be back in deck');
  });

  TestRunner.test('shuffle() randomizes deck order', () => {
    const deck1 = Deck.createDeck();
    const deck2 = Deck.createDeck();
    // Both start in the same order
    const order1Before = deck1.map(c => `${c.suit}-${c.rank}`).join(',');
    const order2Before = deck2.map(c => `${c.suit}-${c.rank}`).join(',');
    TestRunner.assertEqual(order1Before, order2Before);

    Deck.shuffle(deck1);
    Deck.shuffle(deck2);
    // After shuffle, at least one should differ from original
    // (extremely unlikely both stay the same — 1/52! chance)
    const order1After = deck1.map(c => `${c.suit}-${c.rank}`).join(',');
    TestRunner.assertNotEqual(order1After, order1Before, 'Shuffle should change deck order');
  });

  TestRunner.test('custom provider is called instead of auto-draw', async () => {
    const deck = Deck.createDeck();
    let providerCalled = false;

    Deck.setProvider((count) => {
      providerCalled = true;
      return Promise.resolve([{ suit: 'hearts', rank: 'A', value: 15 }]);
    });

    const drawn = await Deck.draw(deck, 1);
    TestRunner.assert(providerCalled, 'Provider should have been called');
    TestRunner.assertEqual(drawn[0].suit, 'hearts');
    TestRunner.assertEqual(drawn[0].rank, 'A');
    TestRunner.assertEqual(drawn[0].value, 15);

    Deck.setProvider(null); // reset
  });

  TestRunner.test('cardValue() maps rank to correct numeric value', () => {
    TestRunner.assertEqual(Deck.cardValue('2'), 2);
    TestRunner.assertEqual(Deck.cardValue('10'), 10);
    TestRunner.assertEqual(Deck.cardValue('J'), 11);
    TestRunner.assertEqual(Deck.cardValue('Q'), 12);
    TestRunner.assertEqual(Deck.cardValue('K'), 13);
    TestRunner.assertEqual(Deck.cardValue('A'), 15);
  });
});
