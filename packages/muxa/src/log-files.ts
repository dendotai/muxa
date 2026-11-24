import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const PROJECT_LOG_DIR = ".muxa/logs";

/**
 * A file or folder name can have 255 bytes, and dekit writes no log file, and reports no error, when
 * the name is longer. The rest is room for the suffixes of a duplicate name and of a log file.
 */
const MAX_FILE_NAME_LENGTH = 200;

/** dekit names a log file after the tab name, one ASCII character for each of its characters */
export const MAX_TAB_NAME_LENGTH = MAX_FILE_NAME_LENGTH;

/**
 * The folder for the log files of a run in `cwd`: `.muxa/logs`, relative to `cwd`, when `cwd` has a
 * package.json. Otherwise no project owns the folder, and its logs go to the user's state folder.
 */
export function resolveLogDir(cwd: string): string {
  if (fs.existsSync(path.join(cwd, "package.json"))) return PROJECT_LOG_DIR;

  // The XDG spec has programs ignore a relative XDG_STATE_HOME
  const xdgStateHome = process.env.XDG_STATE_HOME ?? "";
  const stateHome = path.isAbsolute(xdgStateHome)
    ? xdgStateHome
    : path.join(os.homedir(), ".local", "state");

  // A doubled `_` keeps `/a_b` apart from `/a/b`; dekit fills in `{name}` and the like in a log folder
  const folder = cwd.replaceAll("_", "__").replace(/[/\\:{}]/g, "_");
  return path.join(stateHome, "muxa", "logs", lastBytes(folder.replace(/^_/, "") || "_"));
}

/**
 * Start a run in the log file of each process: a start line, after the output of earlier runs.
 * `logDir` is from `resolveLogDir`, and `tabNames` are in the order dekit gets them.
 */
export function startLogFiles(cwd: string, logDir: string, tabNames: string[]): void {
  const dir = path.resolve(cwd, logDir);
  fs.mkdirSync(dir, { recursive: true });

  if (logDir === PROJECT_LOG_DIR) {
    const gitignore = path.join(cwd, ".muxa", ".gitignore");
    if (!fs.existsSync(gitignore)) fs.writeFileSync(gitignore, "*\n");
  }

  const startLine = `=== muxa started ${localDateTime(new Date())} ===\n`;
  const opened: number[] = [];
  try {
    // All files open before the first write, so an unwritable one leaves the others as they were
    for (const name of new Set(logFileNames(tabNames))) {
      opened.push(fs.openSync(path.join(dir, name), "a+"));
    }
    for (const fd of opened) fs.appendFileSync(fd, endsMidLine(fd) ? `\n${startLine}` : startLine);
  } finally {
    for (const fd of opened) fs.closeSync(fd);
  }
}

/**
 * The log file of each process, named as dekit names it: dekit numbers duplicate names, turns each
 * name into a path, numbers duplicate paths, and names the file after the path, without dots at its
 * ends and without a `.log` of its own.
 */
function logFileNames(tabNames: string[]): string[] {
  const names = new Set<string>();
  const paths = new Set<string>();
  return tabNames.map((tabName) => {
    const name = firstFree(names, tabName, (n) => `${tabName} (${n})`);
    const base = name.replace(/[^A-Za-z0-9\-_.]/gu, "_") || "task";
    const taskPath = firstFree(paths, base, (n) => `${base}-${n}`);
    const file = `${taskPath.replace(/^\.+|\.+$/g, "") || "task"}.log`;
    return file.replace(/(\.log)+$/, ".log");
  });
}

/** Adds `base` to `taken`, or the first free `numbered` form of it, and returns the one added. */
function firstFree(taken: Set<string>, base: string, numbered: (n: number) => string): string {
  let candidate = base;
  for (let n = 2; taken.has(candidate); n++) candidate = numbered(n);
  taken.add(candidate);
  return candidate;
}

function lastBytes(name: string): string {
  const bytes = Buffer.from(name).subarray(-MAX_FILE_NAME_LENGTH);
  // The cut can fall inside a character, which then decodes as U+FFFD
  return bytes.toString().replace(/^\uFFFD+/, "");
}

/** A process that was killed can leave its last line without a line end. */
function endsMidLine(fd: number): boolean {
  const { size } = fs.fstatSync(fd);
  if (size === 0) return false;
  const last = Buffer.alloc(1);
  fs.readSync(fd, last, 0, 1, size - 1);
  return last.toString() !== "\n";
}

/** As `date --rfc-3339=seconds` prints it */
function localDateTime(date: Date): string {
  const minutesFromUtc = -date.getTimezoneOffset();
  const atOffset = (ms: number, offset: number) => new Date(ms + offset * 60_000).toISOString();
  const local = atOffset(date.getTime(), minutesFromUtc).slice(0, 19).replace("T", " ");
  const offset = atOffset(0, Math.abs(minutesFromUtc)).slice(11, 16);
  return `${local}${minutesFromUtc < 0 ? "-" : "+"}${offset}`;
}
