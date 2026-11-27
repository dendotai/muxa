// Command transformation and building for muxa

import * as path from "path";
import { MAX_TAB_NAME_LENGTH, type ProcessNames, separateLogFiles } from "./log-files";
import { type PackageManagerInfo, validateScript } from "./package-manager";
import type { ParsedCommand, ParseResult } from "./parser";
import { type WorkspaceConfig, resolvePackage } from "./workspace";

export interface TransformedCommand {
  /** The command as it runs inside `folder` */
  command: string;
  /** The package folder that `-s` or `-w` names; with none, the process runs in the current folder */
  folder?: string;
  /** The display name for the process */
  name: string;
  /** Whether the command needs shell wrapping */
  needsShell: boolean;
}

/**
 * Build executable commands from parsed arguments
 */
export function buildCommands(
  parsed: ParseResult,
  workspace: WorkspaceConfig,
  packageManager: PackageManagerInfo,
): TransformedCommand[] {
  const commands: TransformedCommand[] = [];

  // Check if workspace is required but not configured
  // Exception: -s . (root scripts) should work without workspace config
  const needsWorkspace = parsed.commands.some((cmd) => {
    if (cmd.type === "workspace") return true;
    if (cmd.type === "script" && cmd.target !== ".") return true;
    return false;
  });

  if (needsWorkspace && workspace.type === null) {
    throw new Error(
      "No workspace configuration found\n" +
        "Please ensure you're in a monorepo root with workspaces configured",
    );
  }

  for (const cmd of parsed.commands) {
    const transformed = transformCommand(cmd, workspace, packageManager);
    commands.push(transformed);
  }

  return commands;
}

/**
 * Transform a single parsed command into an executable command
 */
function transformCommand(
  cmd: ParsedCommand,
  workspace: WorkspaceConfig,
  packageManager: PackageManagerInfo,
): TransformedCommand {
  let command: string;
  let name: string;
  let folder: string | undefined;
  let needsShell = false;

  switch (cmd.type) {
    case "command": {
      // Simple command execution
      command = cmd.command;
      name = cmd.name || "";
      needsShell = needsShellWrapping(command);
      break;
    }

    case "script": {
      // Script execution in workspace
      if (!cmd.target || !cmd.script) {
        throw new Error("Script command missing target or script name");
      }

      const info = resolvePackage(cmd.target, workspace);
      const packagePath = path.join(workspace.root, info.path);

      // Validate script exists
      validateScript(cmd.script, packagePath, info.name);

      command = `${packageManager.runCommand} ${cmd.script}`;
      folder = packagePath;

      // Default name for scripts
      // Use literal "." for root package (ADR 0005)
      const packageName = cmd.target === "." ? "." : info.dirName;
      name = cmd.name || `${packageName}:${cmd.script}`;

      // Scripts always need shell wrapping for cd
      needsShell = true;
      break;
    }

    case "workspace": {
      // Arbitrary command in workspace
      if (!cmd.target) {
        throw new Error("Workspace command missing target");
      }

      const info = resolvePackage(cmd.target, workspace);
      const packagePath = path.join(workspace.root, info.path);

      command = cmd.command;
      name = cmd.name || info.dirName;
      folder = packagePath;

      // Workspace commands always need shell wrapping for cd
      needsShell = true;
      break;
    }
  }

  return { command, name, folder, needsShell };
}

/**
 * The names of each process, before dekit numbers duplicates
 */
export function buildProcessNames(
  commands: TransformedCommand[],
  parsed: ParseResult,
): ProcessNames[] {
  const typed = commands.map((cmd) => cmd.name || cmd.command);
  const mprocsCommands = commands.map(toMprocsCommand);
  const named = parsed.mode === "advanced" && commands.some((cmd) => cmd.name !== "");
  const fits = mprocsCommands.every((command) => command.length <= MAX_TAB_NAME_LENGTH);
  if (!named && fits) {
    const unlisted = separateLogFiles(typed.map((name, i) => [name, mprocsCommands[i] ?? ""]));
    if (unlisted.every(({ tabName }, i) => tabName === mprocsCommands[i])) return unlisted;
  }

  return separateLogFiles(typed.map((name) => [name, toListedName(name)]));
}

/**
 * The tab names, without a suffix, that a process with this name or this command can have
 */
export function possibleTabNames(typed: string): string[] {
  const command = { command: typed, name: "", needsShell: needsShellWrapping(typed) };
  return [...new Set([typed, toMprocsCommand(command), toListedName(typed)])];
}

/**
 * Build the arguments of `dekit mprocs`
 */
export function buildMprocsArgs(
  commands: TransformedCommand[],
  parsed: ParseResult,
  {
    mprocsConfigFile,
    processListTitle,
    logDir,
  }: { mprocsConfigFile?: string; processListTitle?: string; logDir?: string } = {},
): string[] {
  const args: string[] = [];
  if (mprocsConfigFile) args.push("--config", mprocsConfigFile);
  if (processListTitle) args.push("--proc-list-title", processListTitle);
  if (logDir) {
    // --log-file overrides a `proc_log.file` in the user's mprocs.yaml; dekit resolves a relative one from the current folder, not inside --log-dir
    const logFile = path.resolve(logDir, "{name}.log");
    args.push("--log-dir", logDir, "--log-file", logFile, "--log-mode", "append");
  }

  const mprocsCommands = commands.map(toMprocsCommand);

  // dekit assigns --names by position; with no --names, it names each process by its command
  const tabNames = buildProcessNames(commands, parsed).map(({ tabName }) => tabName);
  if (tabNames.some((tabName, i) => tabName !== mprocsCommands[i])) {
    args.push("--names", tabNames.join(","));
  }

  return [...args, ...mprocsCommands];
}

/** The name of a process in --names, where a comma separates the names */
function toListedName(typed: string): string {
  return typed.replaceAll(",", " ").slice(0, MAX_TAB_NAME_LENGTH);
}

function toMprocsCommand({ command, folder, needsShell }: TransformedCommand): string {
  const inFolder = folder ? `cd ${folder} && ${escapeShellCommand(command)}` : command;
  return needsShell ? `sh -c '${escapeShellCommand(inFolder)}'` : inFolder;
}

/**
 * Check if command needs shell wrapping
 * @internal - Exported for testing purposes only
 */
export function needsShellWrapping(command: string): boolean {
  // Check for shell operators (including && and ||)
  if (/[&|<>;]/.test(command)) return true;

  // Check for glob patterns
  if (/[*?[\]]/.test(command)) return true;

  // Check for brace expansion
  if (/\{[^}]+\}/.test(command)) return true;

  // Check for environment variables (including ${VAR} syntax)
  if (/\$[\w{]/.test(command)) return true;

  // Check for command substitution
  if (/`[^`]+`/.test(command)) return true;
  if (/\$\([^)]+\)/.test(command)) return true;

  // Check for subshells
  if (/\([^)]+\)/.test(command)) return true;

  // Check for tilde expansion at word boundaries
  if (/(?:^|[\s:])~/.test(command)) return true;

  // Check for escaped characters
  if (/\\/.test(command)) return true;

  // Check for quotes that might contain spaces or special chars
  if (/["']/.test(command)) return true;

  // Check for redirections (including 2>&1, &>, etc.)
  if (/\d*>[>&]?\d*/.test(command)) return true;

  // Check for here documents
  if (/<<-?\s*\w+/.test(command)) return true;

  return false;
}

/**
 * Escape command for shell execution
 */
function escapeShellCommand(cmd: string): string {
  // Escape single quotes by replacing ' with '\''
  return cmd.replace(/'/g, "'\\''");
}
