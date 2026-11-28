import * as fs from "fs";
import * as path from "path";
import { copyFrom, fileKey, LOG_FILE_NAME } from "./log-files";
import type { LogLimits } from "./settings";

interface SizedFile {
  file: string;
  /** The same for the `.log` and the `.log.1` file of a process */
  processKey: string;
  /** A `.log.1` file, or the copy for it that a killed muxa left */
  isOlder: boolean;
  size: number;
  changedAt: number;
}

/** The check of the log sizes that muxad does again and again */
export class LogLimiter {
  private readonly rotationSize: number;

  constructor(
    private readonly logDir: string,
    private readonly logFiles: string[],
    private readonly limits: LogLimits,
  ) {
    // With a higher limit than the total, a file would be emptied before it is ever rotated
    this.rotationSize = Math.min(limits.maxSizePerProcess, limits.maxSizeTotal) / 2;
  }

  /**
   * Rotate each log file of the runner that reached half of its limit, then free the space above
   * `maxSizeTotal` in `dirs`. An error on one file or folder leaves the others in their limits, and
   * the first error is thrown at the end.
   */
  enforce(dirs: string[]): void {
    const errors: unknown[] = [];
    const attempt = (change: () => void) => {
      try {
        change();
      } catch (error) {
        errors.push(error);
      }
    };

    // Without the folder, there are no log files to limit
    if (!fs.existsSync(this.logDir)) return;

    for (const file of this.logFiles) {
      attempt(() => {
        const stat = fs.lstatSync(file, { throwIfNoEntry: false });
        if (stat?.isFile() && stat.size >= this.rotationSize) rotate(file);
      });
    }

    const files: SizedFile[] = [];
    for (const dir of dirs) attempt(() => files.push(...listLogFiles(dir)));
    let total = files.reduce((sum, { size }) => sum + size, 0);
    const { maxSizeTotal } = this.limits;
    if (total >= maxSizeTotal) {
      for (const { file, isOlder, size } of inFreeingOrder(files, this.logFiles.map(fileKey))) {
        if (total < maxSizeTotal) break;
        // Also when it fails: a file that muxa cannot free must not cost the output of the others
        total -= size;
        attempt(() => {
          // dekit can hold a `.log` file open after its muxa was killed, and then writes on into a deleted file
          if (isOlder) fs.rmSync(file, { force: true });
          else fs.truncateSync(file);
        });
      }
    }

    if (errors.length > 0) throw errors[0];
  }
}

/** Move the content of a log file that dekit writes to its `.1` file (ADR 0002) */
function rotate(file: string): void {
  const older = `${file}.1`;
  // Before the copy, so the files take no more than the limit
  fs.rmSync(older, { force: true });

  // `muxa logs` takes a new `.1` file for one that holds the whole log file
  const copy = `${older}.tmp`;
  const from = fs.openSync(file, "r+");
  let to: number | undefined;
  try {
    // Not `copyFileSync`, which never ends when another run empties the log file meanwhile
    to = fs.openSync(copy, "w");
    const offset = copyFrom(from, 0, to);
    fs.renameSync(copy, older);
    copyFrom(from, offset, to);
    // A line that dekit writes between the last read and here is lost
    fs.ftruncateSync(from);
  } catch (error) {
    fs.rmSync(copy, { force: true });
    throw error;
  } finally {
    fs.closeSync(from);
    if (to !== undefined) fs.closeSync(to);
  }
}

function listLogFiles(dir: string): SizedFile[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const [, log, older] = LOG_FILE_NAME.exec(entry.name) ?? [];
    if (!entry.isFile() || log === undefined) return [];
    const file = path.join(dir, entry.name);
    const stat = fs.statSync(file, { throwIfNoEntry: false });
    if (!stat || stat.size === 0) return [];
    const processKey = fileKey(path.join(dir, log));
    const { size, mtimeMs: changedAt } = stat;
    return [{ file, processKey, isOlder: older !== undefined, size, changedAt }];
  });
}

/** The files of processes that the runner does not write come first, and its `.log` files last */
function inFreeingOrder(files: SizedFile[], openKeys: string[]): SizedFile[] {
  const open = new Set(openKeys);
  const isOpen = ({ processKey }: SizedFile) => open.has(processKey);
  const processSizes = new Map<string, number>();
  for (const { processKey, size } of files) {
    processSizes.set(processKey, (processSizes.get(processKey) ?? 0) + size);
  }
  const processSize = ({ processKey }: SizedFile) => processSizes.get(processKey) ?? 0;

  return [
    ...files.filter((file) => !isOpen(file)).sort((a, b) => a.changedAt - b.changedAt),
    ...files
      .filter((file) => isOpen(file) && file.isOlder)
      .sort((a, b) => processSize(b) - processSize(a)),
    ...files.filter((file) => isOpen(file) && !file.isOlder).sort((a, b) => b.size - a.size),
  ];
}
