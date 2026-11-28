import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import type { TransformedCommand } from "./command-builder";
import { homeFolderName, logFilesOf, type ProcessNames } from "./log-files";
import { MUXAD_ENV } from "./muxad";
import { ensureMuxaFolder, hasPackageJson, xdgHome } from "./utils";

/** A task of dekit.yaml, with the keys muxa writes */
export interface DekitTask {
  label: string;
  cmd: string | string[];
  cwd: string;
  autostart: true;
  log?: { file: string; mode: "append" };
}

/** A command of dekit's hooks, as `dekit help config/hooks` lists them */
export type DekitHookCommand =
  | { command: "batch"; commands: DekitHookCommand[] }
  | { command: "remove"; target: string }
  | {
      command: "add";
      target: string;
      spec: { cmd: string[]; cwd: string; env: Record<string, string> };
    };

export interface DekitConfig {
  defaults: { env: Record<string, string>; mouse_scroll_speed?: number };
  tasks: Record<string, DekitTask>;
  on_init?: DekitHookCommand;
}

/** How dekit starts muxad: muxa's own program, in the runner root */
export interface MuxadStart {
  cmd: string[];
  cwd: string;
}

/** In a space of its own, which dekit's screen and a plain `dekit ls` leave out */
export const MUXAD_TASK = "@muxa/muxad";

/**
 * The folder of the runner for the processes of `cwd` (ADR 0010). dekit names the runner on its
 * screen after this folder, so its name is the process list title.
 */
export function runnerRoot(cwd: string, title: string): string {
  return path.join(runnersFolder(cwd), folderName(title));
}

/** The folder that holds a root for each title of `cwd`'s processes */
function runnersFolder(cwd: string): string {
  if (hasPackageJson(cwd)) return path.resolve(cwd, ".muxa");
  const state = xdgHome(process.env.XDG_STATE_HOME, ".local/state");
  return path.join(state, "muxa", "runners", homeFolderName(cwd));
}

