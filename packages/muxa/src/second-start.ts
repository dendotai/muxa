import * as path from "path";
import { fileKey, logFilesOf, type ProcessNames } from "./log-files";
import { listOpenRuns, type OpenRun } from "./log-limits";
import { confirmPrompt } from "./utils";

/**
 * Ask before a start whose processes write a log file of another open run in `dir` (ADR 0008).
 * With no terminal on the input, it throws. Returns whether to start.
 */
export async function checkOpenRuns(dir: string, names: ProcessNames[]): Promise<boolean> {
  let openRuns: OpenRun[];
  try {
    openRuns = listOpenRuns(dir);
  } catch {
    // The start of the log files then asks whether to continue without them
    return true;
  }
  const files = logFilesOf(names);
  const shared = names.flatMap(({ typed }, i) => {
    const key = fileKey(path.join(dir, files[i] ?? ""));
    const runs = openRuns.filter((run) => run.logFileKeys.includes(key));
    return runs.length > 0
      ? [{ typed, startedAt: Math.min(...runs.map((run) => run.startedAt)) }]
      : [];
  });
  if (shared.length === 0) return true;

  const startedAt = Math.min(...shared.map((name) => name.startedAt));
  const typed = shared.map((name) => name.typed);
  const verb = typed.length === 1 ? "runs" : "run";
  const fact = `${joinNames(typed)} already ${verb} in another muxa in this folder (started ${hoursAndMinutes(startedAt)}).`;

  if (!process.stdin.isTTY) {
    const restart =
      typed.length === 1
        ? `To restart it there, run muxa restart ${typed[0]}.`
        : "To restart one there, run muxa restart <process>.";
    throw new Error(`${fact} ${restart}`);
  }
  return confirmPrompt(`Warning: ${fact} Continue?`, false);
}

function joinNames(names: string[]): string {
  return names.length === 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

function hoursAndMinutes(time: number): string {
  return new Date(time).toTimeString().slice(0, 5);
}
