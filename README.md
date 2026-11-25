# muxa

Run your entire dev stack in multiple virtual terminals with one concise command instead of long config files. Built-in monorepo support, preserved interactivity, and clean output.

```text
                                                ┌───────┬────────────────────────────────────┐
  ███╗   ███╗  ██╗   ██╗  ██╗  ██╗   █████╗     │  api  │ VITE v5.4.19  ready in 691 ms      │
  ████╗ ████║  ██║   ██║  ╚██╗██╔╝  ██╔══██╗    ├───────┤                                    │
  ██╔████╔██║  ██║   ██║   ╚███╔╝   ███████║    │ [web] │ ➜  Local:   http://localhost:5173/ │
  ██║╚██╔╝██║  ██║   ██║   ██╔██╗   ██╔══██║    ├───────┤ ➜  Network: use --host to expose   │
  ██║ ╚═╝ ██║  ╚██████╔╝  ██╔╝ ██╗  ██║  ██║    │  db   │ ➜  press h + enter to show help    │
  ╚═╝     ╚═╝   ╚═════╝   ╚═╝  ╚═╝  ╚═╝  ╚═╝    └───────┴────────────────────────────────────┘
```

```bash
# Before:
concurrently -n "api,web,db" "npm run dev --workspace=api" "npm run dev --workspace=web" "docker-compose up postgres"

# After:
muxa -s api dev -s web dev -c "docker-compose up postgres" db
```

### Command Breakdown

```text
muxa -s api dev -s web dev -c "docker-compose up postgres" db
     ── ─── ─── ────────── ── ──────────────────────────── ──
     │  │   │   │          │  │                            │
     │  │   │   │          │  │                            └── tab name (optional)
     │  │   │   │          │  └── command to run
     │  │   │   │          └── flag: run a command
     │  │   │   └── the same three parts, for the web package
     │  │   └── script in its package.json
     │  └── package
     └── flag: run a package's script
```

| Process                              | Tab name  | Why                                      | The `concurrently` part         |
| ------------------------------------ | --------- | ---------------------------------------- | ------------------------------- |
| `-s api dev`                         | `api:dev` | the package's folder name and the script | `"npm run dev --workspace=api"` |
| `-s web dev`                         | `web:dev` | the package's folder name and the script | `"npm run dev --workspace=web"` |
| `-c "docker-compose up postgres" db` | `db`      | the name after the command               | `"docker-compose up postgres"`  |

A name after the script (`-s api dev backend`) replaces the default one, and `-c` without a name uses the command. In `concurrently`, the names are a list of their own (`-n "api,web,db"`).

## Why muxa?

When developing in a monorepo with multiple services, you need to run multiple processes simultaneously. While `concurrently` provides a simple CLI interface, it has output formatting issues and loses interactive features. `mprocs` handles output better but requires complex shell syntax or configuration files.

`muxa` combines the best of both worlds:

- Simple CLI interface like concurrently
- Superior output handling from dekit, the next version of mprocs
- Built-in workspace support for monorepos
- Preserves rich interactive features (Expo QR codes, Vite shortcuts, etc.)
- No configuration files required

## Installation

```sh
# bun
bun add -g @den-ai/muxa

# pnpm
pnpm add -g @den-ai/muxa

# npm
npm install -g @den-ai/muxa

# yarn 1
yarn global add @den-ai/muxa
```

## Usage

### Basic Usage

Run multiple commands in parallel:

```sh
# Basic mode - direct commands
muxa 'npm run dev' 'npm run test:watch'

# Advanced mode with -c flags
muxa -c 'npm run dev' -c 'npm run test:watch'

# With custom tab names
muxa -c 'npm run dev' api -c 'npm run test:watch' tests

# Tab names are optional
muxa -c 'npm run dev' api -c 'npm run test'
muxa -c 'npm run dev' -c 'npm run test' tests
```

### Workspace Script Support

Run package.json scripts from specific workspace packages without complex shell syntax:

