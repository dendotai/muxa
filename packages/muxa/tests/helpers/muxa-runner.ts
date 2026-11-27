import { spawn } from "child_process";
import * as path from "path";
import {
  muxaPath,
  muxaRuntime,
  DEFAULT_TIMEOUT,
  QUICK_TIMEOUT,
  FIXTURE_TIMEOUT,
  TEST_ENV,
} from "./constants";
import type { DekitConfig, DekitTask } from "@/runner";
import { trackProcess } from "./process-cleanup";

export interface MuxaResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export interface MuxaCommandResult {
  /** The `cmd` of the first task in dekit.yaml: an argument list when muxa runs it in a shell */
  command: string | string[] | null;
  error: string | null;
}

// Run muxa in test mode and capture the command of its first process
export function getMuxaCommand(args: string[], cwd?: string): Promise<MuxaCommandResult> {
  return new Promise((resolve) => {
    // Don't override env, just add what we need
    const env = {
      ...process.env,
      MUXA_TEST_MODE: "true",
    };

    const proc = spawn(muxaRuntime, [muxaPath, ...args], {
      env,
      cwd: cwd || process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    trackProcess(proc);

    let stdout = "";
    let stderr = "";
    let finished = false;

    // Handle spawn errors (e.g., bun not found)
    proc.on("error", (error) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeoutHandle);
        resolve({
          command: null,
          error: `Failed to spawn process: ${error.message}`,
        });
      }
    });

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeoutHandle);

        if (code === 0) {
          resolve({ command: dekitTasksOf(stdout)?.[0]?.cmd ?? null, error: null });
        } else {
          resolve({
            command: null,
            error: stderr || `Process exited with code ${code}`,
          });
        }
      }
    });

    const timeoutHandle = setTimeout(() => {
      if (!finished) {
        finished = true;
        proc.kill("SIGKILL");
        resolve({
          command: null,
          error: "Timeout after " + QUICK_TIMEOUT + "ms",
        });
      }
    }, QUICK_TIMEOUT);
  });
}

// Run muxa and capture output with configurable timeout
export function runMuxa(
  args: string[],
  options?: {
    cwd?: string;
    timeout?: number;
    env?: Record<string, string>;
  },
): Promise<MuxaResult> {
  return new Promise((resolve) => {
    const cwd = options?.cwd || process.cwd();
    const timeout = options?.timeout || DEFAULT_TIMEOUT;
    // Always ensure MUXA_TEST_MODE is set
    const env = options?.env
      ? { ...process.env, ...options.env, MUXA_TEST_MODE: "true" }
      : { ...process.env, MUXA_TEST_MODE: "true" };

    const proc = spawn(muxaRuntime, [muxaPath, ...args], {
      env,
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    trackProcess(proc);

    // A character can be split between two chunks
    proc.stdout?.setEncoding("utf8");
    proc.stderr?.setEncoding("utf8");
    let stdout = "";
    let stderr = "";
    let finished = false;

    // Handle spawn errors (e.g., bun not found)
    proc.on("error", (error) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeoutHandle);
        resolve({ stdout, stderr: `Failed to spawn process: ${error.message}`, code: -1 });
      }
    });

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    // "close" and not "exit", because output can still arrive after the exit
    proc.on("close", (code) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeoutHandle);
        resolve({ stdout, stderr, code });
      }
    });

    // Kill after timeout to prevent hanging
    const timeoutHandle = setTimeout(() => {
      if (!finished) {
        finished = true;
        proc.kill("SIGKILL");
        resolve({ stdout, stderr: stderr + "\n[Test timeout after " + timeout + "ms]", code: -1 });
      }
    }, timeout);
  });
}

