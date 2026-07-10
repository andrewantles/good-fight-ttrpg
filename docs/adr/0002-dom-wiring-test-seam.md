# DOM-wiring tests for every engine-calling button

**Status**: accepted

The existing test suite (`test-app.js`, `test-ui.js`) tests engine modules as pure functions and UI components (modals, screen router) in isolation, but nothing verifies that a button's click handler actually reaches the right engine call. A wiring bug (wrong handler, missing call) would pass every existing test.

Going forward, any button or handler that calls into an engine module (`state`/`deck`/`dice`/`operations`/`crackdown`/`turn`) gets its own DOM-wiring test asserting the click reaches that call — not just critical/irreversible flows, but every such button. This is broader test surface than the prior convention and will need maintaining as UI changes, but it closes a gap the pure-engine and component-isolation tests structurally can't see.
