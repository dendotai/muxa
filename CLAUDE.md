## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (`gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical labels, strings equal to their names, plus the state labels the maintenance workflow manages. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` at the repo root; ADRs live directly in `docs/adr/`. See `docs/agents/domain.md`.

### Testing

How the tests run, test mode, and the fixture monorepos the tests need. See `docs/agents/testing.md`.

### Implementation

muxa's dependencies, its shared utilities (the `scripts` line number, the confirmation prompt), and when it wraps a command in `sh -c`. See `docs/agents/implementation.md`.

## Version pins

A change that adds a version pin, or moves, renames or reshapes a line a `customManagers` rule in `renovate.json` reads, updates `renovate.json` and `maintenance/updates/renovate-pins.json` in the same commit, because Renovate skips a version pin it cannot find and reports no error. `maintenance/updates/check-renovate.test.mjs` fails when the two disagree, and the weekly `renovate` workflow opens a `needs-human` issue when a run missed one. What counts as a version pin, and the ones with no update job, are in `maintenance/updates/README.md`.
