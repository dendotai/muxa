# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2025-07-28

### Fixed

- Fixed test failing on hardcoded version of `muxa`

## [0.2.0] - 2025-07-28

### Added

- Full rewrite of CLI
- Support for running multiple commands in parallel using mprocs
- Three main command modes:
  - `-c/--command`: Run arbitrary commands with optional names
  - `-s/--script`: Run package.json scripts from workspace packages
  - `-w/--workspace`: Run commands in workspace package directories
- Automatic workspace discovery for npm, yarn, and pnpm monorepos
- Package manager detection (npm, yarn, pnpm, bun)
- Smart command wrapping for shell operators and environment variables
- Pass-through support for mprocs options
- Workspace listing command (`muxa workspaces`)
- Comprehensive error messages with helpful hints
- Tab name validation and duplicate detection
- Nested execution prevention (`MUXA_RUNNING` check)
- Color output support (`FORCE_COLOR=1`)
- TypeScript implementation with full type safety
- Comprehensive test suite
- Modular architecture with separated concerns:
  - Parser for command-line arguments
  - Workspace discovery and resolution
  - Package manager detection
  - Command transformation and building
- Release automation scripts
- Documentation (README, SPEC, RELEASE process)

## [0.1.0] - TBD

- Initial implementation
