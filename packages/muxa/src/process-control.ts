import { spawnSync } from "child_process";
import { findProcess } from "./logs";
import { folderRunnerRoots, runnerTasks, taskName } from "./runner";

export type ControlVerb = "restart" | "stop" | "start";

const DONE: Record<ControlVerb, string> = {
  restart: "Restarted",
  stop: "Stopped",
  start: "Started",
};

/**
 * Restart, stop, or start the process of this name in the runner of `cwd`, through dekit's command
 * of the same name (ADR 0010). It takes the names `muxa logs` takes.
 */
export function controlProcess(dekit: string, cwd: string, verb: ControlVerb, name: string): void {
  const runners = folderRunnerRoots(cwd).flatMap((root) => {
    const tasks = runnerTasks(dekit, root);
    return tasks ? [{ root, tasks }] : [];
  });

  const matches = runners.flatMap(({ root, tasks }) => {
    const processes = tasks.map((task) => ({
      name: taskName(task),
      file: `${task.path}.log`,
    }));
    const file = findProcess(processes, name);
    return file ? [{ root, task: file.replace(/\.log$/, "") }] : [];
  });

  const [match] = matches;
  if (!match) {
    const names = [...new Set(runners.flatMap(({ tasks }) => tasks.map(taskName)))];
    throw new Error(
      `No muxa in this folder runs '${name}'. Start it with muxa first.` +
        (names.length > 0 ? `\nRunning processes: ${names.join(", ")}` : ""),
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `'${name}' runs in ${matches.length} muxa sessions in this folder. Quit all but one, then run the command again.`,
    );
  }

  const result = spawnSync(dekit, ["-C", match.root, verb, match.task], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    const reason = result.error?.message ?? (result.stderr || result.stdout).trim();
    throw new Error(`muxa cannot reach the muxa that runs '${name}': ${reason}`);
  }
  console.log(`${DONE[verb]} ${name}`);
}
