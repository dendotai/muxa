# Muxa Specification

## Overview

Muxa is an npm package that wraps `mprocs` terminal multiplexer with a `concurrently`-like interface, solving monorepo development issues with running multiple processes.

**Problem**: `concurrently` loses interactive features (Expo QR codes, Vite shortcuts) and has output formatting issues. `mprocs` requires complex CLI syntax or config files.

**Solution**: Simple CLI that combines concurrently's ease-of-use with mprocs' superior output handling.

## Command Syntax

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

- **Unnamed mode**: Full command becomes the tab name
- **-c flag**: Command becomes the tab name (e.g., `npm run dev`)
- **-s flag**: `<package>:<script>` format (e.g., `backend:dev`)
- **-w flag**: `<package>` name (e.g., `mobile`)

**Note**: These defaults are chosen to reduce confusion and optimize tab length. If you're unhappy with the automatic names, simply provide your own custom names for better clarity.

## Command Flags

### -c Flag (Arbitrary Commands)

Runs arbitrary commands without workspace context:

```bash
muxa -c <command> [name]            # Required format

muxa -c 'npm run dev'               # Run command as-is
muxa -c 'npm run dev' api           # With custom display name
muxa -c 'echo "Starting..." && npm start' server  # Complex commands
muxa -c 'FORCE_COLOR=1 npm test' test  # With env vars
```

Use -c when you need to:

- Run commands from the current directory
- Execute one-off commands or scripts
- Run commands that don't belong to a specific workspace

### -s Flag (Scripts)

Runs package.json scripts from workspace packages:

```bash
muxa -s <package> <script> [name]   # Required format

muxa -s backend dev            # Run 'dev' from backend workspace
muxa -s . dev                  # Run 'dev' from root package.json
muxa -s @myapp/backend dev     # Use exact package name
muxa -s ./packages/backend dev # Use relative path
muxa -s backend dev api        # With custom display name
```

### -w Flag (Workspace Commands)

Runs arbitrary commands in workspace context:

```bash
muxa -w <package> <command> [name]  # Required format

muxa -w mobile 'npx expo start'
muxa -w backend 'npx prisma studio'
muxa -w rust-pkg 'cargo test -- --nocapture'
muxa -w backend 'npm test' test-api  # With custom display name
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

## Implementation

### Command Transformation

```bash
# Input
muxa -s backend dev api -w mobile 'npx expo start'

# Transforms to
mprocs --names api,mobile \
  'sh -c "cd /path/to/backend && npm run dev"' \
  'sh -c "cd /path/to/mobile && npx expo start"'
```

### Shell Wrapping

Commands wrapped with `sh -c` when:

- Using -s or -w (for cd)
- Contains operators: `&&`, `||`, `|`, `;`, `>`, `<`
- Contains globs: `*`, `?`, `[...]`
- Contains env vars: `$VAR`

### Flag Mapping

- `-k` → Kill all on first exit (custom implementation)
- `--hide-help` → Passed to mprocs
- Named commands automatically generate `--names` for mprocs

**Note**: Some mprocs features like tab width are only configurable via config file, not CLI flags. Muxa focuses on CLI-only usage, so these features are not exposed.

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

**Note on Argument Parsing**: The multi-argument flag pattern (e.g., `-s backend dev api`) is uncommon in CLIs, but provides the cleanest syntax for our use case. Alternative approaches like colon-delimited strings would be ugly with complex commands (e.g., `-w "mobile:npx expo start --tunnel:expo"`). This "2D array" pattern requires custom parsing, which is why we implement our own parser instead of using commander or similar frameworks.

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

4. **No config files needed** for basic usage

5. **Clear errors** with helpful suggestions

## Testing Requirements

Tests should include fixture directories/dummy monorepos for:
- **Package managers**: bun, pnpm, npm, yarn
- **Edge cases**: 
  - Ambiguous names
  - Scoped packages  
  - Single dir
