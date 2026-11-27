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

  switch (cmd.type) {
    case "command": {
      // Simple command execution
      command = cmd.command;
      name = cmd.name || "";
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

      break;
    }
  }

  return { command, name, folder, needsShell: needsShellWrapping(command) };
}

/**
 * The names of each process: as typed, and cut to a length a log file name can hold
 */
export function buildProcessNames(commands: TransformedCommand[]): ProcessNames[] {
  return separateLogFiles(
    commands.map((cmd) => {
      const typed = cmd.name || cmd.command;
      return [typed, typed.slice(0, MAX_TAB_NAME_LENGTH)];
    }),
  );
}

/**
 * The tab names, without a suffix, that a process with this name or this command can have, in this
 * version of muxa and in the versions that passed dekit its commands with `--names`
 */
export function possibleTabNames(typed: string): string[] {
  const command = needsShellWrapping(typed) ? `sh -c '${escapeShellCommand(typed)}'` : typed;
  const listed = typed.replaceAll(",", " ").slice(0, MAX_TAB_NAME_LENGTH);
  return [...new Set([typed.slice(0, MAX_TAB_NAME_LENGTH), typed, command, listed])];
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

  // dekit refuses these in a string command: a variable set before the command, a comment, a line break, and a shell keyword
  if (/^\s*[A-Za-z_]\w*=/.test(command)) return true;
  if (/(?:^|\s)#/.test(command)) return true;
  if (/[\n\r]/.test(command)) return true;
  if (
    /^\s*(?:!|if|then|else|elif|fi|case|esac|for|select|while|until|do|done|function|time|\{|\}|\[\[|\]\])(?:\s|$)/.test(
      command,
    )
  )
    return true;

  // A shell builtin is no program dekit can start
  if (
    /^\s*(?:\.|alias|break|cd|command|continue|eval|exec|exit|export|readonly|return|set|shift|source|trap|ulimit|umask|unalias|unset|wait)(?:\s|$)/.test(
      command,
    )
  )
    return true;

  return false;
}

/**
 * Escape command for shell execution
 */
function escapeShellCommand(cmd: string): string {
  // Escape single quotes by replacing ' with '\''
  return cmd.replace(/'/g, "'\\''");
}
