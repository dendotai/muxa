# 0003. `-c`, `-s`, and `-w` take positional arguments, read by muxa's own parser

**Status:** Accepted

## Context

A muxa command names several processes, each with up to three parts: a package, a script or command, and a tab name. Most CLIs give a flag one value, and a CLI framework (commander, yargs) parses only that shape. One value per flag forces the parts into one string with a delimiter (`-w "mobile:npx expo start --tunnel:expo"`), which breaks on commands that hold the delimiter and needs nested quotes.

## Decision

Each of `-c`, `-s`, and `-w` reads the arguments after it by position:

- `-c <command> [name]`
- `-s <package> <script> [name]`
- `-w <package> <command> [name]`

The optional name is the next argument when it does not start with `-`. Basic mode (`muxa 'npm run dev' 'npm test'`) takes commands alone, and a command line that mixes basic mode with a flag stops with `Cannot mix basic and advanced arguments`, because muxa cannot tell a command from a name there. muxa parses arguments itself, with no CLI framework.

## Consequences

- **Positive:** a process is one flag and its parts, with no delimiter and fewer nested quotes, and muxa has one runtime dependency, `@dekit/cli`.
- **Accepted trade-off:** a tab name cannot start with `-`. `-s` takes no script arguments, because the slot after the script is the name; a script with arguments goes through `-w` or `-c`.
- **Accepted trade-off:** the grammar is public syntax in users' scripts, so a change to an argument's position breaks those scripts.

## Rejected

- A delimiter inside one value (`-w "mobile:npx expo start:expo"`): it breaks on commands that hold the delimiter and needs nested quotes.
- A CLI framework (commander, yargs): a variadic option takes every value up to the next flag, with no fixed parts and no optional name.
