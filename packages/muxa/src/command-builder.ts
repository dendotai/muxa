// Command transformation and building for muxa

import * as path from "path";
import { type PackageManagerInfo, validateScript } from "./package-manager";
import type { ParsedCommand, ParseResult } from "./parser";
import { type WorkspaceConfig, resolvePackage } from "./workspace";

export interface TransformedCommand {
  /** The final command to execute */
  command: string;
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

      // Build the command
      command = `${packageManager.runCommand} ${cmd.script}`;

      // Default name for scripts
      // Use literal "." for root package to match SPEC.md
      const packageName = cmd.target === "." ? "." : info.dirName;
      name = cmd.name || `${packageName}:${cmd.script}`;

      // Scripts always need shell wrapping for cd
      needsShell = true;

      // Add cd to package directory
      const escapedCommand = escapeShellCommand(command);
      command = `cd ${packagePath} && ${escapedCommand}`;
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

      // Workspace commands always need shell wrapping for cd
      needsShell = true;

      // Add cd to package directory
      const escapedCommand = escapeShellCommand(command);
      command = `cd ${packagePath} && ${escapedCommand}`;
      break;
    }
  }

  return { command, name, needsShell };
}

/**
 * Build mprocs command line arguments
 */
export function buildMprocsArgs(commands: TransformedCommand[], parsed: ParseResult): string[] {
  const args: string[] = [...parsed.mprocsArgs];

  // Add environment variables
  if (!process.env.FORCE_COLOR) {
    // FORCE_COLOR will be set when spawning mprocs
  }

  // Collect names
  const names = commands.map((cmd) => cmd.name).filter((name) => name !== "");

  // Add names if any
  if (names.length > 0 && parsed.mode === "advanced") {
    args.push("--names", names.join(","));
  }

  // Add commands
  for (const cmd of commands) {
    if (cmd.needsShell) {
      args.push(`sh -c '${escapeShellCommand(cmd.command)}'`);
    } else {
      args.push(cmd.command);
    }
  }

  return args;
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
