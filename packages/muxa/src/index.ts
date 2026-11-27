#!/usr/bin/env node
import { spawn, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { version as VERSION } from "../package.json";
import { buildCommands, buildProcessNames } from "./command-builder";
import { dekitBinaryPath } from "./dekit";
import { logDirsInTotal, resolveLogDir, startLogFiles } from "./log-files";
import { LogLimiter } from "./log-limits";
import { printLog } from "./logs";
import { offerLogsLine } from "./logs-line";
import { detectPackageManager } from "./package-manager";
import { parseArguments, RESERVED_WORDS } from "./parser";
import { checkOpenRuns } from "./second-start";
import {
  buildDekitConfig,
  otherRoots,
  runnerRoot,
  runnerRuns,
  toYaml,
  writeDekitConfig,
} from "./runner";
import { readSettings, resolveLogLimits, resolveProcessListTitle } from "./settings";
import {
  checkDuplicateNames,
  checkNestedExecution,
  confirmPrompt,
  debugLog,
  formatError,
} from "./utils";
import { discoverWorkspaces, formatWorkspaceList } from "./workspace";

const LOG_LIMITS_INTERVAL_MS = 1000;

const stopRunner = (root: string) => ["-C", root, "runner", "stop"];

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
      await printLog(process.cwd(), parsed.verbCall.process, parsed.verbCall.follow);
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
    const processListTitle = resolveProcessListTitle(cwd, settings);

    // Check for duplicate names
    const names = commands.map((c) => c.name).filter((n) => n);
    if (names.length > 0) {
      const shouldContinue = await checkDuplicateNames(names);
      if (!shouldContinue) {
        process.exit(1);
      }
    }

    const processNames = buildProcessNames(commands);
    let logDir: string | undefined = resolveLogDir(cwd);
    if (!(await checkOpenRuns(path.resolve(cwd, logDir), processNames))) {
      process.exit(1);
    }

    try {
      await offerLogsLine(cwd);
    } catch (error) {
      console.error(
        `Warning: muxa cannot add the muxa logs line to CLAUDE.md: ${formatError(error)}`,
      );
    }

    const testMode = process.env.MUXA_TEST_MODE === "true";

    let logFiles: string[] = [];
    // Test mode starts nothing, so its run gets no start line
    if (!testMode) {
      try {
        logFiles = startLogFiles(cwd, logDir, processNames);
      } catch (error) {
        console.error(`Warning: muxa cannot write log files in ${logDir}: ${formatError(error)}`);
        logDir = undefined;
        // dekit's screen hides the warning until the user quits
        if (process.stdin.isTTY && !(await confirmPrompt("Continue without log files?"))) {
          process.exit(1);
        }
      }
    }

    const processEnv: Record<string, string> = { MUXA_RUNNING: "1" };
    if (!process.env.FORCE_COLOR) processEnv.FORCE_COLOR = "1";
    const env: NodeJS.ProcessEnv = { ...process.env, ...processEnv };

    const dekitConfig = buildDekitConfig(commands, processNames, {
      cwd,
      logDir: logDir && path.resolve(cwd, logDir),
      env: processEnv,
      mouseScrollSpeed: settings.mouseScrollSpeed,
    });
    const root = runnerRoot(cwd, processListTitle);
    const oldRoots = otherRoots(root);
    const dekitCommands = {
      up: ["-C", root, "up"],
      reload: ["-C", root, "reload", "--yes"],
      attach: ["-C", root, "attach"],
      stop: stopRunner(root),
    };
    const quoted = (args: string[]) => `dekit ${args.map((arg) => `'${arg}'`).join(" ")}`;
    debugLog(`Executing: ${quoted(dekitCommands.up)}`);

    if (testMode) {
      console.log(`Would write ${path.join(root, "dekit.yaml")}:`);
      process.stdout.write(toYaml(dekitConfig));
      for (const oldRoot of oldRoots) {
        console.log(`Would execute: ${quoted(stopRunner(oldRoot))}`);
      }
      for (const args of Object.values(dekitCommands)) {
        console.log(`Would execute: ${quoted(args)}`);
      }

      // Output environment variables that would be set
      for (const [key, value] of Object.entries(env)) {
        if (
          key.startsWith("MUXA_") ||
          key.startsWith("TEST_") ||
          key === "FORCE_COLOR" ||
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

    const dekit = dekitBinaryPath();
    // The screen hides what dekit prints, so muxa shows it only when a command fails
    const runDekit = (args: string[]) => {
      const result = spawnSync(dekit, args, { env, encoding: "utf8" });
      if (result.error) throw new Error(`muxa cannot start dekit: ${result.error.message}`);
      if (result.status !== 0) {
        throw new Error(`${quoted(args)} failed: ${(result.stderr || result.stdout).trim()}`);
      }
    };

    for (const oldRoot of oldRoots) {
      if (runnerRuns(dekit, oldRoot)) runDekit(stopRunner(oldRoot));
    }
    writeDekitConfig(cwd, root, dekitConfig);

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

    runDekit(dekitCommands.up);
    runDekit(dekitCommands.reload);

    const attach = spawn(dekit, dekitCommands.attach, { stdio: "inherit", env });

    attach.on("error", (err) => {
      console.error("Failed to start dekit:", err.message);
      process.exit(1);
    });

    attach.on("exit", (code) => {
      try {
        // dekit's own quit choices stop the runner, except Detach; a deleted root fails every dekit command
        fs.mkdirSync(root, { recursive: true });
        if (runnerRuns(dekit, root)) runDekit(dekitCommands.stop);
      } catch (error) {
        console.error(`Warning: ${formatError(error)}`);
      }
      // dekit's screen would hide the warning during the run
      if (logLimitsError) {
        console.error(
          `Warning: muxa cannot keep the log files in ${logDir} under their size limits: ${formatError(logLimitsError)}`,
        );
      }
      process.exit(code || 0);
    });

    // A closed terminal sends SIGHUP; without a handler muxa dies before it stops the runner
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
      process.on(signal, () => {
        attach.kill("SIGTERM");
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
  muxa logs <process> [-f]              Print a process's output since the last start

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
  -f, --follow      With logs: print new output until Ctrl-C
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
