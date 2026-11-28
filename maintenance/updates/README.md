# Updates

Every version pin in the project gets an update job or a reason why it has none. A version pin is any place that picks a version of something from outside the repo: an exact version, a range, a major only (`@v6`), `latest`, or copied content with no version string.

## How updates run

Renovate opens the update PRs. [`.github/workflows/renovate.yml`](../../.github/workflows/renovate.yml) runs it every Monday at 03:17 UTC, and **Run workflow** on the workflow's page in the Actions tab starts a run at any time. It runs as the project's own GitHub App: a PR opened with `GITHUB_TOKEN` starts no workflow, so its checks would never run. The workflow pins the Renovate version it runs (`renovate-version`), and Renovate bumps that line too.

Each update PR runs every check in `.github/workflows/ci.yml` on the new version: typecheck, lint, format, the tests, and the build of every workspace, the docs app included. Nothing merges unattended.

[`renovate.json`](../../renovate.json) holds the rules:

- Every dependency stays at an exact version (`:pinAllExceptPeerDependencies`), so what runs is what the PR tested. `packages/muxa/package.json` is the exception (below).
- Every `uses:` keeps its full commit SHA, and Renovate updates the SHA and the `# vX.Y.Z` comment together.
- Every minor and patch update arrives in one PR a week (`group:allNonMajor`), so a green PR is one merge. Each major update gets its own PR, because a major often needs a code change, and a red major in the weekly PR would hold every other update.
- Each weekly run opens every update (`prHourlyLimit` and `prConcurrentLimit` at `0`), because the default limits of 2 new PRs an hour and 10 open left every other update a week behind. Renovate keeps no Dependency Dashboard issue (`dependencyDashboard` off).
- Major updates of packages that must move together share one PR: `react` with `react-dom`, through the monorepo groups of `config:recommended`.
- Bun's version is `packageManager` in the root `package.json`. `oven-sh/setup-bun` reads it in every workflow, and Renovate bumps it like a dependency.
- Renovate leaves the `@den-ai/dekit-canary-*` packages alone: [`update-dekit-canary.yml`](../../.github/workflows/update-dekit-canary.yml) updates them (ADR 0009), and npm tags each new canary `latest`, so Renovate would open a second PR for the same version.
- Every update PR that bumps `wrangler` runs `maintenance/updates/compatibility-date.mjs`, which writes the date of the `workerd` version in `bun.lock` into `compatibility_date` in `apps/docs/wrangler.jsonc` (`1.20260625.1` → `2026-06-25`). Local `wrangler` falls back to the newest date its runtime supports, so this keeps prod on the date the PR's checks ran. A hand bump of `wrangler` that leaves the date behind is fixed by the next update PR. Renovate runs only the commands that `RENOVATE_ALLOWED_COMMANDS` in `.github/workflows/renovate.yml` matches, so a new task command adds its pattern there.
- `semantic-release` runs through `npx`, outside `package.json`, so a rule finds `semantic-release@<version>` in the workflows and bumps every line together. The `semantic-release-dry-run` job in `ci.yml` runs that version with `--dry-run` on each PR, so a version that cannot load the release config fails its update PR, not the next release.

## The GitHub App

Renovate and `update-dekit-canary.yml` run as one GitHub App, which the repository reads from the `RENOVATE_CLIENT_ID` variable and the `RENOVATE_PRIVATE_KEY` secret. The app needs these repository permissions:

- Read and write: Checks, Commit statuses, Contents, Issues, Pull requests, Workflows.
- Read: Administration, Dependabot alerts, Metadata.

## Declining an update

Renovate keeps no record of the updates it proposed: each run proposes the newest version of every package that is behind.

- **One update in the weekly PR breaks a check:** revert that package in the PR's branch and merge the rest. The next run proposes it again, so a fixed release arrives on its own. Until one ships, add a rule to `renovate.json` that skips the broken version (`"matchPackageNames": ["<name>"], "allowedVersions": "!/^1\\.2\\.3$/"`) so the weekly PR stays green, and delete the rule once a newer release passes.
- **Closing the weekly PR declines nothing:** the next run opens it again with the same title.
- **Closing a major-update PR** skips the exact version its title names (`to 5.0.0`, not `to v5`), so the next release of that major opens a new PR, which is the retest.

## Exact pins, and the exception

Every `dependencies` and `devDependencies` entry is an exact version, except `koffi` in `packages/muxa/package.json`. `@den-ai/muxa` is published to npm, and an exact version in its `dependencies` would force every consumer to install that exact copy, so a rule in `renovate.json` gives that file `"rangeStrategy": "auto"`: a range stays a range, and an exact version stays exact.

## Version pins with no update job

- `gh`: it comes with the runner image, which `runs-on: ubuntu-24.04` pins.
- `cloudflare/wrangler-action` in `deploy-docs.yml` names no `wranglerVersion`: it runs the `wrangler` that `bun install` put in place, which `apps/docs/package.json` pins.
- The `$schema` URLs in `apps/docs/wrangler.jsonc` and `renovate.json`: editor hints, always the newest on purpose.
- `engines.node` in `packages/muxa/package.json`: the oldest Node version muxa supports, which a release changes on purpose.
- `docs/agents/` and the "Agent skills" section of `CLAUDE.md`: settings for skills installed outside the repo.
- `nodejs_compat` in `apps/docs/wrangler.jsonc`: a feature flag, not a version.
- The `package.json` files under `packages/muxa/tests/fixtures/`: test data with no dependencies, which Renovate skips (`config:recommended` ignores `**/tests/**`).

## A new version pin

A change that adds a kind Renovate does not find on its own adds a rule to `renovate.json` in the same commit, or adds its reason here. The rule for a line a `customManagers` rule reads is in the "Version pins" section of `CLAUDE.md`.

## The check after each run

Renovate skips a line its regex rule cannot match, and a file its ignore presets cover (`config:recommended` ignores `**/test/**`, `**/tests/**`, `**/__tests__/**`, `**/__fixtures__/**`, `**/examples/**`, `**/vendor/**` and `**/node_modules/**`), and reports no error. So the Renovate step writes its report to `/tmp/renovate-report.json`, and `maintenance/updates/check-renovate.mjs` compares it with the repo:

- Every regex finding against the places in `maintenance/updates/renovate-pins.json`, both ways.
- Every tracked `package.json` with dependencies, and every workflow with a `uses:` line or a versioned `runs-on:`, against the files the `bun` and `github-actions` managers found.

A failure opens one issue, **Renovate missed an expected version pin**, labelled `needs-human`, or comments on it when it is already open. Fix the rule or the list, then close the issue.
