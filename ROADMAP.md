# Muxa Roadmap

## Future Features

*Note: These features are ideas for future development. No implementation is currently scheduled.*

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