// Quick run with test mode enabled
export async function runMuxaQuick(args: string[], cwd?: string): Promise<MuxaResult> {
  const env = { ...process.env, ...TEST_ENV, MUXA_TEST_MODE: "true" };

  return new Promise<MuxaResult>((resolve) => {
    const proc = spawn(muxaRuntime, [muxaPath, ...args], {
      env,
      cwd: cwd || process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    trackProcess(proc);

    let stdout = "";
    let stderr = "";
    let finished = false;

    // Handle spawn errors (e.g., bun not found)
    proc.on("error", (error) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeoutHandle);
        resolve({ stdout, stderr: `Failed to spawn process: ${error.message}`, code: -1 });
      }
    });

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("exit", (code) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeoutHandle);
        resolve({ stdout, stderr, code });
      }
    });

    const timeoutHandle = setTimeout(() => {
      if (!finished) {
        finished = true;
        proc.kill("SIGKILL");
        resolve({ stdout, stderr: stderr + "\n[Test timeout]", code: -1 });
      }
    }, QUICK_TIMEOUT);
  });
}

// Run muxa in a specific fixture directory
export function runMuxaInFixture(fixture: string, args: string[]): Promise<MuxaResult> {
  const env = { ...process.env, ...TEST_ENV, MUXA_TEST_MODE: "true" };
  const cwd = path.join(__dirname, "..", "fixtures", fixture);

  return new Promise((resolve) => {
    const proc = spawn(muxaRuntime, [muxaPath, ...args], {
      env,
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    trackProcess(proc);

    let stdout = "";
    let stderr = "";
    let finished = false;

    // Handle spawn errors (e.g., bun not found)
    proc.on("error", (error) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeoutHandle);
        resolve({ stdout, stderr: `Failed to spawn process: ${error.message}`, code: -1 });
      }
    });

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("exit", (code) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeoutHandle);
        resolve({ stdout, stderr, code });
      }
    });

    const timeoutHandle = setTimeout(() => {
      if (!finished) {
        finished = true;
        proc.kill("SIGKILL");
        resolve({ stdout, stderr: stderr + "\n[Fixture test timeout]", code: -1 });
      }
    }, FIXTURE_TIMEOUT);
  });
}

/** One process, from the dekit.yaml that test mode prints */
export interface MuxaProcess {
  /** The name as typed, or the default name muxa gives it */
  name: string;
  /** The command, without the shell muxa runs it in */
  command: string;
  /** The absolute folder the command runs in */
  folder: string;
  /** The absolute path of its log file, or null when muxa writes no log files */
  log: string | null;
}

export interface MuxaProcessesResult {
  processes: MuxaProcess[] | null;
  error: string | null;
}

/** The dekit.yaml in test mode's output and the folder muxa would write it in, or null when it printed none */
export function dekitConfigOf(stdout: string): {
  root: string;
  config: DekitConfig;
} | null {
  // `\r?` for the `\r` that a pseudo-terminal adds to each line
  const match = /^Would write (.*)[/\\]dekit\.yaml:\r?\n([\s\S]*?)^Would execute:/m.exec(stdout);
  if (!match) return null;
  return { root: match[1]!, config: Bun.YAML.parse(match[2]!.replaceAll("\r", "")) as never };
}

/** The tasks of the dekit.yaml in test mode's output, in the order muxa starts them, or null when it printed none */
export function dekitTasksOf(stdout: string): DekitTask[] | null {
  const dekit = dekitConfigOf(stdout);
  return dekit && Object.values(dekit.config.tasks);
}

/** The processes of the dekit.yaml in test mode's output, in the order muxa starts them */
export function processesOf(stdout: string): MuxaProcess[] {
  return (dekitTasksOf(stdout) ?? []).map(({ label, cmd, cwd, log }) => ({
    name: label,
    command: Array.isArray(cmd) && cmd[0] === "sh" && cmd[1] === "-c" ? cmd[2]! : String(cmd),
    folder: cwd,
    log: log?.file ?? null,
  }));
}

// Tests of names, commands, and folders read them here, so a change to how muxa starts dekit changes only this helper
export async function getMuxaProcesses(args: string[], cwd?: string): Promise<MuxaProcessesResult> {
  const result = await runMuxa(args, { cwd, timeout: QUICK_TIMEOUT });
  if (result.code !== 0) {
    return { processes: null, error: result.stderr || `Process exited with code ${result.code}` };
  }
  return { processes: processesOf(result.stdout), error: null };
}
