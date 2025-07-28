# TODO

## Code Organization & Documentation

- [ ] Move commands into commands directory (if it improves code structure)
- [ ] Add best practices section to SPEC.md
- [ ] Update help text - remove "A simple wrapper for mprocs" description
- [ ] Update README.md to match current spec and implementation
- [ ] Review and update other documentation files as needed

## Features

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
