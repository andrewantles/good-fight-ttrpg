/**
 * Tests for crackdown.js — End-of-turn Crackdown resolution (#18).
 *
 * At the end of every turn the Regime rolls d100; roll <= Heat triggers a
 * Crackdown whose penalty tier is selected from the roll's value. Heat is
 * reduced by the roll's value every turn regardless of whether it triggered.
 *
 * Cascade substitution (PRD.md): a penalty requiring N of a personnel type,
 * for each missing unit, converts to 2 of the next type down
 * (Operative -> Initiate -> Supplies), chaining a second time if the
 * intermediate type is also unavailable. Captured Operative/Initiate cards are
 * shuffled back into the Recruitment Deck.
 */

// Deterministic d100 provider (Crackdown only rolls a single d100).
function crackdownDice(roll) {
  Dice.setProvider(() => Promise.resolve(roll));
}

TestRunner.describe('crackdown.js — Trigger & Heat reduction', function () {

  TestRunner.test('roll greater than heat does not trigger, but heat still drops by roll', async function () {
    const state = GameState.createInitial();
    state.heat = 30;
    state.supplies = 10;

    crackdownDice(55); // 55 > 30 -> no crackdown
    const result = await Crackdown.resolveCrackdown(state);
    Dice.setProvider(null);

    TestRunner.assertEqual(result.triggered, false, 'not triggered when roll > heat');
    TestRunner.assertEqual(state.heat, 0, 'heat reduced by roll value, clamped at 0');
    TestRunner.assertEqual(state.supplies, 10, 'no penalty applied when not triggered');
  });

  TestRunner.test('roll equal to heat triggers (roll <= heat boundary)', async function () {
    const state = GameState.createInitial();
    state.heat = 15;
    state.supplies = 10;

    crackdownDice(15); // 15 <= 15 -> triggers, tier <=20
    const result = await Crackdown.resolveCrackdown(state);
    Dice.setProvider(null);

    TestRunner.assertEqual(result.triggered, true, 'triggered when roll === heat');
    TestRunner.assertEqual(state.heat, 0, 'heat reduced by roll value');
  });

});

TestRunner.describe('crackdown.js — Penalty tiers', function () {

  TestRunner.test('roll <=20 (Stockpile raid): -3 supplies', async function () {
    const state = GameState.createInitial();
    state.heat = 100;
    state.supplies = 10;

    crackdownDice(20);
    const result = await Crackdown.resolveCrackdown(state);
    Dice.setProvider(null);

    TestRunner.assertEqual(result.tier.name, 'Stockpile raid', 'tier name');
    TestRunner.assertEqual(state.supplies, 7, '-3 supplies');
    TestRunner.assertEqual(result.penalties.supplies, 3, 'reports 3 supplies lost');
  });

  TestRunner.test('roll 21-40 (Training ground raid): -1 initiate, card returned to deck', async function () {
    const state = GameState.createInitial();
    state.heat = 100;
    const card = { suit: 'hearts', rank: '8', value: 8 };
    state.initiates = [{ card, turnsRemaining: 2 }];
    state.recruitDeck = [];

    crackdownDice(30);
    const result = await Crackdown.resolveCrackdown(state);
    Dice.setProvider(null);

    TestRunner.assertEqual(result.tier.name, 'Training ground raid', 'tier name');
    TestRunner.assertEqual(state.initiates.length, 0, '1 initiate captured');
    TestRunner.assertEqual(state.recruitDeck.length, 1, 'captured card returned to recruit deck');
    TestRunner.assertEqual(state.recruitDeck[0], card, 'the initiate card is back in the deck');
    TestRunner.assertEqual(result.penalties.initiates, 1, 'reports 1 initiate captured');
  });

  TestRunner.test('roll 41-60 (Safehouse raid): -1 operative, card returned to deck', async function () {
    const state = GameState.createInitial();
    state.heat = 100;
    const card = { suit: 'spades', rank: 'K', value: 13 };
    state.operatives = [card];
    state.recruitDeck = [];

    crackdownDice(50);
    const result = await Crackdown.resolveCrackdown(state);
    Dice.setProvider(null);

    TestRunner.assertEqual(result.tier.name, 'Safehouse raid', 'tier name');
    TestRunner.assertEqual(state.operatives.length, 0, '1 operative captured');
    TestRunner.assertEqual(state.recruitDeck.length, 1, 'captured card returned to recruit deck');
    TestRunner.assertEqual(state.recruitDeck[0], card, 'the operative card is back in the deck');
    TestRunner.assertEqual(result.penalties.operatives, 1, 'reports 1 operative captured');
  });

  TestRunner.test('roll 61-80 (Warehouse raid): -2 operatives + -20 influence', async function () {
    const state = GameState.createInitial();
    state.heat = 100;
    state.influence = 100;
    const cards = [
      { suit: 'clubs', rank: '3', value: 3 },
      { suit: 'clubs', rank: '4', value: 4 },
    ];
    state.operatives = [...cards];
    state.recruitDeck = [];

    crackdownDice(70);
    const result = await Crackdown.resolveCrackdown(state);
    Dice.setProvider(null);

    TestRunner.assertEqual(result.tier.name, 'Warehouse raid', 'tier name');
    TestRunner.assertEqual(state.operatives.length, 0, '2 operatives captured');
    TestRunner.assertEqual(state.recruitDeck.length, 2, 'both cards returned to deck');
    TestRunner.assertEqual(state.influence, 80, '-20 influence');
    TestRunner.assertEqual(result.penalties.influence, 20, 'reports 20 influence lost');
  });

  TestRunner.test('roll 81-100 (Headquarters raid): -4 operatives + -50 influence', async function () {
    const state = GameState.createInitial();
    state.heat = 100;
    state.influence = 100;
    state.operatives = [1, 2, 3, 4].map((n) => ({ suit: 'diamonds', rank: String(n + 1), value: n + 1 }));
    state.recruitDeck = [];

    crackdownDice(90);
    const result = await Crackdown.resolveCrackdown(state);
    Dice.setProvider(null);

    TestRunner.assertEqual(result.tier.name, 'Headquarters raid', 'tier name');
    TestRunner.assertEqual(state.operatives.length, 0, '4 operatives captured');
    TestRunner.assertEqual(state.recruitDeck.length, 4, 'all 4 cards returned to deck');
    TestRunner.assertEqual(state.influence, 50, '-50 influence');
    TestRunner.assertEqual(result.penalties.operatives, 4, 'reports 4 operatives captured');
  });

});

