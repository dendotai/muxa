import * as fs from "fs";
import * as path from "path";
import { fileKey } from "./log-files";
import type { LogLimits } from "./settings";

const CHUNK = 64 * 1024;

interface LogPart {
  file: string;
  /** The `<process>.log` file that this is, or that this is the `.1` file of */
  current: string;
  size: number;
  changedAt: number;
}

/**
 * Rotate each log file of this run that reached half of its limit, then free the space above
 * `maxSizeTotal` in `dirs`. An error on one file leaves the others in their limits, and the first
 * error is thrown at the end.
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
      const { size = 0 } = fs.statSync(file, { throwIfNoEntry: false }) ?? {};
      if (size >= half) rotate(file);
    });
  }

  const parts = dirs.flatMap(listParts);
  let total = parts.reduce((sum, { size }) => sum + size, 0);
  if (total >= limits.maxSizeTotal) {
    for (const part of inFreeingOrder(parts, logFiles)) {
      if (total < limits.maxSizeTotal) break;
      attempt(() => {
        // dekit can hold a current log open, also in another run, and then writes on into a deleted file
        if (part.file === part.current) fs.truncateSync(part.file);
        else fs.rmSync(part.file, { force: true });
        total -= part.size;
      });
    }
  }

  if (errors.length > 0) throw errors[0];
}

/** Move the content of a log file that dekit writes to its `.1` file (ADR 0002) */
function rotate(file: string): void {
  const older = `${file}.1`;
  // Before the copy, so the two files take no more than the limit, and a clone finds no file in its place
  fs.rmSync(older, { force: true });
  let from: number | undefined;
  let to: number | undefined;
  try {
    fs.copyFileSync(file, older, fs.constants.COPYFILE_FICLONE);
    from = fs.openSync(file, "r+");
    to = fs.openSync(older, "a");
    const chunk = Buffer.alloc(CHUNK);
    let offset = fs.fstatSync(to).size;
    for (let length; (length = fs.readSync(from, chunk, 0, CHUNK, offset)) > 0; offset += length) {
      fs.appendFileSync(to, chunk.subarray(0, length));
    }
    // A line that dekit writes between the last read and here is lost
    fs.ftruncateSync(from);
  } catch (error) {
    // A part of the copy would repeat lines of the log file
    fs.rmSync(older, { force: true });
    throw error;
  } finally {
    if (from !== undefined) fs.closeSync(from);
    if (to !== undefined) fs.closeSync(to);
  }
}

function listParts(dir: string): LogPart[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isFile() || !/\.log(\.1)?$/.test(entry.name)) return [];
    const file = path.join(dir, entry.name);
    const stat = fs.statSync(file, { throwIfNoEntry: false });
    if (!stat || stat.size === 0) return [];
    const { size, mtimeMs } = stat;
    return [{ file, current: file.replace(/\.1$/, ""), size, changedAt: mtimeMs }];
  });
}

/** The parts of processes that this run does not start come first, and its current logs last */
function inFreeingOrder(parts: LogPart[], logFiles: string[]): LogPart[] {
  const started = new Set(logFiles.map(fileKey));
  const isStarted = ({ current }: LogPart) => started.has(fileKey(current));
  const isCurrent = ({ file, current }: LogPart) => file === current;
  const processSize = ({ current }: LogPart) =>
    parts.reduce((sum, part) => (part.current === current ? sum + part.size : sum), 0);

  return [
    ...parts.filter((part) => !isStarted(part)).sort((a, b) => a.changedAt - b.changedAt),
    ...parts
      .filter((part) => isStarted(part) && !isCurrent(part))
      .sort((a, b) => processSize(b) - processSize(a)),
    ...parts.filter((part) => isStarted(part) && isCurrent(part)).sort((a, b) => b.size - a.size),
  ];
}
