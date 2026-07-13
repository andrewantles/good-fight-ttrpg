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

TestRunner.describe('ui.js — Operative Assignment Picker', function () {

  const pool = [
    { suit: 'hearts', rank: '5', value: 5 },
    { suit: 'spades', rank: 'K', value: 13 },
    { suit: 'clubs', rank: '9', value: 9 },
    { suit: 'diamonds', rank: 'A', value: 15 },
  ];

  TestRunner.test('assignOperatives creates a modal overlay listing every available operative', async function () {
    const promise = UI.assignOperatives(1, pool);
    const overlay = document.querySelector('.modal-overlay');
    TestRunner.assert(overlay !== null, 'Modal overlay should exist in DOM');
    const checkboxes = overlay.querySelectorAll('input[type="checkbox"]');
    TestRunner.assertArrayLength(Array.from(checkboxes), pool.length);
    checkboxes[0].checked = true;
    checkboxes[0].dispatchEvent(new Event('change'));
    overlay.querySelector('[data-submit]').click();
    await promise;
  });

  TestRunner.test('assignOperatives submit is disabled until exactly K are selected', async function () {
    const promise = UI.assignOperatives(2, pool);
    const overlay = document.querySelector('.modal-overlay');
    const submit = overlay.querySelector('[data-submit]');
    const checkboxes = Array.from(overlay.querySelectorAll('input[type="checkbox"]'));

    TestRunner.assert(submit.disabled, 'Submit should start disabled');

    checkboxes[0].checked = true;
    checkboxes[0].dispatchEvent(new Event('change'));
    TestRunner.assert(submit.disabled, 'Submit should stay disabled with only 1 of 2 selected');

    checkboxes[1].checked = true;
    checkboxes[1].dispatchEvent(new Event('change'));
    TestRunner.assert(!submit.disabled, 'Submit should enable at exactly 2 selected');

    checkboxes[2].checked = true;
    checkboxes[2].dispatchEvent(new Event('change'));
    TestRunner.assert(submit.disabled, 'Submit should disable again above 2 selected');

    checkboxes[2].checked = false;
    checkboxes[2].dispatchEvent(new Event('change'));
    submit.click();
    await promise;
  });

  TestRunner.test('assignOperatives resolves with exactly the K selected operative objects', async function () {
    const promise = UI.assignOperatives(2, pool);
    const overlay = document.querySelector('.modal-overlay');
    const checkboxes = Array.from(overlay.querySelectorAll('input[type="checkbox"]'));

    checkboxes[1].checked = true;
    checkboxes[1].dispatchEvent(new Event('change'));
    checkboxes[3].checked = true;
    checkboxes[3].dispatchEvent(new Event('change'));
    overlay.querySelector('[data-submit]').click();

    const result = await promise;
    TestRunner.assertArrayLength(result, 2);
    TestRunner.assertEqual(result[0], pool[1]);
    TestRunner.assertEqual(result[1], pool[3]);
  });

  TestRunner.test('assignOperatives removes the modal from DOM after submit', async function () {
    const promise = UI.assignOperatives(1, pool);
    const overlay = document.querySelector('.modal-overlay');
    const checkbox = overlay.querySelector('input[type="checkbox"]');
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    overlay.querySelector('[data-submit]').click();
    await promise;
    TestRunner.assert(document.querySelector('.modal-overlay') === null, 'Modal should be removed after submit');
  });

  TestRunner.test('assignOperatives enforces the count regardless of K', async function () {
    const promise = UI.assignOperatives(4, pool);
    const overlay = document.querySelector('.modal-overlay');
    const submit = overlay.querySelector('[data-submit]');
    const checkboxes = Array.from(overlay.querySelectorAll('input[type="checkbox"]'));

    checkboxes.slice(0, 3).forEach((cb) => {
      cb.checked = true;
      cb.dispatchEvent(new Event('change'));
    });
    TestRunner.assert(submit.disabled, 'Submit should stay disabled below K=4');

    checkboxes[3].checked = true;
    checkboxes[3].dispatchEvent(new Event('change'));
    TestRunner.assert(!submit.disabled, 'Submit should enable at exactly K=4');

    submit.click();
    const result = await promise;
    TestRunner.assertArrayLength(result, 4);
  });

});
