#!/usr/bin/env bun

/**
 * Release Script for muxa
 *
 * This script automates the release process with a two-stage approach:
 * 1. Validation Stage: Runs all checks and shows preview
 * 2. Execution Stage: Updates versions, changelog, and pushes release
 *
 * Design Decisions:
 * - Requires clean git state (no uncommitted changes, untracked files, or staged changes)
 * - Version is read from package.json (single source of truth)
 * - CHANGELOG.md must have unreleased content
 * - All checks must pass before proceeding
 * - Explicit user confirmation required
 * - Pushes to GitHub trigger automated npm publishing via Actions
 *
 * Note: GitHub Actions will copy the root README.md to packages/muxa/README.md before publishing to npm. See .github/workflows/release.yml
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import * as readline from "readline";

const args = process.argv.slice(2);
const releaseType = args[0];

if (!releaseType || !["patch", "minor", "major"].includes(releaseType)) {
  console.error("Usage: bun scripts/release.ts [patch|minor|major]");
  process.exit(1);
}

// Helper function to run command and capture output
function runCommand(command: string, options: any = {}) {
  try {
    return execSync(command, { encoding: "utf8", ...options }).trim();
  } catch (error) {
    return null;
  }
}

// Helper function to get user confirmation
async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}

// Read current version from muxa package
const muxaPackageJsonPath = path.join(__dirname, "..", "packages", "muxa", "package.json");
const muxaPackageJson = JSON.parse(fs.readFileSync(muxaPackageJsonPath, "utf-8"));
const currentVersion = muxaPackageJson.version;

// Also read root package.json
const rootPackageJsonPath = path.join(__dirname, "..", "package.json");
const rootPackageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, "utf-8"));

// Parse version
const [major, minor, patch] = currentVersion.split(".").map(Number);
let newVersion: string;

switch (releaseType) {
  case "patch":
    newVersion = `${major}.${minor}.${patch + 1}`;
    break;
  case "minor":
    newVersion = `${major}.${minor + 1}.0`;
    break;
  case "major":
    newVersion = `${major + 1}.0.0`;
    break;
  default:
    throw new Error("Invalid release type");
}

console.log(`\n📦 Preparing ${releaseType} release: ${currentVersion} → ${newVersion}\n`);

// Stage 1: Run all checks
console.log("📋 Stage 1: Running pre-release checks\n");

// Check TypeScript
console.log("⏳ Running TypeScript checks...");
const typecheckResult = runCommand("bun run typecheck", {
  cwd: path.join(__dirname, ".."),
  stdio: "pipe",
});
if (typecheckResult === null) {
  console.error("❌ TypeScript check failed!");
  process.exit(1);
}
console.log("✅ TypeScript checks passed");

// Check linting
console.log("⏳ Running lint checks...");
const lintResult = runCommand("bun run lint", { cwd: path.join(__dirname, ".."), stdio: "pipe" });
if (lintResult === null) {
  console.error("❌ Lint check failed!");
  process.exit(1);
}
console.log("✅ Lint checks passed");

// Check formatting
console.log("⏳ Running format checks...");
const formatResult = runCommand("bun run format", {
  cwd: path.join(__dirname, ".."),
  stdio: "pipe",
});
if (formatResult === null) {
  console.error("❌ Format check failed!");
  process.exit(1);
}
console.log("✅ Format checks passed");

// Run tests
console.log("⏳ Running tests...");
const testResult = runCommand("bun test", {
  cwd: path.join(__dirname, "..", "packages", "muxa"),
  stdio: "pipe",
});
if (testResult === null) {
  console.error("❌ Tests failed!");
  process.exit(1);
}
console.log("✅ All tests passed");

// Build
console.log("⏳ Building project...");
const buildResult = runCommand("bun run build", { cwd: path.join(__dirname, ".."), stdio: "pipe" });
if (buildResult === null) {
  console.error("❌ Build failed!");
  process.exit(1);
}
console.log("✅ Build successful");

// Check git status
const gitStatus = runCommand("git status --porcelain", { cwd: path.join(__dirname, "..") });
const hasUncommittedChanges = gitStatus && gitStatus.length > 0;

// Fail early if there are uncommitted changes
if (hasUncommittedChanges) {
  console.error("\n❌ Error: You have uncommitted changes:");
  console.error(gitStatus);
  console.error("\nPlease commit or stash your changes before releasing.");
  process.exit(1);
}

// Preview what will be done
console.log("\n📋 Release Preview\n");
console.log("The following changes will be made:");
console.log(`  • Version: ${currentVersion} → ${newVersion}`);
console.log("  • Files to be updated:");
console.log(`    - packages/muxa/package.json`);
console.log(`    - packages/muxa/CHANGELOG.md ([Unreleased] → [${newVersion}])`);
if (rootPackageJson.devDependencies?.["@den-ai/muxa"]) {
  console.log(`    - package.json (devDependency version)`);
}

console.log("\n📝 Git Operations:");
console.log(`  • Commit message: "Release v${newVersion}"`);
console.log(`  • Tag: v${newVersion}"`);

console.log("\n📦 After confirmation:");
console.log("  • Changes will be committed and tagged");
console.log("  • Changes will be pushed to remote repository");
console.log("  • GitHub Actions will handle npm publishing");

// Ask for confirmation
const proceed = await confirm("\n🚀 Do you want to proceed with the release?");

if (!proceed) {
  console.log("\n❌ Release cancelled");
  process.exit(0);
}

// Stage 2: Execute the release
console.log("\n📋 Stage 2: Executing release\n");

// Update muxa package.json
muxaPackageJson.version = newVersion;
fs.writeFileSync(muxaPackageJsonPath, JSON.stringify(muxaPackageJson, null, 2) + "\n");
console.log("✓ Updated packages/muxa/package.json");

// Update dependency version in root package.json if it exists
if (rootPackageJson.devDependencies?.["@den-ai/muxa"]) {
  rootPackageJson.devDependencies["@den-ai/muxa"] = `^${newVersion}`;
  fs.writeFileSync(rootPackageJsonPath, JSON.stringify(rootPackageJson, null, 2) + "\n");
  console.log("✓ Updated root package.json devDependency");
}

// Update CHANGELOG.md - replace [Unreleased] with version and date
const changelogPath = path.join(__dirname, "..", "packages", "muxa", "CHANGELOG.md");
let changelogContent = fs.readFileSync(changelogPath, "utf-8");
const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format

// Replace [Unreleased] with [version] - YYYY-MM-DD
changelogContent = changelogContent.replace("## [Unreleased]", `## [${newVersion}] - ${today}`);

// Add a new [Unreleased] section at the top
const changelogLines = changelogContent.split("\n");
const firstVersionIndex = changelogLines.findIndex((line) => line.match(/^## \[\d+\.\d+\.\d+\]/));
if (firstVersionIndex > 0) {
  changelogLines.splice(firstVersionIndex, 0, "", "## [Unreleased]", "");
  changelogContent = changelogLines.join("\n");
}

fs.writeFileSync(changelogPath, changelogContent);
console.log("✓ Updated CHANGELOG.md");

// Git operations
console.log("\n📝 Creating git commit and tag...");
const filesToAdd = ["packages/muxa/package.json", "packages/muxa/CHANGELOG.md"];
if (rootPackageJson.devDependencies?.["@den-ai/muxa"]) {
  filesToAdd.push("package.json");
}
execSync(`git add ${filesToAdd.join(" ")}`, { stdio: "inherit", cwd: path.join(__dirname, "..") });
execSync(`git commit -m "Release v${newVersion}"`, {
  stdio: "inherit",
  cwd: path.join(__dirname, ".."),
});
execSync(`git tag -a v${newVersion} -m "Release v${newVersion}"`, {
  stdio: "inherit",
  cwd: path.join(__dirname, ".."),
});

// Push to remote
console.log("\n📤 Pushing to remote repository...");
execSync("git push", { stdio: "inherit", cwd: path.join(__dirname, "..") });
execSync("git push --tags", { stdio: "inherit", cwd: path.join(__dirname, "..") });

console.log(`
✅ Release v${newVersion} completed successfully!

The release has been pushed to GitHub. GitHub Actions will now:
- Build and test the release
- Publish to npm automatically
- Deploy documentation updates

You can monitor the progress at:
https://github.com/dendotai/muxa/actions
`);
