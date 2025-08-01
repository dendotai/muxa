# muxa

[![Latest Release](https://img.shields.io/github/v/release/dendotai/muxa?label=Release&color=green)](https://github.com/dendotai/muxa/releases)
[![Weekly Downloads on NPM](https://img.shields.io/npm/dw/@den-ai/muxa?label=Downloads&logo=npm)](https://www.npmjs.com/package/@den-ai/muxa)
[![CI Status](https://img.shields.io/github/actions/workflow/status/dendotai/muxa/ci.yml?label=CI&logo=github)](https://github.com/dendotai/muxa/blob/main/.github/workflows/ci.yml)
[![codecov](https://codecov.io/gh/dendotai/muxa/branch/main/graph/badge.svg)](https://codecov.io/gh/dendotai/muxa)

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

## Why muxa?

When developing in a monorepo with multiple services, you need to run multiple processes simultaneously. While `concurrently` provides a simple CLI interface, it has output formatting issues and loses interactive features. `mprocs` handles output better but requires complex shell syntax or configuration files.

`muxa` combines the best of both worlds:

- Simple CLI interface like concurrently
- Superior output handling from mprocs
- Built-in workspace support for monorepos
- Preserves rich interactive features (Expo QR codes, Vite shortcuts, etc.)
- No configuration files required

## Installation

```sh
# bun
bun install -g @den-ai/muxa

# pnpm
pnpm add -g @den-ai/muxa

# npm
npm install -g @den-ai/muxa

# yarn
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

# With custom process names
muxa -c 'npm run dev' api -c 'npm run test:watch' tests

# Process names are optional
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
muxa -s backend dev               # by directory name (if unique)

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

# Pass through mprocs options
muxa --hide-help -c 'npm run dev' -c 'npm run test'
```

## Command Line Options

- `-c, --command <command> [name]` - Run arbitrary command with optional name
- `-s, --script <package> <script> [name]` - Run package.json script from workspace
- `-w, --workspace <package> <command> [name]` - Run command in workspace directory
- `-h, --help` - Display help
- `--version` - Display version
- `workspaces` - List all detected workspace packages

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

When using `-s` or `-w`, `muxa` resolves packages in this order:

1. Exact package.json name match (`@myapp/backend`)
2. Relative path match (`packages/backend`, `./packages/backend`)
3. Directory name match (`backend` - only if unambiguous)

If a directory name matches multiple packages, you'll get an error with suggestions:

```text
Error: Ambiguous package identifier 'backend'
Found multiple matches:
  - @myapp/backend (packages/backend)
  - @tools/backend (tools/backend)
Please use the full package name or path.
```

### Shell Wrapping

Commands are automatically wrapped with `sh -c` when they contain:

- Shell operators (`&&`, `||`, `|`, `;`, `>`, `<`)
- Glob patterns (`*`, `?`, `[...]`)
- Environment variables (`$VAR`)

Workspace commands (`-s` and `-w`) are always wrapped to handle directory changes.

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
- Better terminal UI with mprocs
- Mix workspace and non-workspace commands

## Requirements

- Node.js >= 16.0.0
- mprocs (automatically installed as dependency)

## Contributing

Contributions are welcome! Please check out the [GitHub repository](https://github.com/dendotai/muxa).

## The Story

Built during the boot.dev hackathon! I had previously created a prototype version while exploring the idea, but threw it away and rebuilt everything from scratch during the hackathon to comply with the rules. Following a spec-driven development approach, the hackathon version ended up being much more powerful and feature-complete than the original prototype. No code reused from the initial version.

## License

MIT
