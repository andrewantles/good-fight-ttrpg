# Tracer-bullet TDD replaces phase-based planning

**Status**: accepted

`plan/plan.md` organized work into six sequential phases, each batching multiple modules. In practice this produced horizontal slicing: Phase 3 wrote all 36 `operations.js` tests in one pass, then implemented against them afterward, and Phase 2 skipped tests-first entirely. Both let rule-interpretation bugs (e.g. the `attemptRecruit` leader-block bug) ship undetected until tests were retrofitted — documented in `plan/questions.md`.

We're switching to tracer-bullet TDD (per the `/tdd` skill): confirm one seam, write one failing test, write the minimal implementation, repeat. No phase labels — a flat, continuously-reprioritized backlog of vertical slices instead. Existing code and its 118 passing tests are kept; only the process for new work changes.
