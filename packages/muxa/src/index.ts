#!/usr/bin/env node
import { spawn } from "child_process";
import { version as VERSION } from "../package.json";
import { buildCommands, buildMprocsArgs } from "./command-builder";
import { dekitBinaryPath } from "./dekit";
import { detectPackageManager } from "./package-manager";
import { parseArguments } from "./parser";
import {
  readSettings,
  removeTempMprocsConfig,
  resolveProcessListTitle,
  toMprocsConfig,
  writeTempMprocsConfig,
} from "./settings";
import {
  checkDuplicateNames,
  checkNestedExecution,
  debugLog,
  formatError,
  validateTabName,
} from "./utils";
import { discoverWorkspaces, formatWorkspaceList } from "./workspace";

// Main execution
async function main() {
  try {
    // Check for nested execution
    checkNestedExecution();

    // Parse arguments
    const args = process.argv.slice(2);
    if (args.length === 0) {
      showHelp();
      process.exit(0);
    }

    const parsed = parseArguments(args);

    // Handle special commands
    if (parsed.help) {
      showHelp();
      process.exit(0);
    }

    if (parsed.version) {
      console.log(VERSION);
      process.exit(0);
    }

    if (parsed.workspaces) {
      const workspace = discoverWorkspaces();
      console.log(formatWorkspaceList(workspace));
      process.exit(0);
    }

    if (parsed.migrate) {
      // TODO: Implement migration tool
      console.error("Migration tool not yet implemented");
      process.exit(1);
    }

    // We need commands to proceed
    if (parsed.commands.length === 0) {
      showHelp();
      process.exit(0);
    }

    // Discover workspace configuration
    const workspace = discoverWorkspaces();
    debugLog(`Found ${workspace.packages.size} workspace packages`);

    // Detect package manager
    const packageManager = detectPackageManager(workspace.root);
    debugLog(`Detected package manager: ${packageManager.type}`);
    if (packageManager.missing && parsed.commands.some((cmd) => cmd.type === "script")) {
      console.error(
        `Warning: ${packageManager.missing} is not in PATH, so muxa runs scripts with npm.`,
      );
    }

    // Build commands
    const commands = buildCommands(parsed, workspace, packageManager);

    const cwd = process.cwd();
    const settings = readSettings(cwd);
    const mprocsConfig = toMprocsConfig(settings);
    const processListTitle = resolveProcessListTitle(cwd, settings);

    // Validate tab names
    for (const cmd of commands) {
      if (cmd.name) {
        validateTabName(cmd.name);
      }
    }

    // Check for duplicate names
    const names = commands.map((c) => c.name).filter((n) => n);
    if (names.length > 0) {
      const shouldContinue = await checkDuplicateNames(names);
      if (!shouldContinue) {
        process.exit(1);
      }
    }

    let mprocsConfigFile: string | undefined;
    if (mprocsConfig) {
      const file = writeTempMprocsConfig(mprocsConfig);
      process.on("exit", () => removeTempMprocsConfig(file));
      mprocsConfigFile = file;
    }

    const mprocsArgs = buildMprocsArgs(commands, parsed, { mprocsConfigFile, processListTitle });

    debugLog(`Executing: dekit mprocs ${mprocsArgs.map((arg) => `'${arg}'`).join(" ")}`);

    if (process.env.MUXA_TEST_MODE === "true") {
      // Set up environment for test mode too
      const testEnv: NodeJS.ProcessEnv = {
        ...process.env,
        MUXA_RUNNING: "1",
      };

      // Only set FORCE_COLOR if not already set
      if (!process.env.FORCE_COLOR) {
        testEnv.FORCE_COLOR = "1";
      }

      console.log(`Would execute: dekit mprocs ${mprocsArgs.map((arg) => `'${arg}'`).join(" ")}`);
      if (mprocsConfig) {
        console.log(`mprocs config: ${JSON.stringify(mprocsConfig)}`);
      }

      // Output environment variables that would be set
      // Always output FORCE_COLOR in test mode (either from env or what we would set)
      const forceColorValue = process.env.FORCE_COLOR || testEnv.FORCE_COLOR;
      if (forceColorValue) {
        console.log(`FORCE_COLOR=${forceColorValue}`);
      }
      for (const [key, value] of Object.entries(testEnv)) {
        if (
          key.startsWith("MUXA_") ||
          key.startsWith("TEST_") ||
          key === "CUSTOM_ENV" ||
          key === "SPECIAL_VAR" ||
          key === "NODE_ENV" ||
          key === "PATH" ||
          key === "HOME" ||
          key === "NO_COLOR" ||
          key === "CI" ||
          key === "GITHUB_ACTIONS"
        ) {
          console.log(`${key}=${value}`);
        }
      }

      process.exit(0);
    }

    // Set up environment
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      MUXA_RUNNING: "1",
    };

    // Only set FORCE_COLOR if not already set
    if (!process.env.FORCE_COLOR) {
      env.FORCE_COLOR = "1";
    }

    const proc = spawn(dekitBinaryPath(), ["mprocs", ...mprocsArgs], {
      stdio: "inherit",
      env,
    });

    proc.on("error", (err) => {
      console.error("Failed to start dekit:", err.message);
      process.exit(1);
    });

    proc.on("exit", (code) => {
      process.exit(code || 0);
    });

    // A closed terminal sends SIGHUP; without a handler muxa dies before its exit cleanup runs
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
      process.on(signal, () => {
        proc.kill("SIGTERM");
      });
    }
  } catch (error) {
    console.error(`Error: ${formatError(error)}`);
    process.exit(1);
  }
}

function showHelp() {
  console.log(`muxa ${VERSION} - Run multiple processes with monorepo awareness

Usage:
  muxa [commands...]                    Run commands in parallel
  muxa -c <command> [name] ...          Run arbitrary commands
  muxa -s <package> <script> [name] ... Run package.json scripts
  muxa -w <package> <command> [name] ...Run commands in workspace context
  muxa workspaces                       List all workspace packages
  muxa migrate [--dry-run] [--yes]      Migrate from concurrently

Examples:
  # Simple commands (like concurrently)
  muxa 'npm run dev' 'npm test'
  
  # Advanced commands
  muxa -c 'npm run dev' api -c 'npm test' test
  
  # Workspace scripts
  muxa -s backend dev -s frontend start
  
  # Mixed usage
  muxa -s backend dev api -w mobile 'npx expo start' expo

Options:
  -c, --command     Run arbitrary command
  -s, --script      Run package.json script in workspace
  -w, --workspace   Run command in workspace directory
  -h, --help        Show help
  -V, --version     Show version

Environment:
  MUXA_DEBUG=1      Enable debug output`);
}

// Run main
main();
