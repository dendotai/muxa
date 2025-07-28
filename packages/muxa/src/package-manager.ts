// Package manager detection and script execution

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

export interface PackageManagerInfo {
  /** Detected package manager */
  type: PackageManager;
  /** Whether the binary is available in PATH */
  available: boolean;
  /** Command to run scripts */
  runCommand: string;
  /** Whether this was a fallback to npm (no explicit detection) */
  isFallback: boolean;
}

/**
 * Detect the package manager from lockfiles
 */
function detectFromLockfile(rootDir: string): PackageManager | null {
  const lockfiles: Array<[string, PackageManager]> = [
    ["bun.lockb", "bun"],
    ["yarn.lock", "yarn"],
    ["pnpm-lock.yaml", "pnpm"],
    ["package-lock.json", "npm"],
  ];

  for (const [lockfile, manager] of lockfiles) {
    if (fs.existsSync(path.join(rootDir, lockfile))) {
      return manager;
    }
  }

  return null;
}

/**
 * Detect the package manager from package.json packageManager field
 */
function detectFromPackageJson(rootDir: string): PackageManager | null {
  const packageJsonPath = path.join(rootDir, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    if (packageJson.packageManager) {
      // Extract the package manager name from strings like "pnpm@8.0.0"
      const match = packageJson.packageManager.match(/^(npm|yarn|pnpm|bun)@/);
      if (match) {
        return match[1] as PackageManager;
      }
    }
  } catch (e) {
    // Ignore errors reading package.json
    if (process.env.MUXA_DEBUG) {
      console.error("Failed to read package.json:", e);
    }
  }

  return null;
}

/**
 * Detect the package manager used in the current project
 */
export function detectPackageManager(rootDir: string = process.cwd()): PackageManagerInfo {
  let isFallback = false;

  // 1. Check lockfiles (highest priority)
  let detectedType = detectFromLockfile(rootDir);

  // 2. Check packageManager field in package.json
  if (!detectedType) {
    detectedType = detectFromPackageJson(rootDir);
  }

  // 3. Fall back to npm if nothing detected
  if (!detectedType) {
    detectedType = "npm";
    isFallback = true;
  }

  // Check if the detected package manager is available
  const available = isPackageManagerAvailable(detectedType);

  // If not available, fall back to npm (unless in test mode)
  if (!available && detectedType !== "npm" && !process.env.MUXA_TEST_MODE) {
    if (process.env.MUXA_DEBUG) {
      console.error(
        `Warning: ${detectedType} detected but not available in PATH, falling back to npm`,
      );
    }
    detectedType = "npm";
    isFallback = true;
  }

  // Get the run command for the package manager
  const runCommand = getRunCommand(detectedType);

  return {
    type: detectedType,
    available,
    runCommand,
    isFallback,
  };
}

/**
 * Get the command to run scripts for a package manager
 */
export function getRunCommand(packageManager: PackageManager): string {
  switch (packageManager) {
    case "npm":
      return "npm run";
    case "yarn":
      return "yarn run";
    case "pnpm":
      return "pnpm run";
    case "bun":
      return "bun run";
  }
}

/**
 * Read scripts from a package.json file
 */
export interface ScriptInfo {
  /** Available scripts in package.json */
  scripts: Record<string, string>;
  /** Line number where scripts section starts */
  scriptsLine?: number;
}

export function readPackageScripts(packageJsonPath: string): ScriptInfo {
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`Package.json not found at ${packageJsonPath}`);
  }

  const content = fs.readFileSync(packageJsonPath, "utf-8");
  const packageJson = JSON.parse(content);

  const scripts = packageJson.scripts || {};

  // Try to find the line number of the scripts section
  let scriptsLine: number | undefined;
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    // Match "scripts" with any quote style using regex
    const line = lines[i];
    if (line && /["']scripts["']/.test(line)) {
      scriptsLine = i + 1; // 1-based line numbers
      break;
    }
  }

  return { scripts, scriptsLine };
}

/**
 * Validate that a script exists and return helpful error if not
 */
export function validateScript(scriptName: string, packagePath: string, packageName: string): void {
  const packageJsonPath = path.join(packagePath, "package.json");
  const { scripts, scriptsLine } = readPackageScripts(packageJsonPath);

  if (!scripts[scriptName]) {
    const availableScripts = Object.keys(scripts).sort();
    const lineInfo = scriptsLine ? `:${scriptsLine}` : "";

    let errorMessage = `Script '${scriptName}' not found in ${packageName} (${packageJsonPath}${lineInfo})`;

    if (availableScripts.length > 0) {
      errorMessage += `\nAvailable scripts: ${availableScripts.join(", ")}`;
    } else {
      errorMessage += `\nNo scripts defined in package.json`;
    }

    throw new Error(errorMessage);
  }
}

// Helper functions

function isPackageManagerAvailable(packageManager: PackageManager): boolean {
  try {
    execSync(`which ${packageManager}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
