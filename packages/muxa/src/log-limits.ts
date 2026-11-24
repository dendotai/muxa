import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { copyFrom, fileKey } from "./log-files";
import type { LogLimits } from "./settings";

/** A file in the log folder, with the log files of one open run and the size that rotates them; the run writes it at each check */
const RUN_RECORD = /^run-.*\.json$/;

const RUN_RECORD_EXPIRY_MS = 30_000;

interface SizedFile {
  file: string;
  /** The same for the `.log` and the `.log.1` file of a process */
  processKey: string;
  /** A `.log.1` file, or the copy for it that a killed muxa left */
  isOlder: boolean;
  size: number;
  changedAt: number;
}

interface OpenRun {
  /** The file name of the record; the one of the run that started first comes first */
  record: string;
  logFileKeys: string[];
  rotationSize: number;
}

/** The check of the log sizes that a run does again and again, and the record that it is open */
export class LogLimiter {
  private readonly record: string;
  private readonly rotationSize: number;
  private checkedAt = 0;

  constructor(
    private readonly logDir: string,
    private readonly logFiles: string[],
    private readonly limits: LogLimits,
  ) {
    // With a higher limit than the total, a file would be emptied before it is ever rotated
    this.rotationSize = Math.min(limits.maxSizePerProcess, limits.maxSizeTotal) / 2;
    this.record = `run-${Date.now()}-${randomUUID()}.json`;
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
    // After a sleep of the computer, the records of the other open runs look expired until their next check
    const canExpire = Date.now() - this.checkedAt < RUN_RECORD_EXPIRY_MS / 2;
    this.checkedAt = Date.now();

    const openRuns: OpenRun[] = [];
    for (const dir of dirs) attempt(() => openRuns.push(...listOpenRuns(dir, canExpire)));

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

  private writeRecord(): void {
    const file = path.join(this.logDir, this.record);
    const files = this.logFiles.map((logFile) => path.basename(logFile));
    const content = JSON.stringify({ files, rotationSize: this.rotationSize });
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
      // A record that stays expires
    }
  }
}

function listOpenRuns(dir: string, canExpire: boolean): OpenRun[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap((name) => {
    if (!RUN_RECORD.test(name)) return [];
    const file = path.join(dir, name);
    const stat = fs.statSync(file, { throwIfNoEntry: false });
    if (!stat) return [];
    if (canExpire && Date.now() - stat.mtimeMs > RUN_RECORD_EXPIRY_MS) {
      fs.rmSync(file, { force: true });
      return [];
    }
    try {
      const record: { files: string[]; rotationSize: number } = JSON.parse(
        fs.readFileSync(file, "utf-8"),
      );
      const logFileKeys = record.files.map((logFile) => fileKey(path.join(dir, logFile)));
      return [{ record: name, logFileKeys, rotationSize: record.rotationSize }];
    } catch {
      // The other run has just deleted it, or another program wrote it
      return [];
    }
  });
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
