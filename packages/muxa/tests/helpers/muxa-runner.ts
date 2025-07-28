import { spawn } from "child_process";
import * as path from "path";
import { muxaPath, DEFAULT_TIMEOUT, QUICK_TIMEOUT, FIXTURE_TIMEOUT, TEST_ENV } from "./constants";
import { trackProcess } from "./process-cleanup";

export interface MuxaResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export interface MuxaCommandResult {
  command: string | null;
  error: string | null;
}

// Run muxa in test mode and capture the generated command
// ALWAYS runs in test mode - never executes mprocs
export function getMuxaCommand(args: string[], cwd?: string): Promise<MuxaCommandResult> {
  return new Promise((resolve) => {
    const env = { ...process.env, ...TEST_ENV, MUXA_TEST_MODE: "true" };

    // Use node in CI or when bun might not be available in subprocess PATH
    const runtime = process.env.CI ? "node" : "bun";
    const proc = spawn(runtime, [muxaPath, ...args], {
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

    proc.on("exit", (code) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeoutHandle);

        if (code === 0) {
          // Extract the command from "Would execute: mprocs ..."
          const match = stdout.match(/Would execute: mprocs (.+)/);
          resolve({
            command: match && match[1] ? match[1] : null,
            error: null,
          });
        } else {
          resolve({
            command: null,
            error: stderr,
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
// ALWAYS runs in test mode - never executes mprocs
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

    // Use node in CI or when bun might not be available in subprocess PATH
    const runtime = process.env.CI ? "node" : "bun";
    const proc = spawn(runtime, [muxaPath, ...args], {
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
// ALWAYS runs in test mode - never executes mprocs
export async function runMuxaQuick(args: string[], cwd?: string): Promise<MuxaResult> {
  const env = { ...process.env, ...TEST_ENV, MUXA_TEST_MODE: "true" };

  return new Promise<MuxaResult>((resolve) => {
    // Use node in CI or when bun might not be available in subprocess PATH
    const runtime = process.env.CI ? "node" : "bun";
    const proc = spawn(runtime, [muxaPath, ...args], {
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
// ALWAYS runs in test mode - never executes mprocs
export function runMuxaInFixture(fixture: string, args: string[]): Promise<MuxaResult> {
  const env = { ...process.env, ...TEST_ENV, MUXA_TEST_MODE: "true" };
  const cwd = path.join(__dirname, "..", "fixtures", fixture);

  return new Promise((resolve) => {
    // Use node in CI or when bun might not be available in subprocess PATH
    const runtime = process.env.CI ? "node" : "bun";
    const proc = spawn(runtime, [muxaPath, ...args], {
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
