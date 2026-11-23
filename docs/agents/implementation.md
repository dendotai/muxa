# Implementation

How muxa's code is built: its dependencies, its shared utilities, and how it passes commands to dekit.

## Dependencies

muxa's runtime dependencies are `@dekit/cli` and `koffi`, which reads the macOS keyboard layout for the confirmation prompt (ADR 0006). The build keeps `koffi` out of the bundle (`--external koffi`). muxa parses its arguments with no CLI framework (`packages/muxa/src/parser.ts`).

## Shared utilities

- **Line number of `scripts`**: `readPackageScripts` in `packages/muxa/src/package-manager.ts` finds the line of the `"scripts"` key in a `package.json`. `validateScript` puts it after the full path in the error for a missing script, as `/path/to/packages/backend/package.json:8`, so an editor's terminal opens the file at that line.
- **Confirmation prompt**: `confirmPrompt` in `packages/muxa/src/utils.ts` asks a yes-or-no question.
  - Its `defaultValue` argument sets the default, No when left out; the prompt shows the default as the capital letter (`y/N` or `Y/n`), and <kbd>Enter</kbd> picks it.
  - In a TTY, one keypress answers: `y` or `Y` for yes, `n` or `N` for no; <kbd>Ctrl</kbd>+<kbd>C</kbd> exits with code 1.
    - On macOS, a key typed on a non-Latin layout answers as the Latin letter of the same key: `н` (the Y key on Russian) is yes. `loadLatinKeyMap` in `packages/muxa/src/keyboard-layout.ts` reads the map through `koffi` when the prompt shows; `MUXA_TEST_KEYBOARD_LAYOUT` names an installed input source to read in its place, for tests (`com.apple.keylayout.Russian`).
    - Elsewhere, or when the lookup fails, the first non-Latin letter prints `Press y or n (switch to a Latin layout)`, and the prompt waits.
  - With no TTY, it reads a line, in any case: `y` or `yes` for yes, `n` or `no` for no; any other line asks again.
  - Its one caller is `checkDuplicateNames`, which asks when two processes have one name.

## Shell wrapping

`transformCommand` in `packages/muxa/src/command-builder.ts` decides whether a command is wrapped; `buildMprocsArgs` then passes it to dekit either as it is or as `sh -c '…'`, with each `'` in the command written as `'\''`.

A command is wrapped when:

- it comes from `-s` or `-w`, which turn it into `cd <package path> && <command>`: `muxa -s backend dev` with `yarn.lock` becomes `sh -c 'cd /path/to/backend && yarn run dev'`
- it comes from `-c` or basic mode and `needsShellWrapping` finds any of:
  - an operator or redirection: `&`, `|`, `;`, `<`, `>`
  - a glob: `*`, `?`, `[`, `]`
  - text in braces: `{a,b}`, `{x}`
  - a variable: `$VAR`, `${VAR}`
  - command substitution or a subshell: `` `cmd` ``, `$(cmd)`, `(cmd)`
  - a `~` at the start of a word or after `:`
  - a backslash
  - a quote, `'` or `"`

Any other command is passed as it is: `muxa -c 'npm test'` passes `npm test` to dekit unchanged.

A command from `-s` or `-w` that holds a `'` is escaped twice: once when muxa prepends the `cd`, and once more when it wraps the result in `sh -c`.