/** The title with each character a folder name cannot hold, on any OS, turned into `_` */
function folderName(title: string): string {
  // eslint-disable-next-line no-control-regex
  const name = title.replace(/[/\\:*?"<>|\u0000-\u001f]/g, "_");
  return name === "" || name === "." || name === ".." ? "_" : name;
}

/**
 * The dekit.yaml of the processes. `logDir` is absolute, or undefined when muxa writes no log files;
 * `names` are in the order of `commands`. With `muxad`, the runner adds muxad when it loads.
 */
export function buildDekitConfig(
  commands: TransformedCommand[],
  names: ProcessNames[],
  {
    cwd,
    logDir,
    env,
    mouseScrollSpeed,
    muxad,
  }: {
    cwd: string;
    logDir?: string;
    env: Record<string, string>;
    mouseScrollSpeed?: number;
    muxad?: MuxadStart;
  },
): DekitConfig {
  const files = logFilesOf(names);
  const paths = taskPaths(names);
  const tasks = Object.fromEntries(
    commands.map((command, i): [string, DekitTask] => {
      const file = files[i] ?? "";
      const task: DekitTask = {
        label: names[i]?.typed ?? "",
        // dekit runs no shell: a string is split into words, and a shell's syntax in it is an error
        cmd: command.needsShell ? ["sh", "-c", command.command] : command.command,
        cwd: command.folder ?? cwd,
        autostart: true,
      };
      if (logDir) task.log = { file: path.join(logDir, file), mode: "append" };
      return [paths[i] ?? "", task];
    }),
  );
  return {
    defaults: {
      env,
      ...(mouseScrollSpeed === undefined ? {} : { mouse_scroll_speed: mouseScrollSpeed }),
    },
    tasks,
    ...(muxad && {
      // A config task path cannot hold `@`, and `dekit down` keeps the added task for the next load
      on_init: {
        command: "batch",
        commands: [
          { command: "remove", target: MUXAD_TASK },
          {
            command: "add",
            target: MUXAD_TASK,
            spec: { cmd: muxad.cmd, cwd: muxad.cwd, env: { [MUXAD_ENV]: "1" } },
          },
        ],
      },
    }),
  };
}

/**
 * The config as YAML. Each string is a JSON string, which YAML reads as a double-quoted scalar, so
 * no text in a name or a command can change the structure.
 */
export function toYaml(config: DekitConfig): string {
  const lines: string[] = [];
  const write = (value: unknown, indent: string) => {
    for (const [key, child] of Object.entries(value as object)) {
      if (Array.isArray(child) && child.every((item) => typeof item === "object")) {
        lines.push(`${indent}${JSON.stringify(key)}:`);
        for (const item of child) {
          const first = lines.length;
          write(item, `${indent}    `);
          lines[first] = `${indent}  - ${lines[first]?.trimStart()}`;
        }
      } else if (Array.isArray(child)) {
        lines.push(
          `${indent}${JSON.stringify(key)}: [${child.map((item) => JSON.stringify(item)).join(", ")}]`,
        );
      } else if (typeof child === "object" && child !== null) {
        lines.push(
          `${indent}${JSON.stringify(key)}:${Object.keys(child).length === 0 ? " {}" : ""}`,
        );
        write(child, `${indent}  `);
      } else {
        lines.push(`${indent}${JSON.stringify(key)}: ${JSON.stringify(child)}`);
      }
    }
  };
  write(config, "");
  return `${lines.join("\n")}\n`;
}

export function writeDekitConfig(cwd: string, root: string, config: DekitConfig): string {
  if (hasPackageJson(cwd)) ensureMuxaFolder(cwd);
  fs.mkdirSync(root, { recursive: true });
  const file = path.join(root, "dekit.yaml");
  fs.writeFileSync(file, toYaml(config));
  return file;
}

/** The roots of every runner that a muxa started in `cwd`, under any title */
export function folderRunnerRoots(cwd: string): string[] {
  return rootsIn(runnersFolder(cwd));
}

/**
 * The roots of `cwd`'s runners under another title: a change of the title moves the root, and the
 * runner under the old one would keep running the same processes.
 */
export function otherRoots(root: string): string[] {
  return rootsIn(path.dirname(root)).filter((dir) => dir !== root);
}

function rootsIn(parent: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(parent, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(parent, entry.name))
    .filter((dir) => fs.existsSync(path.join(dir, "dekit.yaml")));
}

/** The dekit.yaml task path of each process */
export function taskPaths(names: ProcessNames[]): string[] {
  return logFilesOf(names).map((file) => file.replace(/\.log$/, ""));
}

/** A task of a runner that runs, as `dekit ls --json` gives it */
export interface RunnerTask {
  path: string;
  state: string;
  spec: Partial<DekitTask>;
}

/** The name of the task as typed, which its label holds */
export function taskName(task: RunnerTask): string {
  return task.spec.label ?? task.path;
}

/** The tasks of the runner in `root`, in the order of its screen, or undefined when it does not run */
export function runnerTasks(dekit: string, root: string): RunnerTask[] | undefined {
  // Without the file, no muxa started a runner here, and dekit need not be asked
  if (!fs.existsSync(path.join(root, "dekit.yaml"))) return undefined;
  const result = spawnSync(dekit, ["-C", root, "ls", "--json"], { encoding: "utf8" });
  if (result.status !== 0) return undefined;
  try {
    return (JSON.parse(result.stdout) as { tasks: RunnerTask[] }).tasks;
  } catch {
    return undefined;
  }
}

/**
 * The tasks of the runner with `tasks` in place of the ones of the same path, then the new ones.
 * A task of an earlier start stays, so `dekit reload --yes` keeps it after it stopped too.
 */
export function mergeTasks(
  running: RunnerTask[],
  tasks: Record<string, DekitTask>,
): Record<string, DekitTask> {
  const merged = Object.fromEntries(
    running.map(({ path: taskPath, spec }): [string, DekitTask] => [
      taskPath,
      tasks[taskPath] ?? {
        label: spec.label ?? taskPath,
        cmd: spec.cmd ?? [],
        cwd: spec.cwd ?? "",
        autostart: true,
        ...(spec.log && { log: { file: spec.log.file, mode: "append" } }),
      },
    ]),
  );
  return { ...merged, ...tasks };
}

export function runnerRuns(dekit: string, root: string): boolean {
  const result = spawnSync(dekit, ["-C", root, "runner", "status", "--json"], { encoding: "utf8" });
  if (result.status !== 0) return false;
  try {
    return (JSON.parse(result.stdout) as { status?: unknown }).status === "running";
  } catch {
    return false;
  }
}
