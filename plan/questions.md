**These are the operator's notes - Claude, do not edit or parse - Thank you.**
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

# js/app.js
## `attemptRecruit` method issues:
- `attemptRecruit` method feels random at beginning of phase 2. I suppose more game-action methods will likely wind up in this Class, but feels out of place with the other render, initialize game state, and save/load functions.
- Logic flaw in `attemptRecruit` method: it checks for `leaderskill===0`, but leader can always attempt recruitment with d10
    - State initializes to leaderskill===0, so recruitment would never be possible
    - Interestingly the generated test-driven-development.md file states the rule correctly:
        - "| 14 | Unit | Recruit attempt: leader can recruit any value | Leader exception |"
- Mis-interpretation of the rules in the `attemptRecruit` function - assigned operative skill level should not be changed:  
    - `// Use leader skill level as the recruiting operative's value`
    - Interestingly, the generated plan.md file states the rule correctly: 
        - "Recruit attempts: operative must have higher value than recruit (or use leader)"
- The dice roll(s) are being added to the operative skill level
    - The dice themselves are the recruit attempt check 
    - The operative skill level only let's us know whether an attempt can be made
- Burning a supply is not present in the function, and can be used to raise base d10 to d12.
## Log concern:
- Log events are being appended to a `GameState.turnLog`. I worry about performance issues depending on how long games run and how large these lists grow.
    - Potential solutions:
        - Could implement some for of compression
        - Could optimize and shrink the log format, and have a "pretty print" step for the last X logs, rendered dynamically based on what the user is directly attempting to view in the UI
    - Might be a good metric to track in the simulations. So far, simulation has been entirely focused on gameplay insights, and not on application performance.
## Other observations:
- `App.drawToPool` method for drawing to recruit pool is currently orphaned 
    - confirm functionality implemented in Phase 3 when Recruit Operation logic is implemented
- `App.updateLeaderSkill` is wrong - setting leader skill to Zero if no operatives. 
    - As long as leader can always attempt recruitment to get an initial skill level to attempt other ops.

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

