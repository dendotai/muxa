# Muxa Specification

## Overview

Muxa makes running multiple processes in monorepos delightfully simple. It's built for developers who love `concurrently`'s simplicity but need more - workspace awareness, preserved interactivity, and cleaner syntax.

**Problem**: `concurrently` loses interactive features (Expo QR codes, Vite shortcuts) and has output formatting issues. `mprocs` preserves interactivity but requires verbose CLI syntax or config files. Neither tool understands monorepo workspaces.

**Solution**: Muxa combines the best ideas:

- **Cleaner than concurrently**: `muxa -s frontend dev` vs `concurrently "cd packages/frontend && npm run dev"`
- **Monorepo-native**: Understands your workspace structure, auto-detects npm/yarn/pnpm/bun
- **Fully interactive**: Built on mprocs to preserve all terminal features
- **Zero friction**: No config files, no setup, sensible defaults

## Success Criteria

1. **Simple commands work like concurrently**:

   ```bash
   muxa 'npm run dev' 'npm test'
   ```

2. **Clean workspace commands**:

   ```bash
   # Instead of: muxa 'sh -c "cd packages/backend && npm run dev"'
   muxa -s backend dev
   ```

3. **Preserved interactive features**: Expo QR codes, Vite shortcuts work

4. **No config files needed** - all features available via CLI arguments (muxa may create temporary mprocs config internally)

5. **Clear errors** with helpful suggestions

## Command Syntax

> [!NOTE]  
> **Argument Parsing**: The multi-argument flag pattern (e.g., `-s backend dev api`) is uncommon in CLIs, but provides the cleanest syntax for our use case. Alternative approaches like colon-delimited strings would be ugly with complex commands (e.g., `-w "mobile:npx expo start --tunnel:expo"`). This "2D array" pattern requires custom parsing, which is why we implement our own parser instead of using commander or similar frameworks. Additionally, this design reduces the need for nested quotes, making commands cleaner and easier to type in the terminal.

#### 2D Array Structure

**-c flag (commands)**:

```bash
muxa -c 'npm run dev' api -c 'npm test' test
```

| Flag | Command | Tab name (optional) |
|------|---------|-----------------|
| -c | 'npm run dev' | api |
| -c | 'npm test' | test |

**-s flag (scripts)**:

```bash
muxa -s backend dev api -s frontend start web -s . build
```

| Flag | Package | Script | Tab name (optional) |
|------|---------|--------|-----------------|
| -s | backend | dev | api |
| -s | frontend | start | web |
| -s | . | build | |

**-w flag (workspace commands)**:

```bash
muxa -w mobile 'npx expo start' expo -w backend 'cargo run'
```

| Flag | Package | Command | Tab name (optional) |
|------|---------|---------|-----------------|
| -w | mobile | 'npx expo start' | expo |
| -w | backend | 'cargo run' | |

**Mixed usage**:

```bash
muxa -s backend dev api -w mobile 'npx expo start' expo -c 'docker-compose up' db
```

| Flag | Package | Script/Command | Tab name (optional) |
|------|-------|-------|------------------|
| -s | backend | dev | api |
| -w | mobile | 'npx expo start' | expo |
| -c | | 'docker-compose up' | db |

### Basic Usage

```bash
# Unnamed mode - commands become tab names
muxa 'npm run dev' 'npm test'

# Named mode with -c (arbitrary commands)
muxa -c 'npm run dev' api -c 'npm test' test

# Script mode with -s (workspace scripts)
muxa -s . dev api -s backend test    # '.' = root "workspace"

# Workspace commands with -w
muxa -w mobile 'npx expo start' -w backend 'cargo run'

```

### Parsing Rules

1. Cannot mix unnamed mode with flags (-c, -s, -w) because it's ambiguous
2. Optional names follow commands/scripts
3. Commands can contain spaces and shell operators

### Default Tab Names

When no custom name is provided:

| Mode/Flag | Command Example | Default Tab Name |
|-----------|----------------|------------------|
| Unnamed | `muxa 'npm run dev' 'npm test'` | `npm run dev`, `npm test` |
| -c | `muxa -c 'npm run dev'` | `npm run dev` |
| -s | `muxa -s backend dev` | `backend:dev` |
| -s (root) | `muxa -s . build` | `.:build` |
| -w | `muxa -w mobile 'npx expo start'` | `mobile` |

