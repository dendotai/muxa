import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { ensureMuxaFolder, hasPackageJson, xdgHome } from "./utils";

const PROJECT_LOG_DIR = ".muxa/logs";

/** The process of each log file, in a file beside them: a log file's name alone does not give the process's name */
const PROCESSES_FILE = "processes.json";

/**
 * A file or folder name can have 255 bytes, and dekit writes no log file, and reports no error, when
 * the name is longer. The rest is room for the suffixes of a duplicate name and of a log file.
 */
const MAX_FILE_NAME_LENGTH = 200;

/** `startLogFiles` ends it with `\n` alone; the same text in a process's output ends with `\r\n` */
const START_LINE = /(?<=\n)=== muxa started \d{4}-\d\d-\d\d \d\d:\d\d:\d\d[+-]\d\d:\d\d ===(?=\n)/g;

/** dekit names a log file after the tab name, one ASCII character for each of its characters */
export const MAX_TAB_NAME_LENGTH = MAX_FILE_NAME_LENGTH;

/**
 * The folder for the log files of a run in `cwd`: `.muxa/logs`, relative to `cwd`, when `cwd` has a
 * package.json. Otherwise no project owns the folder, and its logs go to the user's state folder.
 */
export function resolveLogDir(cwd: string): string {
  if (hasPackageJson(cwd)) return PROJECT_LOG_DIR;

  // A doubled `_` keeps `/a_b` apart from `/a/b`; dekit fills in `{name}` and the like in a log folder
  const folder = cwd.replaceAll("_", "__").replace(/[/\\:{}]/g, "_");
  return path.join(homeLogDir(), lastBytes(folder.replace(/^_/, "") || "_"));
}

function homeLogDir(): string {
  return path.join(xdgHome(process.env.XDG_STATE_HOME, ".local/state"), "muxa", "logs");
}

