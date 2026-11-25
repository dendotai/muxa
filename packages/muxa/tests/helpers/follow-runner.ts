import { muxaPath, muxaRuntime } from "./constants";

export interface FollowRun {
  /** Everything muxa printed so far */
  output(): string;
  errors(): Promise<string>;
  waitFor(text: string, timeout?: number): Promise<void>;
  running(): boolean;
  /** Let muxa read nothing until `resume`, as a reader that stops does when the pipe is full */
  pause(): void;
  resume(): void;
  /** Stop muxa as Ctrl-C does */
  interrupt(): Promise<void>;
}

const running = new Set<{ kill(): void }>();
// A test that fails before `interrupt` leaves no `muxa logs -f` behind
process.on("exit", () => running.forEach((proc) => proc.kill()));

/** Run `muxa logs` with these arguments and its output in a pipe, until `interrupt` */
export function followLogs(args: string[], cwd: string): FollowRun {
  const proc = Bun.spawn([muxaRuntime, muxaPath, "logs", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  running.add(proc);
  void proc.exited.then(() => running.delete(proc));
  let output = "";
  const ended = (async () => {
    const decoder = new TextDecoder();
    for await (const chunk of proc.stdout) output += decoder.decode(chunk, { stream: true });
  })();

  return {
    output: () => output,
    errors: () => Bun.readableStreamToText(proc.stderr),
    async waitFor(text, timeout = 5000) {
      const deadline = Date.now() + timeout;
      while (!output.includes(text)) {
        if (proc.exitCode !== null || Date.now() > deadline) {
          const exit = proc.exitCode === null ? "" : ` (exit ${proc.exitCode})`;
          proc.kill("SIGKILL");
          throw new Error(
            `No ${JSON.stringify(text)} in the output${exit}:\n${output.slice(-2000)}`,
          );
        }
        await Bun.sleep(20);
      }
    },
    running: () => proc.exitCode === null && proc.signalCode === null,
    pause: () => proc.kill("SIGSTOP"),
    resume: () => proc.kill("SIGCONT"),
    async interrupt() {
      proc.kill("SIGINT");
      await ended;
    },
  };
}
