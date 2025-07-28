// Command line argument parser for muxa

export type ParseMode = "basic" | "advanced";

export interface ParsedCommand {
  /** The command to execute */
  command: string;
  /** Optional custom name for the process */
  name?: string;
  /** Optional workspace target package (for -w flag) */
  target?: string;
  /** Optional script name (for -s flag) */
  script?: string;
  /** Type of command */
  type: "command" | "script" | "workspace";
}

export interface ParseResult {
  /** Parsing mode - either basic (simple args) or advanced (using flags) */
  mode: ParseMode;
  /** Parsed commands to execute */
  commands: ParsedCommand[];
  /** Show help */
  help?: boolean;
  /** Show version */
  version?: boolean;
  /** Show workspaces */
  workspaces?: boolean;
  /** Migration command */
  migrate?: boolean;
  /** Dry run for migration */
  dryRun?: boolean;
  /** Skip confirmation prompts */
  yes?: boolean;
  /** Additional mprocs arguments to pass through */
  mprocsArgs: string[];
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

/**
 * Parse command line arguments according to muxa spec
 */
export function parseArguments(argv: string[]): ParseResult {
  const result: ParseResult = {
    mode: "basic",
    commands: [],
    mprocsArgs: [],
  };

  let i = 0;
  let inAdvancedMode = false;

  // Check for special commands first
  if (argv.length > 0) {
    const firstArg = argv[0];

    // Handle help
    if (firstArg === "--help" || firstArg === "-h") {
      result.help = true;
      return result;
    }

    // Handle version
    if (firstArg === "--version" || firstArg === "-V") {
      result.version = true;
      return result;
    }

    // Handle workspaces command
    if (firstArg === "workspaces" || firstArg === "ws") {
      result.workspaces = true;
      return result;
    }

    // Handle migration commands
    if (firstArg === "check") {
      result.migrate = true;
      result.dryRun = true;
      return result;
    }

    if (firstArg === "migrate") {
      result.migrate = true;
      // Check for additional flags
      for (let j = 1; j < argv.length; j++) {
        if (argv[j] === "--dry-run") {
          result.dryRun = true;
        } else if (argv[j] === "--yes" || argv[j] === "-y") {
          result.yes = true;
        }
      }
      return result;
    }
  }

  // Parse command flags
  while (i < argv.length) {
    const arg = argv[i];
    if (!arg) {
      i++;
      continue;
    }

    // Handle mprocs pass-through options
    if (arg.startsWith("--") && !isKnownFlag(arg)) {
      result.mprocsArgs.push(arg);
      i++;
      continue;
    }

    // Handle -c flag (arbitrary commands)
    if (arg === "-c" || arg === "--command") {
      if (!inAdvancedMode && result.commands.length > 0) {
        throw new ParseError("Cannot mix basic and advanced arguments");
      }
      inAdvancedMode = true;
      result.mode = "advanced";

      i++;
      if (i >= argv.length) {
        throw new ParseError("Option -c requires a command");
      }

      const command = argv[i];
      if (!command) {
        throw new ParseError("Option -c requires a command");
      }
      const cmd: ParsedCommand = {
        command,
        type: "command",
      };

      // Check if next arg is a name (not a flag)
      if (i + 1 < argv.length) {
        const nextArg = argv[i + 1];
        if (nextArg && !nextArg.startsWith("-")) {
          cmd.name = nextArg;
          i++; // Skip the name
        }
      }

      result.commands.push(cmd);
      i++;
      continue;
    }

    // Handle -s flag (scripts in workspace)
    if (arg === "-s" || arg === "--script") {
      if (!inAdvancedMode && result.commands.length > 0) {
        throw new ParseError("Cannot mix basic and advanced arguments");
      }
      inAdvancedMode = true;
      result.mode = "advanced";

      i++;
      if (i >= argv.length) {
        throw new ParseError("Option -s requires a package identifier");
      }

      const target = argv[i];
      if (!target) {
        throw new ParseError("Option -s requires a package identifier");
      }
      i++;
      if (i >= argv.length) {
        throw new ParseError("Option -s requires a script name after package identifier");
      }

      const script = argv[i];
      if (!script) {
        throw new ParseError("Option -s requires a script name after package identifier");
      }
      const cmd: ParsedCommand = {
        command: "", // Will be filled in by command builder
        target,
        script,
        type: "script",
      };

      // Check if next arg is a name (not a flag)
      if (i + 1 < argv.length) {
        const nextArg = argv[i + 1];
        if (nextArg && !nextArg.startsWith("-")) {
          cmd.name = nextArg;
          i++; // Skip the name
        }
      }

      result.commands.push(cmd);
      i++;
      continue;
    }

    // Handle -w flag (workspace commands)
    if (arg === "-w" || arg === "--workspace") {
      if (!inAdvancedMode && result.commands.length > 0) {
        throw new ParseError("Cannot mix basic and advanced arguments");
      }
      inAdvancedMode = true;
      result.mode = "advanced";

      i++;
      if (i >= argv.length) {
        throw new ParseError("Option -w requires a package identifier");
      }

      const target = argv[i];
      if (!target) {
        throw new ParseError("Option -w requires a package identifier");
      }
      i++;
      if (i >= argv.length) {
        throw new ParseError("Option -w requires a command after package identifier");
      }

      const command = argv[i];
      if (!command) {
        throw new ParseError("Option -w requires a command after package identifier");
      }
      const cmd: ParsedCommand = {
        command,
        target,
        type: "workspace",
      };

      // Check if next arg is a name (not a flag)
      if (i + 1 < argv.length) {
        const nextArg = argv[i + 1];
        if (nextArg && !nextArg.startsWith("-")) {
          cmd.name = nextArg;
          i++; // Skip the name
        }
      }

      result.commands.push(cmd);
      i++;
      continue;
    }

    // In basic mode, everything is a command
    if (!inAdvancedMode) {
      result.commands.push({
        command: arg,
        type: "command",
      });
      i++;
      continue;
    }

    throw new ParseError(`Unexpected argument: ${arg}`);
  }

  return result;
}

function isKnownFlag(flag: string): boolean {
  const knownFlags = [
    "--help",
    "-h",
    "--version",
    "-V",
    "--command",
    "-c",
    "--script",
    "-s",
    "--workspace",
    "-w",
    "--dry-run",
    "--yes",
    "-y",
  ];
  return knownFlags.includes(flag);
}
