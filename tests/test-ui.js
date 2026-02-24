/**
 * Tests for UI manual input components (physical mode).
 * Tests the dice entry prompt and card picker that connect
 * to the Dice/Deck provider pattern.
 */
TestRunner.describe('ui.js — Dice Input', function () {

  TestRunner.test('diceInput creates a modal overlay in the DOM', async function () {
    const promise = UI.diceInput('d6');
    const overlay = document.querySelector('.modal-overlay');
    TestRunner.assert(overlay !== null, 'Modal overlay should exist in DOM');
    // Simulate submit to resolve
    const input = overlay.querySelector('input[type="number"]');
    input.value = '3';
    overlay.querySelector('button').click();
    await promise;
  });

  TestRunner.test('diceInput resolves with the entered number', async function () {
    const promise = UI.diceInput('d6');
    const overlay = document.querySelector('.modal-overlay');
    const input = overlay.querySelector('input[type="number"]');
    input.value = '4';
    overlay.querySelector('button').click();
    const result = await promise;
    TestRunner.assertEqual(result, 4);
  });

  TestRunner.test('diceInput sets correct min/max for d6', async function () {
    const promise = UI.diceInput('d6');
    const overlay = document.querySelector('.modal-overlay');
    const input = overlay.querySelector('input[type="number"]');
    TestRunner.assertEqual(input.min, '1');
    TestRunner.assertEqual(input.max, '6');
    input.value = '3';
    overlay.querySelector('button').click();
    await promise;
  });

  TestRunner.test('diceInput sets correct min/max for d100', async function () {
    const promise = UI.diceInput('d100');
    const overlay = document.querySelector('.modal-overlay');
    const input = overlay.querySelector('input[type="number"]');
    TestRunner.assertEqual(input.min, '1');
    TestRunner.assertEqual(input.max, '100');
    input.value = '50';
    overlay.querySelector('button').click();
    await promise;
  });

  TestRunner.test('diceInput removes modal from DOM after submit', async function () {
    const promise = UI.diceInput('d6');
    const overlay = document.querySelector('.modal-overlay');
    const input = overlay.querySelector('input[type="number"]');
    input.value = '2';
    overlay.querySelector('button').click();
    await promise;
    const afterOverlay = document.querySelector('.modal-overlay');
    TestRunner.assert(afterOverlay === null, 'Modal should be removed from DOM after submit');
  });

  TestRunner.test('diceInput displays the die type in the prompt', async function () {
    const promise = UI.diceInput('d20');
    const overlay = document.querySelector('.modal-overlay');
    const text = overlay.textContent;
    TestRunner.assert(text.includes('d20'), 'Prompt should mention the die type');
    const input = overlay.querySelector('input[type="number"]');
    input.value = '15';
    overlay.querySelector('button').click();
    await promise;
  });

  TestRunner.test('diceInput works as a Dice provider', async function () {
    // Set UI.diceInput as the provider, simulate entry
    Dice.setProvider(function (dieType) {
      return UI.diceInput(dieType);
    });

    const promise = Dice.roll('d8');
    const overlay = document.querySelector('.modal-overlay');
    const input = overlay.querySelector('input[type="number"]');
    input.value = '7';
    overlay.querySelector('button').click();
    const result = await promise;
    TestRunner.assertEqual(result, 7);

    // Reset provider
    Dice.setProvider(null);
  });

});

TestRunner.describe('ui.js — Card Input', function () {

  TestRunner.test('cardInput creates a modal overlay in the DOM', async function () {
    const promise = UI.cardInput(1);
    const overlay = document.querySelector('.modal-overlay');
    TestRunner.assert(overlay !== null, 'Modal overlay should exist in DOM');
    // Simulate selecting a card and submitting
    overlay.querySelector('[data-suit]').value = 'spades';
    overlay.querySelector('[data-rank]').value = 'A';
    overlay.querySelector('button').click();
    await promise;
  });

  TestRunner.test('cardInput resolves with correct card object', async function () {
    const promise = UI.cardInput(1);
    const overlay = document.querySelector('.modal-overlay');
    overlay.querySelector('[data-suit]').value = 'hearts';
    overlay.querySelector('[data-rank]').value = 'K';
    overlay.querySelector('button').click();
    const result = await promise;
    TestRunner.assertArrayLength(result, 1);
    TestRunner.assertEqual(result[0].suit, 'hearts');
    TestRunner.assertEqual(result[0].rank, 'K');
    TestRunner.assertEqual(result[0].value, 13);
  });

  TestRunner.test('cardInput maps card values correctly', async function () {
    const promise = UI.cardInput(1);
    const overlay = document.querySelector('.modal-overlay');
    overlay.querySelector('[data-suit]').value = 'diamonds';
    overlay.querySelector('[data-rank]').value = '7';
    overlay.querySelector('button').click();
    const result = await promise;
    TestRunner.assertEqual(result[0].value, 7);
  });

  TestRunner.test('cardInput for Ace maps to value 15', async function () {
    const promise = UI.cardInput(1);
    const overlay = document.querySelector('.modal-overlay');
    overlay.querySelector('[data-suit]').value = 'clubs';
    overlay.querySelector('[data-rank]').value = 'A';
    overlay.querySelector('button').click();
    const result = await promise;
    TestRunner.assertEqual(result[0].value, 15);
  });

  TestRunner.test('cardInput removes modal from DOM after submit', async function () {
    const promise = UI.cardInput(1);
    const overlay = document.querySelector('.modal-overlay');
    overlay.querySelector('[data-suit]').value = 'spades';
    overlay.querySelector('[data-rank]').value = '10';
    overlay.querySelector('button').click();
    await promise;
    const afterOverlay = document.querySelector('.modal-overlay');
    TestRunner.assert(afterOverlay === null, 'Modal should be removed from DOM after submit');
  });

  TestRunner.test('cardInput handles multiple cards sequentially', async function () {
    const promise = UI.cardInput(2);
    // First card
    let overlay = document.querySelector('.modal-overlay');
    overlay.querySelector('[data-suit]').value = 'hearts';
    overlay.querySelector('[data-rank]').value = '3';
    overlay.querySelector('button').click();
    // Wait a tick for next modal
    await new Promise(r => setTimeout(r, 0));
    // Second card
    overlay = document.querySelector('.modal-overlay');
    TestRunner.assert(overlay !== null, 'Second card modal should appear');
    overlay.querySelector('[data-suit]').value = 'spades';
    overlay.querySelector('[data-rank]').value = 'Q';
    overlay.querySelector('button').click();
    const result = await promise;
    TestRunner.assertArrayLength(result, 2);
    TestRunner.assertEqual(result[0].suit, 'hearts');
    TestRunner.assertEqual(result[0].rank, '3');
    TestRunner.assertEqual(result[1].suit, 'spades');
    TestRunner.assertEqual(result[1].rank, 'Q');
  });

  TestRunner.test('cardInput works as a Deck provider', async function () {
    const deck = Deck.createDeck();
    Deck.setProvider(function (count) {
      return UI.cardInput(count);
    });

    const promise = Deck.draw(deck, 1);
    const overlay = document.querySelector('.modal-overlay');
    overlay.querySelector('[data-suit]').value = 'diamonds';
    overlay.querySelector('[data-rank]').value = 'J';
    overlay.querySelector('button').click();
    const result = await promise;
    TestRunner.assertEqual(result[0].suit, 'diamonds');
    TestRunner.assertEqual(result[0].rank, 'J');
    TestRunner.assertEqual(result[0].value, 11);

    Deck.setProvider(null);
  });

});
