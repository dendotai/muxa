# Contributing to `muxa`

Thank you for your interest in contributing to `muxa`! This guide will help you get started with development and explain how to submit your contributions.

## Prerequisites

- Bun >= 1.0.0 (required package manager)
- Node.js >= 22 (for TypeScript tooling)

## Getting Started

```bash
# Clone the repository
git clone https://github.com/dendotai/muxa.git
cd muxa

# Install dependencies (this also turns on the git hooks in .githooks/)
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
bun run test            # Run all tests
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

1. Create a feature branch from `dev`
2. Make your changes
3. Write/update tests as needed
4. Run `bun run check` to ensure code quality
5. Fix issues that can be fixed automatically with `bun run check:fix`
6. Add tests for your changes
   - Write tests in the appropriate test directory under `packages/muxa/tests/`
   - Follow existing test patterns (unit tests in `tests/unit/`, integration tests in `tests/integration/`)
   - Ensure all tests pass with `bun run test`
7. Commit your changes with a conventional prefix (`feat:`, `fix:`, `docs:`, …): the prefixes set the next version, and commitlint checks each commit
8. Push your branch and create a pull request into `dev`

## Releasing

A merge from `dev` into `main` releases. [RELEASING.md](RELEASING.md) has the flow.

## Code Style

- We use ESLint and Prettier for code formatting
- TypeScript for type safety
- Follow existing code patterns and conventions
- Keep commits focused and atomic

## Questions?

If you have questions or need help, feel free to:

- Open an issue for bugs or feature requests
- Check existing issues and PRs for similar topics
