# Development Guide

## Prerequisites

- Bun >= 1.0.0 (required package manager)
- Node.js >= 16.0.0 (for TypeScript tooling)

## Setup

```bash
# Install dependencies
bun install

# Run local version of muxa
bun run muxa:local
```

## Available Scripts

### Testing

```bash
bun test                 # Run all tests
bun test --watch        # Run tests in watch mode
```

### Building

```bash
bun run build           # Build all packages
```

### Code Quality

```bash
bun run typecheck       # Check TypeScript types
bun run lint            # Run ESLint
bun run lint:fix        # Auto-fix ESLint issues
bun run format          # Check Prettier formatting
bun run format:fix      # Auto-fix formatting
bun run check           # Run all checks (typecheck, lint, format)
bun run check:fix       # Fix all auto-fixable issues
```

### Development

```bash
bun run dev             # Run all packages in dev mode
bun run muxa:local      # Run muxa from source
```

## Project Structure

This is a monorepo with workspaces:
- `packages/muxa` - The main muxa package
- `apps/docs` - Documentation site (future)

## Known Issues

1. **Interactive tests**: The interactive confirmation tests are currently skipped because they require proper TTY emulation. See TODO.md for more details.

## Contributing

1. Make changes in your feature branch
2. Run `bun run check` before committing
3. Fix any issues with `bun run check:fix`
4. Write tests for new features
5. Update documentation as needed
