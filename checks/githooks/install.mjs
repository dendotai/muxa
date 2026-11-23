#!/usr/bin/env bun
// Turns the git hooks on. The root `prepare` script runs this file after every `bun install`.
import { spawnSync } from "node:child_process";

// CI runs each check as its own job, and a release push there would run `pre-push`.
if (process.env.CI) process.exit(0);

// In a folder with no git repo, `git config` would fail the install.
if (spawnSync("git", ["rev-parse", "--git-dir"]).status !== 0) process.exit(0);

// git reads its hooks from `.githooks/` in place of `.git/hooks/`.
const { status } = spawnSync("git", ["config", "core.hooksPath", ".githooks"], {
  stdio: "inherit",
});
process.exit(status ?? 1);
