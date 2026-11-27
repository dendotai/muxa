# Implementation

How muxa's code is built: its dependencies, its shared utilities, and how it passes commands to dekit.

## Dependencies

muxa's runtime dependencies are the dekit canary packages and `koffi`, which reads the macOS keyboard layout for the confirmation prompt (ADR 0006). The build keeps `koffi` out of the bundle (`--external koffi`). muxa parses its arguments with no CLI framework (`packages/muxa/src/parser.ts`).

The dekit canary packages, `@den-ai/dekit-canary-<os>-<cpu>`, are `optionalDependencies` at one exact version, and `dekitBinaryPath` in `packages/muxa/src/dekit.ts` finds the binary in the one npm installed (ADR 0009). `.github/workflows/update-dekit-canary.yml` publishes a newer canary and opens the PR that moves the pin; `packages/muxa/scripts/update-dekit-canary.ts` holds its steps, one command each.

## Shared utilities

- **Line number of `scripts`**: `readPackageScripts` in `packages/muxa/src/package-manager.ts` finds the line of the `"scripts"` key in a `package.json`. `validateScript` puts it after the full path in the error for a missing script, as `/path/to/packages/backend/package.json:8`, so an editor's terminal opens the file at that line.
- **Confirmation prompt**: `confirmPrompt` in `packages/muxa/src/utils.ts` asks a yes-or-no question.
  - Its `defaultValue` argument sets the default, No when left out; the prompt shows the default as the capital letter (`y/N` or `Y/n`), and <kbd>Enter</kbd> picks it.
  - In a TTY, one keypress answers: `y` or `Y` for yes, `n` or `N` for no; <kbd>Ctrl</kbd>+<kbd>C</kbd> exits with code 1.
    - On macOS, a key typed on a non-Latin layout answers as the Latin letter of the same key: `н` (the Y key on Russian) is yes. `loadLatinKeyMap` in `packages/muxa/src/keyboard-layout.ts` reads the map through `koffi` when the prompt shows; `MUXA_TEST_KEYBOARD_LAYOUT` names an installed input source to read in its place, for tests (`com.apple.keylayout.Russian`).
    - Elsewhere, or when the lookup fails, the first non-Latin letter prints `Press y or n (switch to a Latin layout)`, and the prompt waits.
  - With no TTY, it reads a line, in any case: `y` or `yes` for yes, `n` or `no` for no; any other line asks again.
  - `checkDuplicateNames` calls it when two processes have one name, `checkOpenRuns` in `packages/muxa/src/second-start.ts` when another open run has a process of the same name, `packages/muxa/src/index.ts` when muxa cannot write the log files, and `offerLogsLine` in `packages/muxa/src/logs-line.ts` for the `muxa logs` line in `CLAUDE.md`.

## Runner root and tasks

At each start, `packages/muxa/src/index.ts` writes `dekit.yaml` in the runner root and runs `dekit -C <root> up`, `reload --yes`, and `attach`; after the screen closes, it runs `runner stop` when the runner still runs (ADR 0010).

- **Root**: `runnerRoot` in `packages/muxa/src/runner.ts` returns `.muxa/<title>/`, where `<title>` is the process list title with each character a folder name cannot hold turned into `_` (`@acme/web` becomes `@acme_web`). A folder with no `package.json` has its root at `~/.local/state/muxa/runners/<folder path>/<title>/`; `homeFolderName` in `packages/muxa/src/log-files.ts` writes the folder path the same way for the runners and for the home log folder.
- **Old title**: before the start, muxa stops a runner that runs in another root beside this one (`otherRoots`), since a change of the title moves the root.
- **Tasks**: `buildDekitConfig` writes one task per process. Its path is the log file's name without `.log`, its `label` the name as typed, its `cwd` the package folder of `-s` and `-w` or the current folder, and its `log` the full path of the log file in `append` mode. `defaults.env` sets `MUXA_RUNNING`, and `FORCE_COLOR` when it is not set; `defaults.mouse_scroll_speed` comes from `mouseScrollSpeed`.
- **YAML**: `toYaml` writes each key and string as a JSON string, which YAML reads as a double-quoted scalar, so muxa needs no YAML package.

## Shell wrapping

dekit runs a task's `cmd` without a shell, and refuses a string `cmd` with a shell's syntax in it. `needsShellWrapping` in `packages/muxa/src/command-builder.ts` decides whether a command runs as `["sh", "-c", "<command>"]`; any other command is dekit's string form, which dekit splits into words.

A command is wrapped when `needsShellWrapping` finds any of:

- an operator or redirection: `&`, `|`, `;`, `<`, `>`
- a glob: `*`, `?`, `[`, `]`
- text in braces: `{a,b}`, `{x}`
- a variable: `$VAR`, `${VAR}`
- command substitution or a subshell: `` `cmd` ``, `$(cmd)`, `(cmd)`
- a `~` at the start of a word or after `:`
- a backslash
- a quote, `'` or `"`
- a variable set before the command: `NODE_ENV=production npm start`
- a `#` at the start of a word, or a line break
- a shell keyword (`if`, `!`, `for`) or a builtin (`cd`, `exit`, `export`) as the first word

The rules are the same for `-c`, basic mode, `-s`, and `-w`: `muxa -s backend dev` with `yarn.lock` runs `yarn run dev` with `cwd` set to the package folder, and `muxa -c 'npm test'` runs `npm test`.
