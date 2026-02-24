# General:
- Does running simulations require the node/happy-dom setup? Perhaps for more than 1 simulation at a time, yes?

# tests/test-runner.js
## Ask Claude
- Diff between assertEqual and assertDeepEqual? Json.stringify?
## Figure out myself
- How does triple equals === work in JS?
    - **Ans:** trip-eq check type and value equality; whereas double-eq will perform type coercion (1 == true, 1 = '1')
- What is a "throw" in this context? assertThrows
    - **Ans:** "throw" means to throw an error. This assertion checks that an error was thrown, as expected. I assume this is part of test-driven development: Write the test, assert that it throws, then write the code that satisfies the test.
- I don't see how the runAll function is called
    - **Ans:** Oh, it's called from the `test.html` page (that hadn't been written yet) - duh. 

# tests/test-state.js
- Where is this test suite called from and how?
- I see several test calls to many `GameState` methods that obviously aren't written yet (since the `GameState` class doesn't exist yet) 
    - just FYI note to self
    - test themselves look good though/
- There are tests for either the top-end clamping or low-end clamping for Influence and Heat values, but not both for both. Problem?

# tests/test-dice.js
- Just gonna say that I don't see how these are supposed to work at all:
    - `'provider receives correct die type string'`
    - `'custom provider is called instead of digital roll'`
- `Dice.setProvider(var)`
    - Tests are passing `null` to this method, and commenting that the intention is to force "digital" mode (as opposed to manual human rolls/draws).
    - But then, tests are passing `dieType` to this method?
    - **Ans:** Later, Claude wrote out the code and explained in comments that passing `null` to the function turns "digital mode," while passing a denomination of die (`dieType`) creates a promise with a clamp of 0 - max die value. 

# tests/test-deck.js
- takes two decks, sorts, asserts equal; then shuffles to assert not equal. Fine, but states in a comment: 
    - `"(extremely unlikely both stay the same — 1/52! chance)"` - Any way this can be true? seems like it would be 1/52^2 or something
- I feel like this is a duplicated test: `'cardValue() maps rank to correct numeric value'`

# js/state.js
- `save()` doesn't check for existing value - just over-writes. Options:
    - Pop an "Ok to overwrite?" message
    - Append incrementing digit if existing match found
    - Add randomized identifier, check, re-gen if collision

# js/dice.js
- `Dice.provider` logic seems to have some gaps around manual rolling:
    - In the `roll()` method, if manual rolling, a die-type provider is returned, but that's it. 
        - I assume this has to do with the async Promise thing going on. 

# js/deck.js
- Shuffle method comment: `Shuffle a deck in place (Fisher-Yates).` I want to look this up.
