import * as fs from "fs";
import * as path from "path";
import { dekitBinaryPath } from "./dekit";
import { LOG_FILE_NAME } from "./log-files";
import { rootsIn, runnerRuns } from "./runner";
import { confirmPrompt, muxaStateDir } from "./utils";

function logFolderListFile(): string {
  return path.join(muxaStateDir(), "log-folders");
}

function readLogFolderList(): string[] {
  let text: string;
  try {
    text = fs.readFileSync(logFolderListFile(), "utf8");
  } catch {
    return [];
  }
  // Two starts at once can both add their folder
  return [...new Set(text.split("\n").filter((line) => line !== ""))];
}

/** Add the absolute `logDir` to the log folder list that `muxa clean` reads */
export function recordLogFolder(logDir: string): void {
  if (readLogFolderList().includes(logDir)) return;
  fs.mkdirSync(path.dirname(logFolderListFile()), { recursive: true });
  fs.appendFileSync(logFolderListFile(), `${logDir}\n`);
}

function dropFromLogFolderList(gone: string[]): void {
  const file = logFolderListFile();
  // Read again just before the rename, so a folder that a start added meanwhile stays
  const kept = readLogFolderList().filter((dir) => !gone.includes(dir));
  try {
    // Renamed, because a start that reads half a file adds its folder a second time
    fs.writeFileSync(`${file}.tmp`, kept.map((dir) => `${dir}\n`).join(""));
    fs.renameSync(`${file}.tmp`, file);
  } catch {
    // The next clean drops them
  }
}

/** The roots of the runners whose processes write in `logDir` (ADR 0010) */
function runnerRootsOf(logDir: string): string[] {
  const parent = path.dirname(logDir);
  // From the listed path, so a clean with another XDG_STATE_HOME than the start finds them:
  // `.muxa/logs` sits beside the roots, and `<state>/muxa/logs/<folder>` has them in `<state>/muxa/runners/<folder>`
  if (path.basename(parent) === "logs") {
    return rootsIn(path.join(path.dirname(parent), "runners", path.basename(logDir)));
  }
  return rootsIn(parent);
}

interface LogFolder {
  dir: string;
  /** Its processes run, so dekit holds the `.log` files open and muxad rotates them */
  runs: boolean;
  files: { file: string; size: number }[];
  size: number;
}

function readLogFolder(dekit: string, dir: string): LogFolder {
  const runs = runnerRootsOf(dir).some((root) => runnerRuns(dekit, root));
  const files = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => {
      const [, , older] = LOG_FILE_NAME.exec(entry.name) ?? [];
      // muxad can be writing a `.log.1.tmp` file, and its rotation fails when the file goes
      return entry.isFile() && LOG_FILE_NAME.test(entry.name) && !(runs && older === ".1.tmp");
    })
    .map((entry) => {
      const file = path.join(dir, entry.name);
      return { file, size: fs.statSync(file).size };
    });
  return { dir, runs, files, size: files.reduce((sum, { size }) => sum + size, 0) };
}

function formatSize(bytes: number): string {
  const units = ["KB", "MB", "GB"];
  if (bytes < 1024) return `${bytes} B`;
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(1)} ${units[unit]}`;
}

export async function runClean(yes: boolean): Promise<void> {
  const listed = readLogFolderList();
  const gone = listed.filter((dir) => !fs.existsSync(dir));
  if (gone.length > 0) dropFromLogFolderList(gone);

  const dekit = dekitBinaryPath();
  const folders = listed
    .filter((dir) => !gone.includes(dir))
    .map((dir) => readLogFolder(dekit, dir))
    .filter(({ files }) => files.length > 0);
  if (folders.length === 0) {
    console.log("No log files to delete.");
    return;
  }

  const sizes = folders.map(({ size }) => formatSize(size));
  const width = Math.max(...sizes.map((size) => size.length));
  folders.forEach(({ dir }, i) => console.log(`${(sizes[i] ?? "").padStart(width)}  ${dir}`));
  const total = formatSize(folders.reduce((sum, { size }) => sum + size, 0));

  if (!yes) {
    if (!process.stdin.isTTY) {
      throw new Error(
        "muxa clean cannot ask before it deletes, because its input is not a terminal. To delete with no question, run: muxa clean -y",
      );
    }
    if (!(await confirmPrompt(`Delete ${total} of log files?`))) process.exit(1);
  }

  for (const { runs, files } of folders) {
    for (const { file } of files) {
      // What dekit writes into a deleted file is lost
      if (runs && file.endsWith(".log")) fs.truncateSync(file);
      else fs.rmSync(file, { force: true });
    }
  }
  console.log(`Deleted ${total} of log files.`);
}
