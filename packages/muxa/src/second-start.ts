import type { DekitTask, RunnerTask } from "./runner";
import { confirmPrompt } from "./utils";

/** The states of `dekit ls` for a task that does not run */
const ENDED_STATES = ["idle", "exited", "done", "backoff"];

/** What a start does in a runner that runs: the task paths it starts and the ones it restarts */
export interface Join {
  start: string[];
  restart: string[];
}

/**
 * Join the runner of the folder (ADR 0010): a task with the same command runs on, or starts again
 * when it ended; a new one starts, and one with another command restarts after a yes. Returns
 * undefined on a No, which is the answer with no terminal on the input.
 */
export async function joinRunner(
  running: RunnerTask[],
  tasks: Record<string, DekitTask>,
): Promise<Join | undefined> {
  const join: Join = { start: [], restart: [] };
  for (const [taskPath, task] of Object.entries(tasks)) {
    const runnerTask = running.find(({ path }) => path === taskPath);
    if (!runnerTask) {
      join.start.push(taskPath);
      continue;
    }
    const current = runnerTask.spec;
    if (sameCommand(current, task)) {
      if (ENDED_STATES.includes(runnerTask.state)) join.start.push(taskPath);
      continue;
    }
    const question = `${task.label} already runs "${commandText(current.cmd)}" in this folder. Replace it with "${commandText(task.cmd)}"?`;
    if (!process.stdin.isTTY) {
      console.error(`${question} (y/N): N`);
      return undefined;
    }
    if (!(await confirmPrompt(question, false))) return undefined;
    join.restart.push(taskPath);
  }
  return join;
}

function sameCommand(current: Partial<DekitTask>, task: DekitTask): boolean {
  return (
    JSON.stringify(words(current.cmd)) === JSON.stringify(words(task.cmd)) &&
    current.cwd === task.cwd
  );
}

/** dekit splits a string `cmd` into words, and `dekit ls` gives the words */
function words(cmd: DekitTask["cmd"] | undefined): string[] {
  return typeof cmd === "string" ? cmd.split(/\s+/).filter(Boolean) : (cmd ?? []);
}

/** The command as the user typed it: without the `sh -c` that muxa wraps it in */
function commandText(cmd: DekitTask["cmd"] | undefined): string {
  if (typeof cmd === "string") return cmd;
  if (cmd?.length === 3 && cmd[0] === "sh" && cmd[1] === "-c") return cmd[2] ?? "";
  return (cmd ?? []).join(" ");
}
