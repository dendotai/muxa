import { ChildProcess } from "child_process";

/**
 * Helper class for simulating stdin input in interactive tests
 */
export class StdinSimulator {
  private proc: ChildProcess;
  private outputBuffer = "";
  private outputHandlers: Array<{
    pattern: string | RegExp;
    resolve: (value: string) => void;
    reject: (error: Error) => void;
  }> = [];

  constructor(proc: ChildProcess) {
    this.proc = proc;

    // Collect stdout
    if (proc.stdout) {
      proc.stdout.on("data", (chunk) => {
        this.outputBuffer += chunk.toString();
        this.checkOutputHandlers();
      });
    }

    // Collect stderr
    if (proc.stderr) {
      proc.stderr.on("data", (chunk) => {
        this.outputBuffer += chunk.toString();
        this.checkOutputHandlers();
      });
    }
  }

  /**
   * Write input to the process stdin
   */
  async write(input: string): Promise<void> {
    if (!this.proc.stdin) {
      throw new Error("Process stdin is not available");
    }

    this.proc.stdin.write(input);
    // Give the process time to process the input
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  /**
   * Wait for specific output pattern to appear
   */
  waitForOutput(pattern: string | RegExp, timeout = 5000): Promise<string> {
    return new Promise((resolve, reject) => {
      // Check if pattern already exists in buffer
      const match = this.matchPattern(pattern);
      if (match) {
        resolve(match);
        return;
      }

      // Set up handler for future output
      const handler = { pattern, resolve, reject };
      this.outputHandlers.push(handler);

      // Set up timeout
      const timeoutId = setTimeout(() => {
        const index = this.outputHandlers.indexOf(handler);
        if (index > -1) {
          this.outputHandlers.splice(index, 1);
          reject(new Error(`Timeout waiting for pattern: ${pattern}`));
        }
      }, timeout);

      // Clean up timeout on resolution
      const originalResolve = handler.resolve;
      handler.resolve = (value: string | PromiseLike<string>) => {
        clearTimeout(timeoutId);
        originalResolve(value as string);
      };
    });
  }

  /**
   * Get all output collected so far
   */
  getOutput(): string {
    return this.outputBuffer;
  }

  /**
   * Clear the output buffer
   */
  clearOutput(): void {
    this.outputBuffer = "";
  }

  /**
   * Wait for the process to exit
   */
  async waitForExit(timeout = 5000): Promise<number | null> {
    return new Promise((resolve, reject) => {
      let exited = false;

      const exitHandler = (code: number | null) => {
        exited = true;
        resolve(code);
      };

      this.proc.once("exit", exitHandler);

      setTimeout(() => {
        if (!exited) {
          this.proc.removeListener("exit", exitHandler);
          reject(new Error("Process did not exit within timeout"));
        }
      }, timeout);
    });
  }

  private checkOutputHandlers(): void {
    const handlersToRemove: typeof this.outputHandlers = [];

    for (const handler of this.outputHandlers) {
      const match = this.matchPattern(handler.pattern);
      if (match) {
        handler.resolve(match);
        handlersToRemove.push(handler);
      }
    }

    // Remove resolved handlers
    for (const handler of handlersToRemove) {
      const index = this.outputHandlers.indexOf(handler);
      if (index > -1) {
        this.outputHandlers.splice(index, 1);
      }
    }
  }

  private matchPattern(pattern: string | RegExp): string | null {
    if (typeof pattern === "string") {
      const index = this.outputBuffer.indexOf(pattern);
      if (index >= 0) {
        return this.outputBuffer.slice(index);
      }
    } else {
      const match = this.outputBuffer.match(pattern);
      if (match) {
        return match[0];
      }
    }
    return null;
  }
}

/**
 * Helper function to wait for a pattern in the output
 */
export async function waitForOutput(
  proc: ChildProcess,
  pattern: string | RegExp,
  timeout = 5000,
): Promise<string> {
  const simulator = new StdinSimulator(proc);
  return simulator.waitForOutput(pattern, timeout);
}

/**
 * Helper function to wait for process exit
 */
export async function waitForExit(proc: ChildProcess, timeout = 5000): Promise<number | null> {
  return new Promise((resolve, reject) => {
    let exited = false;

    const exitHandler = (code: number | null) => {
      exited = true;
      resolve(code);
    };

    proc.once("exit", exitHandler);

    setTimeout(() => {
      if (!exited) {
        proc.removeListener("exit", exitHandler);
        reject(new Error("Process did not exit within timeout"));
      }
    }, timeout);
  });
}