> [!NOTE]  
> These defaults are chosen to reduce confusion and optimize tab length. If you're unhappy with the automatic names, simply provide your own custom ones. There was *some* thought put into the default names.

## Command Flags

> [!IMPORTANT]  
> The `-c`, `-s`, and `-w` flags use an uncommon multi-argument pattern. Each flag consumes multiple space-separated arguments, not just the immediately following one. For example, in `muxa -w mobile 'npx expo start'`, both `mobile` AND `'npx expo start'` are arguments to the `-w` flag, not separate commands.

### -c: arbitrary Commands

Runs arbitrary commands without workspace context:

```bash
muxa -c <command> [name]                          # Both arguments belong to -c

muxa -c 'npm run dev'                             # Run command as-is
muxa -c 'npm run dev' api                         # With custom display name
muxa -c 'echo "Starting..." && npm start' server  # Complex commands
muxa -c 'FORCE_COLOR=1 npm test' test             # With env vars
```

Use -c when you need to:

- Run commands from the current directory
- Execute one-off commands or scripts
- Run commands that don't belong to a specific workspace

### -s: Scripts in workspace

Runs package.json scripts from workspace packages:

```bash
muxa -s <package> <script> [name]   # All three arguments belong to -s

muxa -s backend dev                 # Run 'dev' from backend workspace
muxa -s . dev                       # Run 'dev' from root package.json
muxa -s @myapp/backend dev          # Use exact package name
muxa -s ./packages/backend dev      # Use relative path
muxa -s backend dev api             # With custom display name
```

### -w: commands in Workspace

Runs arbitrary commands in workspace context:

```bash
muxa -w <package> <command> [name]            # All three arguments belong to -w

muxa -w mobile 'npx expo start'
muxa -w backend 'npx prisma studio'
muxa -w rust-pkg 'cargo test -- --nocapture'
muxa -w backend 'npm test' test-api           # With custom display name
```

### Mixed Usage Examples

Combining different flags in real scenarios:

```bash
# Backend API + Frontend + Database
muxa -s backend dev api \
     -s frontend start web \
     -c 'docker-compose up db' database

# Mobile app development with services
muxa -w mobile 'npx expo start' expo \
     -s backend dev api \
     -c 'ngrok http 3000' tunnel

# Full stack with build tools
muxa -s . dev root \
     -w packages/cli 'npm link && npm run watch' cli \
     -c 'npm run test:watch' tests \
     -s shared build libs
```

### Workspace Resolution

1. Exact package.json name: `@myapp/backend`
2. Relative path: `packages/backend` or `./packages/backend`
3. Directory name: `backend` (if unambiguous)

Directories without package.json are not treated as workspaces, matching standard package manager behavior.

Supports npm/yarn/bun workspace configurations:

```json
{ "workspaces": ["packages/*", "apps/*"] }
{ "workspaces": { "packages": ["packages/*", "apps/*"] } }
```

Also supports pnpm workspace configuration (`pnpm-workspace.yaml`):

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
  - '!**/test/**'
```

## Package Manager Detection

Muxa automatically detects your package manager to ensure correct script execution.

### Detection Priority

1. **Lockfile presence** in workspace root:
   - `bun.lockb` → bun
   - `yarn.lock` → yarn  
   - `pnpm-lock.yaml` → pnpm
   - `package-lock.json` → npm
2. **packageManager field** in root package.json (e.g., "pnpm@8.0.0")
3. **Default** to npm if no indicators found

### How It Works

- Detection happens once at startup from monorepo root
- Cache result for entire execution
- Package manager binary must be available in PATH
- If detected package manager not in PATH, fall back to npm with warning
- Show detected manager in debug output (when MUXA_DEBUG=1)

### Script Execution Format

The detected manager is used for executing scripts with the `-s` flag:

- npm: `npm run <script>`
- yarn: `yarn run <script>` (not just `yarn <script>` for consistency)
- pnpm: `pnpm run <script>`
- bun: `bun run <script>`

### Examples

```bash
# With yarn.lock present
muxa -s frontend dev  # → executes: yarn run dev

# With pnpm-lock.yaml present  
muxa -s frontend dev  # → executes: pnpm run dev

# With bun.lockb present
muxa -s frontend dev  # → executes: bun run dev

# With package-lock.json (or no lockfile)
muxa -s frontend dev  # → executes: npm run dev