/** The folders that share one `maxSizeTotal` with `logDir`, itself included */
export function logDirsInTotal(cwd: string, logDir: string): string[] {
  if (logDir === PROJECT_LOG_DIR) return [path.resolve(cwd, logDir)];
  return fs
    .readdirSync(homeLogDir(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(homeLogDir(), entry.name));
}

/** A process with its name as the user typed it, or its command */
export interface LoggedProcess {
  name: string;
  file: string;
}

/** The name of a process as the user typed it, or its command, and its tab name */
export interface ProcessNames {
  typed: string;
  tabName: string;
}

/**
 * Start a run in the log file of each process: a start line, after the output of earlier runs.
 * `logDir` is from `resolveLogDir`, and `names` are in the order dekit gets them. Returns the paths
 * of the log files.
 */
export function startLogFiles(cwd: string, logDir: string, names: ProcessNames[]): string[] {
  const dir = path.resolve(cwd, logDir);
  fs.mkdirSync(dir, { recursive: true });

  if (logDir === PROJECT_LOG_DIR) ensureMuxaFolder(cwd);

  const files = logFilesOf(names);
  const processes = files.map((file, i): LoggedProcess => ({ name: names[i]?.typed ?? "", file }));
  const earlier = readProcesses(dir).filter(
    (old) =>
      logFileExists(path.join(dir, old.file)) &&
      !processes.some(({ name, file }) => name === old.name || fileKey(file) === fileKey(old.file)),
  );
  const startLine = `=== muxa started ${localDateTime(new Date())} ===\n`;
  const opened: number[] = [];
  try {
    // All files open before the first write, so an unwritable one leaves the others as they were
    for (const { file } of processes) opened.push(fs.openSync(path.join(dir, file), "a+"));
    fs.writeFileSync(path.join(dir, PROCESSES_FILE), JSON.stringify([...processes, ...earlier]));
    for (const fd of opened) fs.appendFileSync(fd, endsMidLine(fd) ? `\n${startLine}` : startLine);
  } finally {
    for (const fd of opened) fs.closeSync(fd);
  }
  return files.map((file) => path.join(dir, file));
}

/**
 * The size of an open log file and the offset of its last start line, if it has one. It reads from
 * the end, because a log file can be too large for memory.
 */
export function lastStartLineOffset(fd: number): { size: number; offset?: number } {
  const CHUNK = 64 * 1024;
  const OVERLAP = 128; // More than a start line, which can begin in one chunk and end in the next
  const { size } = fs.fstatSync(fd);
  for (let end = size; end > 0; end -= CHUNK) {
    const start = Math.max(0, end - CHUNK - OVERLAP);
    const bytes = Buffer.alloc(end - start);
    const length = fs.readSync(fd, bytes, 0, bytes.length, start);
    // In latin1 a byte is a character, so an index is an offset; the first line of the file gets a `\n` before it
    const text = (start === 0 ? "\n" : "") + bytes.toString("latin1", 0, length);
    const last = [...text.matchAll(START_LINE)].pop();
    if (last) return { size, offset: start + last.index - (start === 0 ? 1 : 0) };
  }
  return { size };
}

/** Copy an open file from `offset` to its end, and return the offset of the end */
export function copyFrom(from: number, offset: number, to: number): number {
  const chunk = Buffer.alloc(64 * 1024);
  for (
    let length;
    (length = fs.readSync(from, chunk, 0, chunk.length, offset)) > 0;
    offset += length
  ) {
    fs.appendFileSync(to, chunk.subarray(0, length));
  }
  return offset;
}

/** The processes of the last run and of earlier runs with a log file in `dir`, or none when muxa cannot tell */
export function readProcesses(dir: string): LoggedProcess[] {
  try {
    const processes: unknown = JSON.parse(fs.readFileSync(path.join(dir, PROCESSES_FILE), "utf-8"));
    return Array.isArray(processes) ? processes.filter(isLoggedProcess) : [];
  } catch {
    return [];
  }
}

function isLoggedProcess(value: unknown): value is LoggedProcess {
  const process = value as Partial<LoggedProcess> | null;
  return typeof process?.name === "string" && typeof process.file === "string";
}

/**
 * Add a suffix to each tab name that would give the log file of another name (ADR 0007). `names`
 * holds the typed name and the tab name of each process.
 */
export function separateLogFiles(names: [typed: string, tabName: string][]): ProcessNames[] {
  const clashing = clashingNames(names);
  for (let length = 3; ; length++) {
    const separate = names.map(([typed, tabName]): [string, string] => [
      typed,
      clashing.has(typed) ? withSuffix(typed, tabName, length) : tabName,
    ]);
    // A longer suffix is for a name that happens to equal one with a suffix
    if (clashingNames(separate).size === 0) {
      return separate.map(([typed, tabName]) => ({ typed, tabName }));
    }
  }
}

/** The typed names that cannot keep their tab name, because another name keeps it or its log file */
function clashingNames(names: [typed: string, tabName: string][]): Set<string> {
  const numbered = logFileNames(names.map(([, tabName]) => tabName));
  const claims = names.flatMap(([typed, tabName], i) => {
    const file = logFileName(tabName);
    const rank = `${typed}.log` === file ? 0 : typed === tabName ? 1 : 2;
    const keys = [`tab ${tabName}`, `file ${fileKey(file)}`, `file ${fileKey(numbered[i] ?? "")}`];
    return keys.map((key) => ({ typed, key, rank }));
  });
  const keepers = new Map<string, string>();
  for (const { typed, key } of [...claims].sort((a, b) => a.rank - b.rank)) {
    if (!keepers.has(key)) keepers.set(key, typed);
  }
  return new Set(
    claims.filter(({ typed, key }) => keepers.get(key) !== typed).map(({ typed }) => typed),
  );
}

export function withSuffix(typed: string, tabName: string, length = 3): string {
  const suffix = `-${suffixHash(typed).slice(-length)}`;
  return tabName.slice(0, MAX_TAB_NAME_LENGTH - suffix.length) + suffix;
}

/** Whether `tabName` is a name with the suffix of `typed` */
export function hasSuffix(tabName: string, typed: string): boolean {
  const suffix = /-([a-z0-9]{3,})$/.exec(tabName)?.[1];
  return suffix !== undefined && suffixHash(typed).endsWith(suffix);
}

function suffixHash(typed: string): string {
  return BigInt(`0x${createHash("sha256").update(typed).digest("hex")}`).toString(36);
}

/** Whether a log file exists, or at least its older part */
export function logFileExists(file: string): boolean {
  return fs.existsSync(file) || fs.existsSync(`${file}.1`);
}

/** Two files with one key are one file: the file system of macOS takes `Web.log` and `web.log` for one */
export function fileKey(file: string): string {
  return process.platform === "darwin" ? file.toLowerCase() : file;
}

export function openIfExists(file: string): number | undefined {
  try {
    return fs.openSync(file, "r");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export function fileId(file: number | string | undefined): number | undefined {
  if (file === undefined) return undefined;
  return typeof file === "number"
    ? fs.fstatSync(file).ino
    : fs.statSync(file, { throwIfNoEntry: false })?.ino;
}

/** The log file name of each process, in the order dekit gets them */
export function logFilesOf(names: ProcessNames[]): string[] {
  return logFileNames(names.map(({ tabName }) => tabName));
}

/** The log file of a process with this tab name and no other process beside it */
export function logFileName(tabName: string): string {
  return logFileNames([tabName])[0] ?? "";
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
