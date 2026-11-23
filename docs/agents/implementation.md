# Implementation

How muxa's code is built: its dependencies, its shared utilities, and how it passes commands to dekit.

## Dependencies

muxa's one runtime dependency is `@dekit/cli`. It parses its arguments with no CLI framework (`packages/muxa/src/parser.ts`).

## Shared utilities

- **Line number of `scripts`**: `readPackageScripts` in `packages/muxa/src/package-manager.ts` finds the line of the `"scripts"` key in a `package.json`. `validateScript` puts it after the full path in the error for a missing script, as `/path/to/packages/backend/package.json:8`, so an editor's terminal opens the file at that line.
- **Confirmation prompt**: `confirmPrompt` in `packages/muxa/src/utils.ts` asks a yes-or-no question.
  - Its `defaultValue` argument sets the default, No when left out; the prompt shows the default as the capital letter (`y/N` or `Y/n`), and <kbd>Enter</kbd> picks it.
  - In a TTY, one keypress answers: `y`, `Y`, `у`, `У` for yes; `n`, `N`, `н`, `Н` for no; <kbd>Ctrl</kbd>+<kbd>C</kbd> exits with code 1.
  - With no TTY, it reads a line, in any case: `y`, `yes`, `у` for yes; `n`, `no`, `н` for no; any other line asks again.
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