# Override detection with direct commands
muxa -c 'npm run dev'     # Always uses npm
muxa -c 'yarn dev'        # Always uses yarn
muxa -c 'bun run build'   # Always uses bun
```

## Environment and TTY Handling

### Environment Variables

- All commands inherit parent process environment
- FORCE_COLOR=1 set by default (preserves colored output)
- NODE_ENV preserved from parent
- Custom env vars can be set inline: `NODE_ENV=test muxa -s api test`

### TTY and Interactivity

- Each process gets its own pseudo-TTY via mprocs
- Preserves interactive features (Expo QR codes, Vite shortcuts)
- Stdin is not multiplexed - keyboard input goes to focused tab

## Process Lifecycle Management

### Process Management

- **Startup**: All processes start in parallel
  - mprocs launches all processes simultaneously, not one-by-one
  - No dependency management or startup order control
  - If you need sequential startup, use shell operators: `muxa -c 'sleep 2 && npm start'`
  - All processes start regardless of whether others succeed or fail
- **Signals**: SIGINT/SIGTERM forwarded to all child processes
- **Exit behavior**: When a process exits, it shows as dead in the UI while others continue running
  - This allows users to see error output and diagnose why the process stopped
  - Other processes remain unaffected, preserving your development workflow
- **No kill-all feature**: muxa does not terminate other processes when one exits
- **Exit codes**:
  - 0 if all processes exit cleanly when muxa is terminated
  - First non-zero exit code otherwise

### Signal Handling

- **Ctrl+C in mprocs**: Sends signal to the focused process only (keyboard input goes to focused tab)
- **Exiting muxa**: Use mprocs keybindings (default: q) to quit and terminate all processes
- **Shutdown**: When exiting, mprocs attempts graceful shutdown of all child processes

### Log Output

Log file output works naturally using standard shell techniques:

```bash
# Redirect output to file
muxa -c 'npm run dev > dev.log 2>&1'

# Use tee to see output and save to file
muxa -c 'npm run dev 2>&1 | tee dev.log'
```

No special log handling needed - muxa passes commands through to the shell.

## Workspace Script Details

### Script Resolution (-s flag)

- Reads scripts from target's package.json
- Does NOT run pre/post scripts automatically
- Supports nested script calls (scripts calling other scripts)
- Error shows available scripts: "Script 'dev' not found. Available: build, test, lint"
- Script arguments not supported with -s flag (use -c or -w for commands with arguments)
- Detects and prevents nested muxa execution (exits with error if MUXA_RUNNING env var is set)

## Installation and Requirements

### Prerequisites

- **For npm/yarn/pnpm**: Node.js >= 16.0.0
- **For bun**: Bun >= 1.0.0 (no Node.js required)
- mprocs binary (auto-installed as npm dependency)

### Install

| Package Manager | Global Install | Local Dev Install* |
|---|---|---|
| npm | `npm install -g @den-ai/muxa` | `npm install -D @den-ai/muxa` |
| yarn | `yarn global add @den-ai/muxa` | `yarn add -D @den-ai/muxa` |
| pnpm | `pnpm add -g @den-ai/muxa` | `pnpm add -D @den-ai/muxa` |
| bun | `bun add -g @den-ai/muxa` | `bun add -d @den-ai/muxa` |

*Recommended: Install as devDependency to ensure consistent versions across team members

**Direct usage** (no install needed):

```bash
npx @den-ai/muxa -s frontend dev -s backend dev
bunx @den-ai/muxa -s frontend dev -s backend dev
```

## Cross-Platform Support

### Platform Support

- **macOS/Linux**: Full support
- **Windows**: Requires WSL or Git Bash (due to sh -c usage)
- **Shell**: Always uses `sh` for consistency, not user's shell (see ROADMAP.md for future user shell support)
- **Path handling**: Converts Windows paths when needed

## Resource Requirements

### Memory and CPU Usage

- **Minimal overhead**: muxa spawns mprocs as a child process (following mprocs' npm wrapper pattern)
- **Memory**: Small runtime overhead for muxa + mprocs (Rust binary), plus memory for each child process
- **CPU**: Near-zero CPU usage - muxa only does argument parsing; mprocs efficiently handles terminal multiplexing
- **Scalability**: Can handle many processes thanks to mprocs being written in Rust
- **No polling**: mprocs uses event-driven I/O for terminal handling

The resource usage is primarily determined by your child processes, not by the muxa/mprocs infrastructure.

## Working Directory

### Workspace Detection

- **From monorepo root**: Full functionality - can reference any workspace package with -s and -w
- **From any directory**: Can use -c for arbitrary commands and -s . for current directory scripts
- **No upward traversal**: Workspace configuration only detected in current directory
- **Non-monorepo projects**: Fully functional with -c and -s . flags

## Implementation

### Command Transformation

```bash
# Input (with yarn.lock detected)
muxa -s backend dev api -w mobile 'npx expo start'

