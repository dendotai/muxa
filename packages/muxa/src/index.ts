#!/usr/bin/env node
import { spawn } from "child_process";
import * as path from "path";
import { version as VERSION } from "../package.json";
import { buildCommands, buildMprocsArgs, buildProcessNames } from "./command-builder";
import { dekitBinaryPath } from "./dekit";
import { logDirsInTotal, resolveLogDir, startLogFiles } from "./log-files";
import { LogLimiter } from "./log-limits";
import { printLog } from "./logs";
import { detectPackageManager } from "./package-manager";
import { parseArguments, RESERVED_WORDS } from "./parser";
import {
  readSettings,
  removeTempMprocsConfig,
  resolveLogLimits,
  resolveProcessListTitle,
  toMprocsConfig,
  writeTempMprocsConfig,
} from "./settings";
import {
  checkDuplicateNames,
  checkNestedExecution,
  confirmPrompt,
  debugLog,
  formatError,
  validateTabName,
} from "./utils";
import { discoverWorkspaces, formatWorkspaceList } from "./workspace";

const LOG_LIMITS_INTERVAL_MS = 1000;

// Main execution
async function main() {
  try {
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

    if (parsed.verbCall?.verb === "logs") {
      await printLog(process.cwd(), parsed.verbCall.process);
      return;
    }

    if (parsed.verbCall) {
      throw new Error(`muxa ${parsed.verbCall.verb} is not yet implemented`);
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

    // After the commands that start nothing: an agent that muxa runs as a process reads the other processes with `muxa logs`
    checkNestedExecution();

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

    const testMode = process.env.MUXA_TEST_MODE === "true";

    let logDir: string | undefined = resolveLogDir(cwd);
    let logFiles: string[] = [];
    // Test mode starts nothing, so its run gets no start line
    if (!testMode) {
      try {
        logFiles = startLogFiles(cwd, logDir, buildProcessNames(commands, parsed));
      } catch (error) {
        console.error(`Warning: muxa cannot write log files in ${logDir}: ${formatError(error)}`);
        logDir = undefined;
        // dekit's screen hides the warning until the user quits
        if (process.stdin.isTTY && !(await confirmPrompt("Continue without log files?"))) {
          process.exit(1);
        }
      }
    }

    const mprocsArgs = buildMprocsArgs(commands, parsed, {
      mprocsConfigFile,
      processListTitle,
      logDir,
    });

    debugLog(`Executing: dekit mprocs ${mprocsArgs.map((arg) => `'${arg}'`).join(" ")}`);

    if (testMode) {
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

    let logLimitsError: unknown;
    if (logDir) {
      const runLogDir = logDir;
      const limiter = new LogLimiter(
        path.resolve(cwd, runLogDir),
        logFiles,
        resolveLogLimits(cwd, settings),
      );
      process.on("exit", () => limiter.close());
      const keepLogLimits = () => {
        try {
          limiter.enforce(logDirsInTotal(cwd, runLogDir));
          logLimitsError = undefined;
        } catch (error) {
          logLimitsError = error;
        }
      };
      // Before dekit writes, when a rotation loses no line
      keepLogLimits();
      setInterval(keepLogLimits, LOG_LIMITS_INTERVAL_MS);
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
      // dekit's screen would hide the warning during the run
      if (logLimitsError) {
        console.error(
          `Warning: muxa cannot keep the log files in ${logDir} under their size limits: ${formatError(logLimitsError)}`,
        );
      }
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
  muxa logs <process>                   Print a process's output since the last start

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

Reserved words:
  ${RESERVED_WORDS.join(", ")}
  To run a program with one of these names, use -c: muxa -c logs

Environment:
  MUXA_DEBUG=1      Enable debug output`);
}

// Run main
main();
