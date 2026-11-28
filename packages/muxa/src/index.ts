#!/usr/bin/env node
import { spawn, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { version as VERSION } from "../package.json";
import { buildCommands, buildProcessNames } from "./command-builder";
import { dekitBinaryPath } from "./dekit";
import { resolveLogDir, startLogFiles } from "./log-files";
import { printLog } from "./logs";
import { offerLogsLine } from "./logs-line";
import {
  enforceLogLimits,
  MUXAD_ENV,
  readLogLimitsError,
  removeLogLimitsError,
  runMuxad,
  writeMuxadConfig,
  type MuxadConfig,
} from "./muxad";
import { detectPackageManager } from "./package-manager";
import { parseArguments, RESERVED_WORDS } from "./parser";
import { joinRunner, type Join } from "./second-start";
import {
  buildDekitConfig,
  mergeTasks,
  otherRoots,
  runnerRoot,
  runnerRuns,
  runnerTasks,
  taskPaths,
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
  listText,
} from "./utils";
import { discoverWorkspaces, formatWorkspaceList } from "./workspace";

const stopRunner = (root: string) => ["-C", root, "runner", "stop"];

// Main execution
async function main() {
  try {
    if (process.env[MUXAD_ENV] === "1") {
      // dekit starts muxad in the runner root
      runMuxad(process.cwd());
      return;
    }

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
    const processEnv: Record<string, string> = { MUXA_RUNNING: "1" };
    if (!process.env.FORCE_COLOR) processEnv.FORCE_COLOR = "1";
    const env: NodeJS.ProcessEnv = { ...process.env, ...processEnv };

    const dekit = dekitBinaryPath();
    const root = runnerRoot(cwd, processListTitle);
    const runningTasks = runnerTasks(dekit, root);
    let join: Join | undefined;
    if (runningTasks) {
      join = await joinRunner(
        runningTasks,
        buildDekitConfig(commands, processNames, { cwd, env: processEnv }).tasks,
      );
      if (!join) process.exit(1);
    }
    // A process that runs on gets no start line in its log file
    const paths = taskPaths(processNames);
    const started = join && new Set([...join.start, ...join.restart]);
    const startedNames = processNames.filter((_, i) => !started || started.has(paths[i] ?? ""));

    let logDir: string | undefined = resolveLogDir(cwd);

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
        logFiles = startLogFiles(cwd, logDir, startedNames);
      } catch (error) {
        console.error(`Warning: muxa cannot write log files in ${logDir}: ${formatError(error)}`);
        logDir = undefined;
        // dekit's screen hides the warning until the user quits
        if (process.stdin.isTTY && !(await confirmPrompt("Continue without log files?"))) {
          process.exit(1);
        }
      }
    }

    const muxadConfig: MuxadConfig | undefined = logDir
      ? { cwd, logDir, logFiles, limits: resolveLogLimits(cwd, settings) }
      : undefined;
    const dekitConfig = buildDekitConfig(commands, processNames, {
      cwd,
      logDir: logDir && path.resolve(cwd, logDir),
      env: processEnv,
      mouseScrollSpeed: settings.mouseScrollSpeed,
      muxad: muxadConfig && {
        cmd: [process.execPath, path.resolve(process.argv[1] ?? "")],
        cwd: root,
      },
    });
    if (runningTasks) dekitConfig.tasks = mergeTasks(runningTasks, dekitConfig.tasks);
    const oldRoots = otherRoots(root);
    const reload = ["-C", root, "reload", "--yes"];
    // `up` would start again a process of an earlier start that ended, and a reload adds a new one idle
    const startCommands = join
      ? [
          reload,
          ...join.start.map((task) => ["-C", root, "start", task]),
          ...join.restart.map((task) => ["-C", root, "restart", task]),
        ]
      : [["-C", root, "up"], reload];
    const attachCommand = ["-C", root, "attach"];
    const quoted = (args: string[]) => `dekit ${args.map((arg) => `'${arg}'`).join(" ")}`;
    for (const args of startCommands) debugLog(`Executing: ${quoted(args)}`);

    if (testMode) {
      console.log(`Would write ${path.join(root, "dekit.yaml")}:`);
      process.stdout.write(toYaml(dekitConfig));
      for (const oldRoot of oldRoots) {
        console.log(`Would execute: ${quoted(stopRunner(oldRoot))}`);
      }
      for (const args of [...startCommands, attachCommand, stopRunner(root)]) {
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

    let logLimitsError: string | undefined;
    if (muxadConfig) {
      writeMuxadConfig(root, muxadConfig, runningTasks !== undefined);
      removeLogLimitsError(root);
      try {
        // Before dekit writes, when a rotation loses no line; muxad checks from then on
        enforceLogLimits(muxadConfig);
      } catch (error) {
        logLimitsError = formatError(error);
      }
    }

    for (const args of startCommands) runDekit(args);

    const attach = spawn(dekit, attachCommand, { stdio: "inherit", env });

    attach.on("error", (err) => {
      console.error("Failed to start dekit:", err.message);
      process.exit(1);
    });

    let stopOnExit = false;
    attach.on("exit", (code) => {
      try {
        // A deleted root fails every dekit command
        fs.mkdirSync(root, { recursive: true });
        // A runner that a quit choice stops takes no new client, so `dekit ls` waits for it to go and
        // fails; after Detach it answers
        const leftRunning = (stopOnExit ? undefined : runnerTasks(dekit, root))?.filter(
          (task) => !["idle", "done", "exited"].includes(task.state),
        );
        if (leftRunning?.length) {
          const names = leftRunning.map((task) => task.spec.label ?? task.path);
          const verb = names.length === 1 ? "keeps" : "keep";
          console.log(`${listText(names)} ${verb} running. Run muxa here to open them again.`);
        } else if (runnerRuns(dekit, root)) {
          runDekit(stopRunner(root));
        }
      } catch (error) {
        // A quit choice can finish stopping the runner between the check and the stop
        if (runnerRuns(dekit, root)) console.error(`Warning: ${formatError(error)}`);
      }
      // After the stop, so muxad writes no later check; dekit's screen would hide the warning during the run
      const error = readLogLimitsError(root) ?? logLimitsError;
      if (error) {
        console.error(
          `Warning: muxa cannot keep the log files in ${logDir} under their size limits: ${error}`,
        );
      }
      process.exit(code || 0);
    });

    // A closed terminal sends SIGHUP; without a handler muxa dies before it stops the runner
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
      process.on(signal, () => {
        stopOnExit = true;
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
