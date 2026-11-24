import * as fs from "fs";
import * as path from "path";
import { fileKey } from "./log-files";
import type { LogLimits } from "./settings";

const CHUNK = 64 * 1024;

interface SizedFile {
  file: string;
  /** The same for the `.log` and the `.log.1` file of a process */
  processKey: string;
  isOlder: boolean;
  size: number;
  changedAt: number;
}

/**
 * Rotate each log file of this run that reached half of its limit, then free the space above
 * `maxSizeTotal` in `dirs`. An error on one file or folder leaves the others in their limits, and the
 * first error is thrown at the end.
 */
export function enforceLogLimits(logFiles: string[], dirs: string[], limits: LogLimits): void {
  const errors: unknown[] = [];
  const attempt = (change: () => void) => {
    try {
      change();
    } catch (error) {
      errors.push(error);
    }
  };

  // With a higher limit than the total, a file would be emptied before it is ever rotated
  const half = Math.min(limits.maxSizePerProcess, limits.maxSizeTotal) / 2;
  for (const file of logFiles) {
    attempt(() => {
      const stat = fs.lstatSync(file, { throwIfNoEntry: false });
      if (stat?.isFile() && stat.size >= half) rotate(file);
    });
  }

  const files: SizedFile[] = [];
  for (const dir of dirs) attempt(() => files.push(...listLogFiles(dir)));
  let total = files.reduce((sum, { size }) => sum + size, 0);
  if (total >= limits.maxSizeTotal) {
    for (const { file, isOlder, size } of inFreeingOrder(files, logFiles)) {
      if (total < limits.maxSizeTotal) break;
      // Also when it fails: a file that muxa cannot free must not cost the output of the others
      total -= size;
      attempt(() => {
        // dekit can hold a `.log` file open, also in another run, and then writes on into a deleted file
        if (isOlder) fs.rmSync(file, { force: true });
        else fs.truncateSync(file);
      });
    }
  }

  if (errors.length > 0) throw errors[0];
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

/** Copy a file from `offset` to its end, and return the offset of the end */
function copyFrom(from: number, offset: number, to: number): number {
  const chunk = Buffer.alloc(CHUNK);
  for (let length; (length = fs.readSync(from, chunk, 0, CHUNK, offset)) > 0; offset += length) {
    fs.appendFileSync(to, chunk.subarray(0, length));
  }
  return offset;
}

function listLogFiles(dir: string): SizedFile[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const [, log, older] = /^(.*\.log)(\.1)?$/s.exec(entry.name) ?? [];
    if (!entry.isFile() || log === undefined) return [];
    const file = path.join(dir, entry.name);
    const stat = fs.statSync(file, { throwIfNoEntry: false });
    if (!stat || stat.size === 0) return [];
    const processKey = fileKey(path.join(dir, log));
    const { size, mtimeMs: changedAt } = stat;
    return [{ file, processKey, isOlder: older !== undefined, size, changedAt }];
  });
}

/** The files of processes that this run does not start come first, and its `.log` files last */
function inFreeingOrder(files: SizedFile[], logFiles: string[]): SizedFile[] {
  const started = new Set(logFiles.map(fileKey));
  const isStarted = ({ processKey }: SizedFile) => started.has(processKey);
  const processSizes = new Map<string, number>();
  for (const { processKey, size } of files) {
    processSizes.set(processKey, (processSizes.get(processKey) ?? 0) + size);
  }
  const processSize = ({ processKey }: SizedFile) => processSizes.get(processKey) ?? 0;

  return [
    ...files.filter((file) => !isStarted(file)).sort((a, b) => a.changedAt - b.changedAt),
    ...files
      .filter((file) => isStarted(file) && file.isOlder)
      .sort((a, b) => processSize(b) - processSize(a)),
    ...files.filter((file) => isStarted(file) && !file.isOlder).sort((a, b) => b.size - a.size),
  ];
}
