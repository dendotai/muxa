// Command line argument parser for muxa

export type ParseMode = "basic" | "advanced";

/** Each verb acts on one process: `muxa <verb> <process>` */
const VERBS = ["logs", "restart", "stop", "start"] as const;

export interface VerbCall {
  verb: (typeof VERBS)[number];
  process: string;
  /** `logs` prints on as the process writes */
  follow?: boolean;
}

/** A first argument that muxa does not run as a command */
export const RESERVED_WORDS = ["workspaces", "ws", "check", "migrate", ...VERBS] as const;

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
  /** A verb and the process it acts on */
  verbCall?: VerbCall;
  /** Migration command */
  migrate?: boolean;
  /** Dry run for migration */
  dryRun?: boolean;
  /** Skip confirmation prompts */
  yes?: boolean;
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

    const reserved = RESERVED_WORDS.find((word) => word === firstArg);
    if (reserved) return { ...result, ...parseReserved(reserved, argv.slice(1)) };
  }

  // Parse command flags
  while (i < argv.length) {
    const arg = argv[i];
    if (!arg) {
      i++;
      continue;
    }

    if (arg.startsWith("--") && !isKnownFlag(arg)) {
      throw new ParseError(`Unknown option '${arg}'`);
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

function parseReserved(
  word: (typeof RESERVED_WORDS)[number],
  args: string[],
): Omit<ParseResult, "mode" | "commands"> {
  switch (word) {
    case "workspaces":
    case "ws":
      return { workspaces: true };
    case "check":
      return { migrate: true, dryRun: true };
    case "migrate":
      return {
        migrate: true,
        dryRun: args.includes("--dry-run") || undefined,
        yes: args.includes("--yes") || args.includes("-y") || undefined,
      };
    case "logs":
    case "restart":
    case "stop":
    case "start":
      return { verbCall: parseVerb(word, args) };
  }
}

function parseVerb(verb: VerbCall["verb"], args: string[]): VerbCall {
  const isFollow = (arg: string) => verb === "logs" && (arg === "-f" || arg === "--follow");
  const [target, extra] = args.filter((arg) => !isFollow(arg));
  if (!target) {
    throw new ParseError(
      `muxa ${verb} needs a process name. To run a program named ${verb}, use: muxa -c ${verb}`,
    );
  }
  if (target.startsWith("-")) throw new ParseError(`Unknown option '${target}'`);
  if (extra?.startsWith("-")) throw new ParseError(`Unknown option '${extra}'`);
  if (extra !== undefined) throw new ParseError(`Unexpected argument: ${extra}`);
  return { verb, process: target, follow: args.some(isFollow) || undefined };
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