# Transforms to
mprocs --names api,mobile \
  'sh -c "cd /path/to/backend && yarn run dev"' \
  'sh -c "cd /path/to/mobile && npx expo start"'

# Input (with pnpm-lock.yaml detected)
muxa -s backend dev api -s frontend start

# Transforms to
mprocs --names api,frontend \
  'sh -c "cd /path/to/backend && pnpm run dev"' \
  'sh -c "cd /path/to/frontend && pnpm run start"'
```

### Shell Wrapping

When muxa passes commands to mprocs, it decides whether to wrap them with `sh -c`. This is needed because mprocs executes commands directly, but certain features require a shell.

**Commands wrapped with `sh -c` when:**

1. **Using -s or -w** (needs cd to change directory):

   ```bash
   muxa -s backend dev
   # Becomes: mprocs 'sh -c "cd /path/to/backend && npm run dev"'
   
   # Why sh -c? Try this yourself to see why:
   # $ mprocs 'cd /tmp && echo hello'
   # Error: No such file or directory (os error 2)
   # 
   # mprocs tries to execute 'cd' as a program, but cd is a shell builtin!
   
   muxa -w mobile 'npx expo start'
   # Becomes: mprocs 'sh -c "cd /path/to/mobile && npx expo start"'
   ```

2. **Contains shell operators** (`&&`, `||`, `|`, `;`, `>`, `<`):

   ```bash
   muxa -c 'npm test && npm build'
   # Becomes: mprocs 'sh -c "npm test && npm build"'
   
   muxa -c 'npm run dev | grep error'
   # Becomes: mprocs 'sh -c "npm run dev | grep error"'
   ```

3. **Contains glob patterns** (`*`, `?`, `[...]`):

   ```bash
   muxa -c 'rm dist/*.js'
   # Becomes: mprocs 'sh -c "rm dist/*.js"'
   
   muxa -c 'cat logs/2024-*.log'
   # Becomes: mprocs 'sh -c "cat logs/2024-*.log"'
   ```

4. **Contains environment variables** (`$VAR`):

   ```bash
   muxa -c 'echo $HOME'
   # Becomes: mprocs 'sh -c "echo $HOME"'
   
   muxa -c 'NODE_ENV=$ENV npm start'
   # Becomes: mprocs 'sh -c "NODE_ENV=$ENV npm start"'
   ```

**Not wrapped** (simple commands execute directly for better performance):

```bash
muxa -c 'npm test'
# Becomes: mprocs 'npm test'

muxa -c 'node server.js'
# Becomes: mprocs 'node server.js'
```

### Flag Mapping

- Named commands automatically generate `--names` for mprocs

> [!NOTE]  
> Some mprocs features like tab width are only configurable via config file, not CLI flags. Muxa focuses on CLI-only usage, so these features are not exposed.

**Temporary Config Strategy** (if needed for future features):

1. Create config in system temp directory (e.g., `/tmp/.muxa.mprocs.tmp.yaml`)
2. If temp creation fails, fallback to `.muxa.mprocs.tmp.yaml` in current directory
3. Delete immediately after mprocs starts (it reads config once at startup)
4. For fallback file, ensure cleanup on exit (SIGINT/SIGTERM)
5. Don't worry about SIGKILL scenarios - leftover `.muxa.mprocs.tmp.yaml` is clearly temporary

## Error Handling

```text
# Package not found
Error: Package 'backend' not found in workspace
Available: @myapp/api, @myapp/frontend, shared

# Ambiguous package
Error: Ambiguous identifier 'backend'
Matches: @myapp/backend (packages/backend), @tools/backend (tools/backend)

# Invalid syntax
Error: Cannot mix unnamed and named arguments
```

## Implementation Notes

**Dependencies**: `mprocs` only (no CLI framework needed)

## Configuration Files

**User configuration**: Not currently supported. All options must be provided via CLI arguments.

**Internal usage**: Muxa may create temporary mprocs config files when needed for features not available via mprocs CLI flags (see "Temporary Config Strategy" above).

**Future**: See ROADMAP.md for potential user-facing config file support.

## Debugging and Troubleshooting

### Debug Mode

```bash
MUXA_DEBUG=1 muxa -s backend dev

