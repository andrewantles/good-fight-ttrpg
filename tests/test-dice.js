/* global TestRunner, Dice */

TestRunner.describe('dice.js — Dice Rolling Engine', () => {

  TestRunner.test('roll("d4") returns value between 1 and 4 (100 trials)', async () => {
    Dice.setProvider(null); // ensure digital mode
    for (let i = 0; i < 100; i++) {
      const result = await Dice.roll('d4');
      TestRunner.assertInRange(result, 1, 4, `d4 rolled ${result}`);
    }
  });

  TestRunner.test('roll("d6") returns value between 1 and 6 (100 trials)', async () => {
    Dice.setProvider(null);
    for (let i = 0; i < 100; i++) {
      const result = await Dice.roll('d6');
      TestRunner.assertInRange(result, 1, 6, `d6 rolled ${result}`);
    }
  });

  TestRunner.test('roll("d8") returns value between 1 and 8 (100 trials)', async () => {
    Dice.setProvider(null);
    for (let i = 0; i < 100; i++) {
      const result = await Dice.roll('d8');
      TestRunner.assertInRange(result, 1, 8, `d8 rolled ${result}`);
    }
  });

  TestRunner.test('roll("d10") returns value between 1 and 10 (100 trials)', async () => {
    Dice.setProvider(null);
    for (let i = 0; i < 100; i++) {
      const result = await Dice.roll('d10');
      TestRunner.assertInRange(result, 1, 10, `d10 rolled ${result}`);
    }
  });

  TestRunner.test('roll("d12") returns value between 1 and 12 (100 trials)', async () => {
    Dice.setProvider(null);
    for (let i = 0; i < 100; i++) {
      const result = await Dice.roll('d12');
      TestRunner.assertInRange(result, 1, 12, `d12 rolled ${result}`);
    }
  });

  TestRunner.test('roll("d20") returns value between 1 and 20 (100 trials)', async () => {
    Dice.setProvider(null);
    for (let i = 0; i < 100; i++) {
      const result = await Dice.roll('d20');
      TestRunner.assertInRange(result, 1, 20, `d20 rolled ${result}`);
    }
  });

  TestRunner.test('roll("d100") returns value between 1 and 100 (100 trials)', async () => {
    Dice.setProvider(null);
    for (let i = 0; i < 100; i++) {
      const result = await Dice.roll('d100');
      TestRunner.assertInRange(result, 1, 100, `d100 rolled ${result}`);
    }
  });

  TestRunner.test('roll() returns integers only', async () => {
    Dice.setProvider(null);
    for (let i = 0; i < 50; i++) {
      const result = await Dice.roll('d100');
      TestRunner.assertEqual(result, Math.floor(result), `d100 returned non-integer: ${result}`);
    }
  });

  TestRunner.test('custom provider is called instead of digital roll', async () => {
    let calledWith = null;
    Dice.setProvider((dieType) => {
      calledWith = dieType;
      return Promise.resolve(7);
    });

    const result = await Dice.roll('d10');
    TestRunner.assertEqual(calledWith, 'd10', 'Provider should receive die type');
    TestRunner.assertEqual(result, 7, 'Provider result should be returned');

    Dice.setProvider(null); // reset
  });

  TestRunner.test('provider receives correct die type string', async () => {
    const types = [];
    Dice.setProvider((dieType) => {
      types.push(dieType);
      return Promise.resolve(1);
    });

    await Dice.roll('d4');
    await Dice.roll('d20');
    await Dice.roll('d100');

    TestRunner.assertDeepEqual(types, ['d4', 'd20', 'd100']);
    Dice.setProvider(null);
  });

  TestRunner.test('getDieMax() returns correct max for each die type', () => {
    TestRunner.assertEqual(Dice.getDieMax('d4'), 4);
    TestRunner.assertEqual(Dice.getDieMax('d6'), 6);
    TestRunner.assertEqual(Dice.getDieMax('d8'), 8);
    TestRunner.assertEqual(Dice.getDieMax('d10'), 10);
    TestRunner.assertEqual(Dice.getDieMax('d12'), 12);
    TestRunner.assertEqual(Dice.getDieMax('d20'), 20);
    TestRunner.assertEqual(Dice.getDieMax('d100'), 100);
  });
});
