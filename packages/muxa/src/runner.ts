import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import type { TransformedCommand } from "./command-builder";
import { homeFolderName, logFilesOf, type ProcessNames } from "./log-files";
import { ensureMuxaFolder, hasPackageJson, xdgHome } from "./utils";

/** A task of dekit.yaml, with the keys muxa writes */
export interface DekitTask {
  label: string;
  cmd: string | string[];
  cwd: string;
  autostart: true;
  log?: { file: string; mode: "append" };
}

export interface DekitConfig {
  defaults: { env: Record<string, string>; mouse_scroll_speed?: number };
  tasks: Record<string, DekitTask>;
}

/**
 * The folder of the runner for the processes of `cwd` (ADR 0010). dekit names the runner on its
 * screen after this folder, so its name is the process list title.
 */
export function runnerRoot(cwd: string, title: string): string {
  if (hasPackageJson(cwd)) return path.resolve(cwd, ".muxa", folderName(title));
  const state = xdgHome(process.env.XDG_STATE_HOME, ".local/state");
  return path.join(state, "muxa", "runners", homeFolderName(cwd), folderName(title));
}

/** The title with each character a folder name cannot hold, on any OS, turned into `_` */
function folderName(title: string): string {
  // eslint-disable-next-line no-control-regex
  const name = title.replace(/[/\\:*?"<>|\u0000-\u001f]/g, "_");
  return name === "" || name === "." || name === ".." ? "_" : name;
}

/**
 * The dekit.yaml of the processes. `logDir` is absolute, or undefined when muxa writes no log files;
 * `names` are in the order of `commands`.
 */
export function buildDekitConfig(
  commands: TransformedCommand[],
  names: ProcessNames[],
  {
    cwd,
    logDir,
    env,
    mouseScrollSpeed,
  }: { cwd: string; logDir?: string; env: Record<string, string>; mouseScrollSpeed?: number },
): DekitConfig {
  const files = logFilesOf(names);
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
      return [file.replace(/\.log$/, ""), task];
    }),
  );
  return {
    defaults: {
      env,
      ...(mouseScrollSpeed === undefined ? {} : { mouse_scroll_speed: mouseScrollSpeed }),
    },
    tasks,
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
      if (Array.isArray(child)) {
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

/**
 * The roots of `cwd`'s runners under another title: a change of the title moves the root, and the
 * runner under the old one would keep running the same processes.
 */
export function otherRoots(root: string): string[] {
  const parent = path.dirname(root);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(parent, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(parent, entry.name))
    .filter((dir) => dir !== root && fs.existsSync(path.join(dir, "dekit.yaml")));
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