# Shows: workspace resolution, command transformation, mprocs args
```

### Common Issues

- **"Package not found"**: Check you're in monorepo root
- **"Script not found"**: Use -c instead of -s for arbitrary commands
- **No colors**: mprocs or terminal might not support colors

## Migration from Concurrently

### Quick Migration Guide

Most concurrently commands can be converted to muxa with simple patterns:

| Concurrently | Muxa | Notes |
|--------------|------|-------|
| `concurrently 'npm run dev' 'npm test'` | `muxa 'npm run dev' 'npm test'` | Direct replacement - same syntax! |
| `concurrently -n "web,api" "npm run web" "npm run api"` | `muxa -c 'npm run web' web -c 'npm run api' api` | Named commands |
| `concurrently "cd apps/web && npm start" "cd apps/api && npm start"` | `muxa -w apps/web 'npm start' -w apps/api 'npm start'` | Workspace commands |
| `concurrently "npm:dev:*"` | `muxa -c 'npm run dev:web' -c 'npm run dev:api'` | Expand wildcards manually |
| `concurrently --kill-others "npm start" "npm test"` | Not needed - muxa doesn't kill other processes | Different philosophy |

### Automated Migration

Try muxa without installing to see how it could simplify your scripts:

```bash
# Just check what could be simplified (no changes)
npx @den-ai/muxa check
npx @den-ai/muxa migrate --dry-run  # same as check

# Interactive migration (shows changes, then asks)
npx @den-ai/muxa migrate

# Skip confirmation and apply changes
npx @den-ai/muxa migrate --yes
```

**Command behavior**:

- `check` or `migrate --dry-run`: Shows potential simplifications, exits
- `migrate`: Shows potential simplifications, asks "Apply changes? (y/N)"
- `migrate --yes`: Applies changes without asking

**Example session**:

```sh
$ npx @den-ai/muxa migrate

Analyzing package.json...

Found 3 scripts that could be simplified:

"dev": "concurrently 'cd packages/frontend && npm run dev' 'cd packages/backend && npm run dev'"
     → "muxa -s frontend dev -s backend dev"
     
"test": "npm-run-all --parallel test:*"
      → "muxa -c 'npm run test:unit' -c 'npm run test:e2e'"

"start": "concurrently -n 'WEB,API' 'npm run web' 'npm run api'"  
       → "muxa -c 'npm run web' WEB -c 'npm run api' API"

Apply changes to package.json? (y/N): y
✅ Updated package.json
```

**Migration patterns**:

- `concurrently` → Converts if it simplifies the command
- `npm-run-all --parallel` → Converts only if pattern is clear
- `cd X && cmd` → Converts to `-w X 'cmd'` when workspace exists
- **NOT converted**:
  - `run-s` / sequential commands → Stay as-is (muxa is for parallel execution)
  - Commands with fail-fast behavior (`--kill-others`, `--bail`) → Not supported (see ROADMAP.md)
  - Commands that would become longer with muxa
  - Complex shell scripts or pipes

**Examples of what NOT to convert**:

```bash
# Sequential execution - keep as-is
"build": "run-s clean compile package"
# Reason: Sequential execution (muxa is for parallel)
# Could convert to: "npm run clean && npm run compile && npm run package"
# But that's not muxa's job

# Test orchestration - keep as-is  
"test:all": "npm-run-all test:* --bail"
# Reason: Tests often need sequential execution or bail-on-failure

# Complex patterns - keep as-is
"dev": "concurrently --restart-tries 3 --restart-after 1000 'npm:watch:*'"
# Reason: No muxa equivalent for restart options

