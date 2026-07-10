# Project Overview

A fully static, client-side web application that serves as an interactive game tracker and play interface for *The Good Fight* solo TTRPG. No backend required — all game state lives in the browser (with localStorage persistence). The app can fully replace the physical card deck, dice, and paper tracking with a digital interface — or the player can use their own physical dice and cards and enter results manually. A global **Input Mode** toggle lets the player switch between digital and physical at any time.

Game rules are here: `./The Good Fight Mini-TTRPG (Solo).pdf`

Remaining work lives as GitHub Issues (tracer-bullet tickets, see [ADR-0001](docs/adr/0001-tracer-bullet-tdd.md)), not a phased plan — see `PRD.md` for the current spec. For every change: confirm the seam, write one failing test, write the minimal implementation to pass it, then move on. Never batch-write a module's tests before its implementation exists.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `andrewantles/good-fight-ttrpg`, using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — root `CONTEXT.md` + `docs/adr/`, created lazily as needed. See `docs/agents/domain.md`.