```sh
# Run scripts in specific packages
muxa -s backend dev -s frontend start

# With custom names
muxa -s backend dev api -s frontend start web

# Using different package identifiers
muxa -s @myapp/backend dev        # by package.json name
muxa -s packages/backend dev      # by relative path
muxa -s backend dev               # by folder name (if unique)
muxa -s . dev                     # the folder you run muxa from

# Mix with regular commands
muxa -s backend dev -c 'echo "Starting servers..."'
```

### Run Commands in Workspace Directories

```sh
# Run arbitrary commands in workspace directories
muxa -w backend 'npm run dev' dev
muxa -w mobile 'npx expo start' expo
```

### Complex Commands

```sh
# Commands with shell operators
muxa -c 'npm run build && npm test' -c 'echo "Done" || exit 1'
```

## Command Line Options

- `-c, --command <command> [name]` - Run any command in the folder you run muxa from
- `-s, --script <package> <script> [name]` - Run a package's `package.json` script
- `-w, --workspace <package> <command> [name]` - Run any command in a package's folder
- `-h, --help` - Display help
- `-V, --version` - Display version
- `workspaces`, `ws` - List the packages muxa finds
- `logs <process>` - Print a process's output since the last start

`--help` and `--version` work only as the first argument. `-s` takes no script arguments; use `-w backend 'npm run test -- --watch'` for those.

Without a name in the command, the tab name is the command (`-c` and basic mode), the package's folder and the script (`-s`: `backend:dev`, or `.:dev` for `.`), or the package's folder (`-w`). A name holds no comma and does not start with `-`. When two processes have one name, given in the command or taken from a package, muxa asks before it starts them.

## Keys

| Key                                 | Effect                                                          |
| ----------------------------------- | --------------------------------------------------------------- |
| `j`, `k`, `Down`, `Up`, or a click  | Select a process                                                |
| `Ctrl+A`                            | Switch between the process list and the output, to type into it |
| `Ctrl+C`                            | Send `Ctrl+C` to the selected process                           |
| `s` `x` `r`                         | Start, stop, restart the selected process                       |
| `Page Up`, `Page Down`, mouse wheel | Scroll the output                                               |
| `z`                                 | Show only the output; `Ctrl+A` goes back                        |
| `v`                                 | Copy mode                                                       |
| `p`                                 | All commands                                                    |
| `q`, then `x`                       | Quit: stop every process and exit                               |

Every other process keeps running when one exits, and muxa stays open until you quit.

## Settings

Optional. Add a `muxa` key to the `package.json` in the folder you run muxa from:

```json
{
  "muxa": {
    "mouseScrollSpeed": 1,
    "processListTitle": "Dev",
    "logs": {
      "maxSizePerProcess": "100MB",
      "maxSizeTotal": "500MB"
    }
  }
}
```

- `mouseScrollSpeed` - Lines to scroll per mouse or touchpad scroll event, a whole number of 1 or more. dekit scrolls 5 by default.
- `processListTitle` - Heading above the process list, a non-empty string. By default, the `name` in that `package.json`, or the folder name.
- `logs.maxSizePerProcess`, `logs.maxSizeTotal` - Size limits for the log files, as a number with `KB`, `MB`, or `GB`. The values above are the defaults in a project.

In a folder with no `package.json`, muxa reads the same keys from `~/.config/muxa/settings.json`. There, the default limits are `50MB` and, for all such folders together, `200MB`.

## Environment Variables

- `FORCE_COLOR` - muxa sets it to `1` for every process, unless you set a value
- `MUXA_RUNNING` - muxa sets it to `1` for every process, and starts no process when it is set, so a script that muxa runs cannot start muxa
- `MUXA_DEBUG=1` - Print what muxa detected and the dekit command
- `MUXA_TEST_MODE=true` - Print the dekit command, and start nothing

## Exit Codes

- `0` - You quit muxa, even when a process failed, or a signal stopped it
- `1` - muxa stopped before it started any process: a bad argument, an unknown package or script, a Settings error, a bad tab name, a rejected duplicate name, muxa inside muxa, no terminal, or no dekit binary for the platform. Also `logs` with no log file for the process