# Would be longer - keep as-is
"simple": "concurrently 'npm:a' 'npm:b'"
# Reason: muxa version would be longer
```

### Key Differences

- **Basic syntax**: Often identical! Just replace `concurrently` with `muxa`
- **Named commands**: Use `-c` with name after command instead of `-n` flag
- **Workspaces**: Use `-s` or `-w` for cleaner monorepo commands
- **No --kill-others**: Muxa keeps processes independent by design

## Why muxa?

### Feature Comparison

| Feature | muxa | concurrently | mprocs (raw) |
|---------|------|--------------|--------------|
| Simple CLI | ✅ | ✅ | ❌ |
| Preserves interactivity | ✅ | ❌ | ✅ |
| Workspace-aware | ✅ | ❌ | ❌ |
| No config needed | ✅ | ✅ | ❌ |
| Multiplexed output | ✅ | ❌ | ✅ |
| Package manager agnostic* | ✅ | ⚠️ | N/A |

*muxa auto-detects npm/yarn/pnpm/bun; concurrently requires hardcoding the command

### Command Comparison

**Task: Run frontend, backend, and mobile dev servers in a monorepo**

```text
project/
├── apps/
│   ├── web/          # Next.js app
│   ├── mobile/       # Expo app
│   └── api/          # Express API
└── package.json      # Workspaces config
```

❌ **Using concurrently in package.json:**

```json
{
  "scripts": {
    "dev": "concurrently 'cd apps/web && npm run dev' 'cd apps/mobile && npx expo start' 'cd apps/api && npm run dev'"
  }
}
```

Problems:

- Verbose and may be repetitive
- Loses interactivity (no Expo QR codes, no Vite shortcuts)  
- Mixed output is hard to read

❌ **Using npm-run-all or similar:**

```json
{
  "scripts": {
    "dev": "npm-run-all --parallel dev:*",
    "dev:web": "cd apps/web && npm run dev",
    "dev:mobile": "cd apps/mobile && npx expo start", 
    "dev:api": "cd apps/api && npm run dev"
  }
}
```

Problems:

- Need multiple script entries
- Still loses interactivity
- Another dependency to install

❌ **Using concurrently with workspace helpers:**

```json
{
  "scripts": {
    "backend": "yarn workspace @monorepo/express-backend",
    "frontend": "yarn workspace @monorepo/react-frontend",
    "dev": "concurrently --names 'backend,frontend' 'yarn backend dev' 'yarn frontend dev'"
  }
}
```

Problems:

- Often leads to creating helper scripts
- Still verbose even with helpers
- Loses interactivity

✅ **Using muxa:**

```json
{
  "scripts": {
    "dev": "muxa -s web dev -w mobile 'expo start' -s api dev"
  }
}
```

Benefits:

- Clean, readable script
- Full interactivity preserved
- Single dependency that actually works

## Real-World Examples

### Full-Stack Development

```bash
# Next.js frontend + Express API + PostgreSQL
muxa -s frontend dev \
     -s backend dev \
     -c "docker-compose up -d postgres" db
```

### Mobile Development

```bash
# Expo app + GraphQL API + Redis for caching
muxa -w apps/mobile "expo start" \
     -s api dev \
     -c "redis-server" cache
```

### Microservices

```bash
# Multiple Node.js services
muxa -s auth dev \
     -s gateway dev \
     -s notifications dev \
     -c "docker-compose up -d kafka postgres redis" infra
```

### Monorepo Build Pipeline

```bash
# Watch and rebuild shared packages
muxa -s shared "build:watch" \
     -s ui-components "build:watch" \
     -s frontend dev \
     -s backend dev
```

## Edge Cases

### Circular Dependencies

Circular dependencies between workspaces do not affect muxa since it only orchestrates process execution, not dependency resolution.

### Command Length Limits

System shells have argument length limits (typically 256KB on macOS, 2MB on Linux). However, muxa's concise syntax means you're less likely to hit these limits compared to alternatives:

```bash
# Longer with concurrently
concurrently "cd packages/frontend && npm run dev" "cd packages/backend && npm run dev"

# Shorter with muxa  
muxa -s frontend dev -s backend dev
```

### Tab Names

Custom tab names cannot contain commas. If a comma is detected in a custom name, muxa will error with:

```sh
Error: Tab name 'web,mobile' contains comma. Commas are reserved as separators.
```

Duplicate names trigger a warning with confirmation:

```sh
Warning: Duplicate tab name 'api' detected.
Continue with duplicate names? (y/N): 
```

- Pressing 'y' continues (mprocs will show multiple tabs with same name)
- Pressing 'n' or Enter exits so user can fix the command

## Testing Requirements

Tests should include fixture directories/dummy monorepos for:

- **Package managers**: bun, pnpm, npm, yarn
- **Package manager detection**:
  - Each lockfile type (bun.lockb, yarn.lock, pnpm-lock.yaml, package-lock.json)
  - packageManager field parsing
  - Missing package manager binary handling
  - Correct script execution commands (npm run, yarn run, etc.)
- **Edge cases**:
  - Ambiguous names
  - Scoped packages  
  - Single dir