TestRunner.describe('crackdown.js — Cascade substitution', function () {

  TestRunner.test('PRD worked example: Warehouse raid, 1 operative & 0 initiates -> -1 op, -4 supplies', async function () {
    const state = GameState.createInitial();
    state.heat = 100;
    state.influence = 100;
    const op = { suit: 'hearts', rank: '2', value: 2 };
    state.operatives = [op];
    state.initiates = [];
    state.supplies = 10;
    state.recruitDeck = [];

    crackdownDice(75); // Warehouse raid: base -2 operatives
    const result = await Crackdown.resolveCrackdown(state);
    Dice.setProvider(null);

    // 1 operative removed; the 1 missing operative -> 2 initiates owed;
    // 0 initiates available -> each missing initiate -> 2 supplies = 4 supplies.
    TestRunner.assertEqual(state.operatives.length, 0, '1 operative captured (all available)');
    TestRunner.assertEqual(state.supplies, 6, '-4 supplies from chained cascade');
    TestRunner.assertEqual(state.recruitDeck.length, 1, 'the captured operative card returned to deck');
    TestRunner.assertEqual(result.penalties.operatives, 1, 'reports 1 operative captured');
    TestRunner.assertEqual(result.penalties.supplies, 4, 'reports 4 supplies lost via cascade');
  });

  TestRunner.test('Safehouse raid with 0 operatives cascades to initiates then supplies', async function () {
    const state = GameState.createInitial();
    state.heat = 100;
    state.operatives = [];
    const init = { suit: 'clubs', rank: '6', value: 6 };
    state.initiates = [{ card: init, turnsRemaining: 1 }];
    state.supplies = 10;
    state.recruitDeck = [];

    crackdownDice(45); // Safehouse: base -1 operative
    const result = await Crackdown.resolveCrackdown(state);
    Dice.setProvider(null);

    // 0 operatives -> 1 missing op -> 2 initiates owed; 1 initiate available
    // captured, remaining 1 missing initiate -> 2 supplies.
    TestRunner.assertEqual(state.initiates.length, 0, '1 initiate captured in cascade');
    TestRunner.assertEqual(state.supplies, 8, '-2 supplies for the still-missing initiate');
    TestRunner.assertEqual(result.penalties.operatives, 0, 'no operatives available');
    TestRunner.assertEqual(result.penalties.initiates, 1, '1 initiate captured');
    TestRunner.assertEqual(result.penalties.supplies, 2, '2 supplies lost');
    TestRunner.assertEqual(state.recruitDeck.length, 1, 'captured initiate card returned to deck');
  });

});