## Important Usage Notes

### Argument Modes

`muxa` supports two modes that cannot be mixed:

1. **Basic mode** - Commands as direct arguments (no flags):

   ```sh
   muxa 'npm run dev' 'npm run test'
   ```

2. **Advanced mode** - Using flags (`-c`, `-s`, `-w`) for more control:

   ```sh
   muxa -c 'npm run dev' -c 'npm run test'
   ```

> [!IMPORTANT]  
> You cannot mix these modes.

```sh
# ❌ This will error
muxa 'npm run dev' -c 'npm run test'

# ✅ Use one mode consistently
muxa 'npm run dev' 'npm run test'
# OR
muxa -c 'npm run dev' -c 'npm run test'
```

### Workspace Resolution

`-s` and `-w` take a package by any of these:

- The `name` in its `package.json` (`@myapp/backend`)
- Its relative path (`packages/backend`, `./packages/backend`)
- Its folder name (`backend`), when only one package has it

If several packages have the folder name, muxa shows them all:

```text
Error: Ambiguous package identifier 'backend'
Found multiple matches:
  - @myapp/backend (packages/backend)
  - @tools/backend (tools/backend)
Please use the full package name or path.
```

muxa reads the workspaces (`package.json`, or `pnpm-workspace.yaml`) of the folder you run it from. It reads patterns such as `packages/*` and `tools/cli`, not `**` or `!`.

### Package Manager Detection

`-s` runs a script with the first match, in the folder you run muxa from:

1. A lockfile: `bun.lockb` (not `bun.lock` yet), `yarn.lock`, `pnpm-lock.yaml`, then `package-lock.json`
2. The `packageManager` field in `package.json`
3. npm

muxa uses npm when the detected package manager is not in your `PATH`.

### Shell Wrapping

muxa runs a command through `sh -c` when it contains:

- Shell operators and redirections (`&`, `|`, `;`, `>`, `<`)
- Glob patterns (`*`, `?`, `[`, `]`) or text in braces (`{a,b}`)
- Variables (`$VAR`, `${VAR}`)
- Subshells and command substitution (`(...)`, `$(...)`, `` `...` ``)
- A `~` at the start of a word or after `:`
- A backslash or a quote

Commands from `-s` and `-w` always run through `sh -c`, because muxa puts a `cd` to the package in front of them.

## Examples

### Monorepo Development

```sh
# Run backend API and frontend dev servers
muxa -s apps/api dev -s apps/web dev

# Run with custom names for cleaner output
muxa -s apps/api dev backend -s apps/web dev frontend

# Include a database setup command
muxa -c 'docker-compose up' db -s apps/api dev api
```

### Testing Workflow

```sh
# Run tests in watch mode alongside development
muxa -s backend dev -s backend test:watch tests

# Run tests in different workspaces
muxa -s backend test -s frontend test
```

### Build Pipeline

```sh
# Build multiple packages in parallel
muxa -s shared build -s backend build -s frontend build

# With conditional execution
muxa -c 'npm run lint && npm run build' -c 'npm test || exit 1'
```

## Comparison with Alternatives

### vs concurrently

- Preserves interactive features (Expo QR codes, Vite shortcuts)
- Better output formatting
- Built-in workspace support
- Cleaner syntax for complex commands

### vs mprocs (direct usage)

- Simple CLI interface
- No configuration files needed
- Automatic shell wrapping
- Workspace-aware commands

### vs npm-run-all / yarn workspaces run

- Works with any package manager
- More flexible command composition
- Better terminal UI with dekit
- Mix workspace and non-workspace commands

## Requirements

- Node.js >= 22, or Bun through `bun run` or `bunx`
- macOS, Linux, or Windows through WSL
- dekit (automatically installed as dependency)

Full documentation, with muxa's limitations: [docs.den.ai/muxa](https://docs.den.ai/muxa).

## Contributing

Contributions are welcome! Please check out the [GitHub repository](https://github.com/dendotai/muxa).

## License

[MIT](./LICENSE)
