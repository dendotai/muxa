# Contributing to `muxa`

Thank you for your interest in contributing to `muxa`! This guide will help you get started with development and explain how to submit your contributions.

## Prerequisites

- Bun >= 1.0.0 (required package manager)
- Node.js >= 16.0.0 (for TypeScript tooling)

## Getting Started

```bash
# Clone the repository
git clone https://github.com/dendotai/muxa.git
cd muxa

# Install dependencies
bun install

# Run muxa from source (without building)
bun run muxa:local
```

## Project Structure

This is a monorepo with workspaces:

- `packages/muxa` - The main `muxa` package
- `apps/docs` - Documentation app

## Development Workflow

### Available Scripts

#### Testing

```bash
bun test                # Run all tests
```

#### Building

```bash
bun run build           # Build all packages
```

#### Code Quality

```bash
bun run check           # Run all checks (typecheck, lint, format)
bun run check:fix       # Fix all auto-fixable issues

# Individual checks:
bun run typecheck       # Check TypeScript types
bun run lint            # Run ESLint
bun run lint:fix        # Auto-fix ESLint issues
bun run format          # Check Prettier formatting
bun run format:fix      # Auto-fix formatting
```

#### Development

```bash
bun run muxa:local      # Run muxa directly from TypeScript source (no build needed)
                        # Use this when developing muxa itself to test changes instantly
```

## Making Changes

1. Create a feature branch from `main`
2. Make your changes
3. Write/update tests as needed
4. Run `bun run check` to ensure code quality
5. Fix issues that can be fixed automatically with `bun run check:fix`
6. Add tests for your changes
   - Write tests in the appropriate test directory under `packages/muxa/tests/`
   - Follow existing test patterns (unit tests in `tests/unit/`, integration tests in `tests/integration/`)
   - Ensure all tests pass with `bun test`
7. Update the changelog
   - Add your changes to the "Unreleased" section in `packages/muxa/CHANGELOG.md`
   - Follow the existing format (Added, Changed, Fixed, etc.)
   - Reference the Keep a Changelog format if needed
8. Commit your changes with a clear message
9. Push your branch and create a pull request

## Pre-Publish Checklist

If you're a maintainer preparing a release:

### 1. Ensure Clean State

```bash
# Clean install to ensure lockfile is up to date
rm -rf node_modules bun.lock
bun install
```

### 2. Run All Checks

```bash
# This runs typecheck, lint, and format
bun run check
```

### 3. Build and Test

```bash
# Build the project
# This ensures TypeScript compiles correctly and creates the dist/ folder
# The build step verifies that the package can be properly bundled for npm publishing
bun run build

# Run all tests
bun run test
```

### 4. Test CLI Locally

```bash
# Test the built version
cd packages/muxa
node dist/index.js --version

# Or test from source
bun run muxa:local --version
```

### 5. Release

```bash
# The release script handles everything:
# - Runs all checks (typecheck, lint, format, tests)
# - Shows a preview of changes
# - Updates versions in all package.json files
# - Creates git commit and tag
# - Provides next steps for publishing

bun run release:patch  # for bug fixes
bun run release:minor  # for new features
bun run release:major  # for breaking changes

# After confirmation, the script will:
# - Create the commit and tag
# - Push everything to GitHub
# - GitHub Actions will handle npm publishing and docs deployment
```

## Known Issues

1. **Interactive tests**: The interactive confirmation tests are currently skipped because they require proper TTY emulation. See TODO.md for more details.

## Code Style

- We use ESLint and Prettier for code formatting
- TypeScript for type safety
- Follow existing code patterns and conventions
- Keep commits focused and atomic

## Questions?

If you have questions or need help, feel free to:

- Open an issue for bugs or feature requests
- Start a discussion for general questions
- Check existing issues and PRs for similar topics
