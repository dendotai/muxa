# Testing

How muxa's tests are built, and the fixture monorepos they need.

## Running the tests

- `bun run build` in `packages/muxa` comes first: the integration tests start the built `packages/muxa/dist/index.js`, not the source.
- `bun run test` in `packages/muxa` runs every test with `MUXA_TEST_MODE=true`; `bun run test` at the repo root also runs the tests in `checks/`.
- The integration tests start muxa with `node` when `CI` is set and with `bun` otherwise (`muxaRuntime` in `packages/muxa/tests/helpers/constants.ts`).
- Imports use `@/` for `packages/muxa/src/` and `@tests/` for `packages/muxa/tests/`.

## Test mode

With `MUXA_TEST_MODE=true`, muxa prints the `dekit.yaml` it would write and each `dekit` command it would run, starts no dekit, and writes no file:

```text
Would write /…/.muxa/basic-npm-monorepo/dekit.yaml:
"defaults":
  "env":
    "MUXA_RUNNING": "1"
    "FORCE_COLOR": "1"
"tasks":
  "frontend":
    "label": "frontend"
    "cmd": "npm run dev"
    "cwd": "/…/packages/frontend"
    "autostart": true
    "log":
      "file": "/…/.muxa/logs/frontend.log"
      "mode": "append"
Would execute: dekit '-C' '/…/.muxa/basic-npm-monorepo' 'up'
Would execute: dekit '-C' '/…/.muxa/basic-npm-monorepo' 'reload' '--yes'
Would execute: dekit '-C' '/…/.muxa/basic-npm-monorepo' 'attach'
Would execute: dekit '-C' '/…/.muxa/basic-npm-monorepo' 'runner' 'stop'
FORCE_COLOR=1
```

- `getMuxaProcesses` in `packages/muxa/tests/helpers/muxa-runner.ts` starts muxa in test mode and returns its processes, read from the printed `dekit.yaml`: the name as typed, the command without the `sh -c` around it, the folder, and the log file; `processesOf` reads them from the output of another runner.
  - A test of a name, a command, or a folder reads them here, so a change to how muxa starts dekit changes only the helper.
  - A test of the tasks themselves (the shell wrapping, the log field, `mouse_scroll_speed`) reads `dekitConfigOf` or `dekitTasksOf`; `getMuxaCommand` returns the `cmd` of the first task.
- `runMuxa` in `packages/muxa/tests/helpers/muxa-runner.ts` starts muxa in test mode and returns its output.
- `runInTerminal` in `packages/muxa/tests/helpers/terminal-runner.ts` starts muxa in a pseudo-terminal with `MUXA_TEST_MODE` unset, so muxa starts the real dekit; use it for a test that needs a TTY or a keypress.
  - A runner outlives a muxa that a test kills, so `cleanupFixture` stops each runner whose root is inside the folder it deletes.
  - It sets `MUXA_TEST_SKIP_LOGS_LINE_QUESTION=1`, so muxa skips the question about a `muxa logs` line in `CLAUDE.md`; a test of that question passes the variable as `""`.
- `followLogs` in `packages/muxa/tests/helpers/follow-runner.ts` starts `muxa logs … -f` with its output in a pipe, and can pause it with `SIGSTOP`, as a reader that stops reading does.

## Fixture monorepos

Two kinds:

- a folder in `packages/muxa/tests/fixtures/`, for a layout that several tests share
- a temporary folder that the test creates and deletes, from `packages/muxa/tests/helpers/fixture-helpers.ts`: `createMonorepoFixture({ type, packages })` writes the workspace config of `type` and, for yarn, pnpm and bun, its lockfile; `cleanupFixture` deletes it

The folders in `packages/muxa/tests/fixtures/`:

| Folder            | What it covers                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| `basic-npm`       | npm workspaces with no lockfile; `backend` is both `packages/backend` and `apps/backend`                  |
| `yarn-workspace`  | yarn workspaces with `yarn.lock`                                                                          |
| `pnpm-workspace`  | `pnpm-workspace.yaml` with `pnpm-lock.yaml`                                                               |
| `bun-workspace`   | workspaces with `bun.lockb`                                                                               |
| `no-workspace`    | a project with `yarn.lock` and no workspaces                                                              |
| `ambiguous-names` | three packages in `packages/`, `services/` and `tools/`, each in a folder named `backend`                 |
| `scoped-packages` | scoped names (`@company/auth`, `@company/data-layer`, `@company/ui-components`) whose folder names differ |
| `single-dir`      | workspaces listed as plain folders (`api`, `web`, `mobile`), with no glob                                 |

## Coverage the tests need

- Each package manager: bun, pnpm, npm, yarn.
- Package manager detection (unit tests in `packages/muxa/tests/unit/package-manager.test.ts`):
  - each lockfile muxa checks (`bun.lockb`, `yarn.lock`, `pnpm-lock.yaml`, `package-lock.json`)
  - the `packageManager` field in the root `package.json`, valid and invalid values
  - a lockfile beside a `packageManager` field that names another manager: the lockfile wins
- A detected manager that is not in `PATH`: `packages/muxa/tests/integration/cli/package-manager-fallback.test.ts` sets `PATH` to the runtime's folder only, and muxa falls back to `npm run`.
- The run command of each manager (`npm run`, `yarn run`, `pnpm run`, `bun run`).
- A name that matches several packages, a scoped package, and a workspace listed as a plain folder.
