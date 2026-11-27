import { muxaPath, muxaRuntime } from "./constants";
import { stripAnsi } from "./strip-ansi";

export interface TerminalRun {
  /** Everything muxa drew so far, with escape sequences removed */
  output(): string;
  /** The same with the escape sequences kept */
  rawOutput(): string;
  /** Type keys as a user would; a line ends with "\r", as the Enter key sends it */
  type(keys: string): void;
  waitFor(pattern: RegExp, timeout?: number): Promise<void>;
  exited(timeout?: number): Promise<number>;
}

/**
 * Run muxa in a pseudo-terminal, so it and dekit see a real TTY, as in a user's terminal.
 * MUXA_TEST_MODE stays unset unless `env` sets it, so muxa starts the real dekit.
 */
export function runInTerminal(
  args: string[],
  { cwd, env = {} }: { cwd: string; env?: Record<string, string> },
): TerminalRun {
  const parentEnv = { ...process.env };
  delete parentEnv.MUXA_TEST_MODE;
  delete parentEnv.MUXA_RUNNING;
  const decoder = new TextDecoder();
  let raw = "";

  const proc = Bun.spawn([muxaRuntime, muxaPath, ...args], {
    cwd,
    // A test of the CLAUDE.md question sets the variable to "", so the question shows
    env: { ...parentEnv, MUXA_TEST_SKIP_LOGS_LINE_QUESTION: "1", ...env },
    terminal: {
      cols: 120,
      rows: 30,
      data(_terminal, data) {
        raw += decoder.decode(data, { stream: true });
      },
    },
  });

  const output = () => stripAnsi(raw);

  return {
    output,
    rawOutput: () => raw,
    type(keys) {
      proc.terminal?.write(keys);
    },
    async waitFor(pattern, timeout = 5000) {
      const deadline = Date.now() + timeout;
      while (!pattern.test(output())) {
        if (proc.exitCode !== null) {
          throw new Error(`muxa exited ${proc.exitCode} before ${pattern}. Output:\n${output()}`);
        }
        if (Date.now() > deadline) {
          proc.kill("SIGKILL");
          throw new Error(
            `Timed out waiting for ${pattern}. Output:\n${output().slice(-2000)}\nRaw:\n${JSON.stringify(raw.slice(-2000))}`,
          );
        }
        await Bun.sleep(25);
      }
    },
    async exited(timeout = 5000) {
      const timer = setTimeout(() => proc.kill("SIGKILL"), timeout);
      const code = await proc.exited;
      clearTimeout(timer);
      if (proc.signalCode === "SIGKILL") {
        throw new Error(`muxa did not exit in ${timeout}ms. Output:\n${output().slice(-2000)}`);
      }
      return code;
    },
  };
}

/** Quit muxa as a user does, and return its exit code */
export async function quit(run: TerminalRun): Promise<number> {
  run.type("q");
  await run.waitFor(/Save and quit/);
  run.type("x");
  return run.exited();
}
