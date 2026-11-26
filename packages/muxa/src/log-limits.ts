import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { copyFrom, fileKey } from "./log-files";
import type { LogLimits } from "./settings";

/** A file in the log folder, with the muxa process id, start time, log files, and rotation size of one open run */
const RUN_RECORD = /^run-.*\.json$/;

interface RunRecord {
  pid: number;
  startedAt: number;
  files: string[];
  rotationSize: number;
}

interface SizedFile {
  file: string;
  /** The same for the `.log` and the `.log.1` file of a process */
  processKey: string;
  /** A `.log.1` file, or the copy for it that a killed muxa left */
  isOlder: boolean;
  size: number;
  changedAt: number;
}

export interface OpenRun {
  /** The file name of the record; the one of the run that started first comes first */
  record: string;
  startedAt: number;
  logFileKeys: string[];
  rotationSize: number;
}

/** The check of the log sizes that a run does again and again, and the record that it is open */
export class LogLimiter {
  private readonly record: string;
  private readonly startedAt = Date.now();
  private readonly rotationSize: number;

  constructor(
    private readonly logDir: string,
    private readonly logFiles: string[],
    private readonly limits: LogLimits,
  ) {
    // With a higher limit than the total, a file would be emptied before it is ever rotated
    this.rotationSize = Math.min(limits.maxSizePerProcess, limits.maxSizeTotal) / 2;
    this.record = `run-${this.startedAt}-${randomUUID()}.json`;
  }

  /**
   * Rotate each log file of this run that reached half of its limit, then free the space above
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

    // Without the folder, there are no log files to limit, and no place for the record
    if (!fs.existsSync(this.logDir)) return;
    attempt(() => this.writeRecord());

    const openRuns: OpenRun[] = [];
    for (const dir of dirs) attempt(() => openRuns.push(...listOpenRuns(dir)));

    for (const file of this.logFiles) {
      attempt(() => {
        const stat = fs.lstatSync(file, { throwIfNoEntry: false });
        if (stat?.isFile() && this.rotates(file, stat.size, openRuns)) rotate(file);
      });
    }

    const files: SizedFile[] = [];
    for (const dir of dirs) attempt(() => files.push(...listLogFiles(dir)));
    let total = files.reduce((sum, { size }) => sum + size, 0);
    const { maxSizeTotal } = this.limits;
    if (total >= maxSizeTotal) {
      const openKeys = [
        ...this.logFiles.map(fileKey),
        ...openRuns.flatMap((run) => run.logFileKeys),
      ];
      for (const { file, isOlder, size } of inFreeingOrder(files, openKeys)) {
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

  /** At each check, because a delete of the log folder deletes the record too */
  private writeRecord(): void {
    const file = path.join(this.logDir, this.record);
    if (fs.existsSync(file)) return;
    const record: RunRecord = {
      pid: process.pid,
      startedAt: this.startedAt,
      files: this.logFiles.map((logFile) => path.basename(logFile)),
      rotationSize: this.rotationSize,
    };
    const content = JSON.stringify(record);
    // Renamed, because another run that reads half a record takes this run for an ended one
    fs.writeFileSync(`${file}.tmp`, content);
    fs.renameSync(`${file}.tmp`, file);
  }

  /** Of two open runs with one log file, the first one rotates it: two rotations at one moment lose its content */
  private rotates(file: string, size: number, openRuns: OpenRun[]): boolean {
    const owners = openRuns.filter((run) => run.logFileKeys.includes(fileKey(file)));
    return (
      size >= Math.min(this.rotationSize, ...owners.map((run) => run.rotationSize)) &&
      owners.every(({ record }) => record >= this.record)
    );
  }

  /** The run no longer writes its log files */
  close(): void {
    try {
      fs.rmSync(path.join(this.logDir, this.record), { force: true });
    } catch {
      // The next run deletes a record whose muxa has ended
    }
  }
}

/** The runs with a record in `dir` whose muxa still runs; it deletes the records of the others */
export function listOpenRuns(dir: string): OpenRun[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap((name) => {
    if (!RUN_RECORD.test(name)) return [];
    const file = path.join(dir, name);
    let record: RunRecord;
    try {
      record = JSON.parse(fs.readFileSync(file, "utf-8"));
    } catch {
      // The other run has just deleted it, or another program wrote it
      return [];
    }
    // A record with this muxa's id is its own, or one that an ended muxa with the same id left
    if (record.pid === process.pid) return [];
    // Not the age of the record: after a sleep of the computer, every record is old
    if (!isRunning(record.pid)) {
      fs.rmSync(file, { force: true });
      return [];
    }
    const logFileKeys = record.files.map((logFile) => fileKey(path.join(dir, logFile)));
    return [
      { record: name, startedAt: record.startedAt, logFileKeys, rotationSize: record.rotationSize },
    ];
  });
}

function isRunning(pid: unknown): boolean {
  if (typeof pid !== "number") return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // The process runs under another user
    return (error as NodeJS.ErrnoException).code === "EPERM";
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
    const [, log, older] = /^(.*\.log)(\.1(?:\.tmp)?)?$/s.exec(entry.name) ?? [];
    if (!entry.isFile() || log === undefined) return [];
    const file = path.join(dir, entry.name);
    const stat = fs.statSync(file, { throwIfNoEntry: false });
    if (!stat || stat.size === 0) return [];
    const processKey = fileKey(path.join(dir, log));
    const { size, mtimeMs: changedAt } = stat;
    return [{ file, processKey, isOlder: older !== undefined, size, changedAt }];
  });
}

/** The files of processes that no open run writes come first, and the `.log` files of the open runs last */
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
