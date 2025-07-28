# Muxa Roadmap

## Testing Improvements

### CI Matrix for Package Manager Tests

Currently, some package manager detection tests are skipped because they depend on specific package managers being installed in the test environment. To properly test detection for all supported package managers, we should:

1. Set up a GitHub Actions matrix strategy with different environments:
   - Node.js only (npm)
   - Node.js + Yarn
   - Node.js + pnpm
   - Node.js + Bun

2. Run package manager detection tests in each environment to ensure:
   - Correct detection when package manager is available
   - Proper fallback behavior when package manager is not available

3. Tests to re-enable:
   - "should detect yarn from yarn.lock"
   - "should detect pnpm from pnpm-lock.yaml"
   - "should detect bun from bun.lockb"
   - "should detect from packageManager field"

4. Tests temporarily removed due to environment dependencies:
   - "should detect yarn and use yarn run" (script-commands.test.ts)
   - "should handle yarn run correctly" (script-restrictions.test.ts)
   - "should handle pnpm run correctly" (script-restrictions.test.ts)

   These tests were removed because:
   - They depend on specific package managers being available in the environment
   - GitHub Actions runners have yarn pre-installed, but local dev environments may not
   - Tests pass/fail based on environment rather than code correctness
   - Need proper mocking strategy to test package manager detection without actual binaries

This will ensure muxa works correctly across all package manager ecosystems.

### Better Error Handling for Spawn Failures

- Create a robust spawn wrapper that handles process spawn errors gracefully
- Replace direct spawn calls in tests with the wrapper to prevent hanging tests
- Consider using this wrapper in the main codebase as well

## Documentation Improvements

- Add examples for each supported package manager
- Document the fallback behavior clearly
- Add troubleshooting guide for common issues

## Future Features

> [!NOTE]
> These features are ideas for future development. No implementation is currently scheduled.

### Fail-Fast Mode

Add support for fail-fast behavior where all processes terminate when one fails or exits.

**Why this would be useful:**

- Matches behavior of `concurrently --kill-others` and `npm-run-all --bail`
- Useful for CI pipelines where you want fast feedback
- Good for test suites where subsequent tests depend on earlier ones
- Saves resources by not running unnecessary processes after failure

**Implementation considerations:**

- Add `-f` or `--fail-fast` flag
- Monitor process exit codes and send signals to other processes
- Consider different modes: on-error (non-zero exit) vs on-exit (any exit)
- Ensure graceful shutdown with proper signal handling

### Respect User's Shell (Non-Monorepo Mode)

When not in a monorepo context (i.e., when only using `-c` flags), consider using the user's configured shell instead of always using `sh`.

**Why this would be useful:**

- Allows access to personal shell aliases and functions
- Better integration with user's development workflow
- Fish/Zsh users can use their shell-specific syntax
- Makes muxa more versatile as a general process runner

**Implementation considerations:**

- Detect when no workspace operations are used
- Use `$SHELL` environment variable to determine user's shell
- Fall back to `sh` if detection fails
- Keep using `sh` for all workspace operations to ensure consistency

### Configuration File Support

Add support for configuration files to define reusable command presets.

**Why this would be useful:**

- Standardize common development workflows across team
- Avoid typing long command sequences repeatedly
- Version control your development setups
- Share configurations between projects

**Implementation considerations:**

- Format TBD (YAML, JSON, or other)
- Allow presets for common command combinations
- Usage: `muxa --preset dev` or similar

### Docker Compose Integration

Add native understanding of Docker Compose services as first-class citizens alongside workspace scripts.

**Why this would be useful:**

- Modern development often requires both application processes and containerized services
- Eliminates the need for separate terminal tabs for `docker-compose up` commands
- Provides unified interface for all local development processes
- Better visibility into service health and logs alongside application output

**Implementation considerations:**

- Add `-d` flag for Docker Compose services: `muxa -d postgres -d redis -s backend dev`
- Auto-detect docker-compose.yml in current directory or specify with `--compose-file`
- Map service names to compose services, with automatic `docker-compose up` execution
- Handle service dependencies and startup order if specified in compose file
- Consider integration with Docker Compose profiles for environment-specific services
- Graceful shutdown should properly stop containers (not just detach)
