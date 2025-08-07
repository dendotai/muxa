# TODO

## Code Organization & Documentation

- [ ] Move commands into commands directory (if it improves code structure)
- [ ] Add best practices section to SPEC.md
- [ ] Update help text - remove "A simple wrapper for mprocs" description
- [ ] Update README.md to match current spec and implementation
- [ ] Review and update other documentation files as needed

## Features

- [ ] Add single mode for running commands without multiplexer
  - When only one service is specified, skip mprocs and run directly
  - Example: `muxa -s docs dev` instead of `cd apps/docs && bun run dev`
  - Preserves all output formatting and behavior of the original command
  - Useful for CI/CD and simpler workflows
- [ ] Add Deno monorepo support
- [ ] Implement `muxa migrate` command with:
  - Automatic detection of concurrently/npm-run-all usage
  - Interactive migration with diff preview
  - --dry-run and --yes flags
  - Backup creation before changes

## Code Quality

- [ ] Refactor tests to use fixtures instead of inline temp directories
  - Replace temporary directory creation in package-manager.test.ts for tests that still use it
  - Create/reuse reusable fixture helpers for better maintainability where they don't use it yet
  - Improve test readability and reduce duplication
- [ ] Add automated check with husky or something. On save we

## CI/CD

- [ ] Add GitHub Actions workflow for PR checks
  - Run tests on all PRs (required check)
  - Run typecheck, lint, format checks
  - Test on multiple Node versions (16, 18, 20)
  - Test on multiple OS (ubuntu, macos, windows)
  - Do NOT run release script on PRs
  - Cache dependencies for faster runs

## Future: Testing Infrastructure

### Long-term Goal: Custom Terminal Multiplexer for Testing

**Current Limitation**: The test suite uses `MUXA_TEST_MODE=true` to verify command generation without actually running processes. This is because mprocs requires a real TTY, making true E2E testing difficult.

**Potential Solution**: Create a Python-based terminal multiplexer using Textual framework

- [ ] Built-in headless terminal support for true E2E testing
- [ ] Snapshot testing capabilities
- [ ] Can simulate user interactions in tests
- [ ] No PTY/TTY requirements
- [ ] Keep same CLI interface as mprocs for compatibility
- [ ] Support process spawning, output capture, and multiplexing
- [ ] Add test-specific features (output capture, deterministic rendering)

**Benefits**:

- Full control over multiplexer UI and cli
- Enable testing of actual process execution
- Verify terminal UI output
- Test interactive features properly
- More reliable and deterministic tests

### Current Testing Limitations

#### Interactive Confirmation Tests

- The `confirmPrompt` function works in production but is difficult to test
- Tests for this feature are currently skipped
- Options for improvement:
  - Use node-pty for PTY emulation (needs Bun compatibility)
  - Mock the confirmPrompt function in tests
  - Wait for custom multiplexer solution above

**Note**: These limitations don't affect muxa's functionality - only test coverage.

### Changelog

- [ ] Consider enforcing good commit messages that can be used to generate changelog automatically
- [ ] Restructure release script so that all actions are in function and we can call them for better readability

## Documentation: Command Parameter Breakdown

### Todo

- [ ] Add detailed command parameter breakdown to README.md with:
  - Visual ASCII diagram showing each part of the muxa command
  - Explanation of `-s` flag structure: flag + package identifier + script name
  - Clarification that package identifier serves dual purpose: workspace lookup + automatic tab name
  - Explanation of `-c` flag structure: flag + command + optional tab name
  - Show how muxa syntax maps to the verbose concurrently equivalent
  - Use actual examples: `-s api dev`, `-s web dev`, `-c "docker-compose up postgres" db`
  - Emphasize the space-saving design and automatic naming extraction

### Implementation Reference for README.md Update

Add the following section after the "Before/After" example in README.md:

## Command Breakdown

Let's examine each parameter in detail:

```text

muxa -s api dev -s web dev -c "docker-compose up postgres" db
     └─┬──┘└┬┘└┬┘ └─┬──┘└┬┘└┬┘ └────────┬─────────────────┘ └┬┘
       │    │  │    │    │  │           │                     │
       │    │  │    │    │  │           │                     └── Custom tab name
       │    │  │    │    │  │           └── Command to run
       │    │  │    │    │  └── Script name from package.json
       │    │  │    │    └── Package identifier
       │    │  │    └── Flag for workspace script
       │    │  └── Script name from package.json
       │    └── Package identifier (workspace name)
       └── Flag for workspace script

```

### Understanding the `-s` flag structure

```text

-s api dev
└─┬──┘ └┬┘
  │     └── Script name: "dev" script from package.json
  └── Package identifier: finds workspace "api" and uses as tab name

-s web dev
└─┬──┘ └┬┘
  │     └── Script name: "dev" script from package.json
  └── Package identifier: finds workspace "web" and uses as tab name

```

### Understanding the `-c` flag structure

```text

-c "docker-compose up postgres" db
└┬┘ └───────────┬──────────────┘ └┬┘
 │              │                  └── Custom tab name (optional)
 │              └── Command to execute
 └── Flag for arbitrary command

```

The beauty of muxa is that it automatically uses sensible tab names from your workspace structure when possible, and allows explicit naming when needed (like shortening "docker-compose up postgres" to just "db").

### Key Points to Emphasize

- The `-s` flag takes TWO parameters as a unit (package + script)
- Package identifier serves dual purpose: workspace resolution AND automatic tab naming
- The design minimizes typing while maximizing clarity
- Custom names are optional but useful for long commands
