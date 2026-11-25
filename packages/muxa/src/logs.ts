import { randomUUID } from "crypto";
import { once } from "events";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { StringDecoder } from "string_decoder";
import { possibleTabNames } from "./command-builder";
import {
  copyFrom,
  fileId,
  fileKey,
  hasSuffix,
  lastStartLineOffset,
  type LoggedProcess,
  logFileExists,
  logFileName,
  openIfExists,
  readProcesses,
  resolveLogDir,
  withSuffix,
} from "./log-files";
import { newOutput, positionAt, type ReadPosition, rotationEnd, START } from "./log-follow";

/**
 * The codes of a terminal (ECMA-48): a string such as a title, a control sequence, another escape
 * sequence, or a control character that is not a tab. Node's `stripVTControlCharacters` leaves some
 * of them, takes text with others, and differs between Node versions.
 */
const TERMINAL_CODE =
  // eslint-disable-next-line no-control-regex
  /\x1b[\]PX^_][^\x07\x1b]*(?:\x07|\x1b\\)|(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]|\x1b[ -/]*[0-~]|[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;

const isColor = (code: string) => /^\x1b\[[\d:;]*m$/.test(code); // eslint-disable-line no-control-regex
const toPlainText = (text: string) => text.replace(TERMINAL_CODE, "");
/** Another code would move the cursor or change the terminal */
const keepColors = (text: string) =>
  text.replace(TERMINAL_CODE, (code) => (isColor(code) ? code : ""));

const ERASE_LINE = "\x1b[2K";

/** A line with no line end for this long can be a question, or the last words of a process */
const UNFINISHED_LINE_MS = 2000;

interface FilePart {
  fd: number;
  start: number;
  end: number;
}

/**
 * Print the output of a process since its last start line. With `follow`, it prints on until a
 * signal stops muxa.
 */
export async function printLog(cwd: string, nameOrCommand: string, follow = false): Promise<void> {
  const file = resolveLogFile(cwd, nameOrCommand);
  const { parts, position, older } = await currentRun(file);
  if (parts.every(({ start, end }) => start === end)) {
    // On stderr, so a pipe gets only the output of the process
    console.error(
      `The log of '${nameOrCommand}' is empty. muxa empties logs to keep them under logs.maxSizeTotal.`,
    );
    if (!follow) return;
  }

  const out = process.stdout;
  // A reader that has enough, such as `head`, closes the pipe
  out.on("error", (error: NodeJS.ErrnoException) => {
    process.exit(error.code === "EPIPE" ? 0 : 1);
  });

  const lines = new LineFormatter(out.isTTY ? keepColors : toPlainText);
  const write = async (text: string) => {
    if (text && !out.write(text)) await once(out, "drain");
  };
  for (const bytes of readParts(parts)) await write(lines.add(bytes));
  // An open file that is deleted keeps its space on the disk
  for (const { fd } of parts) if (fd !== older) fs.closeSync(fd);
  if (!follow) {
    await write(lines.end());
    return;
  }

  let changedAt = Date.now();
  for await (const bytes of newOutput(file, position, older)) {
    await write(lines.add(bytes));
    if (bytes.length > 0) changedAt = Date.now();
    else if (Date.now() - changedAt >= UNFINISHED_LINE_MS) {
      await write(lines.unfinished());
      changedAt = Infinity;
    }
  }
}

/** The path of the log file of the process with this name, or with this command and no name */
function resolveLogFile(cwd: string, nameOrCommand: string): string {
  const logDir = resolveLogDir(cwd);
  const dir = path.resolve(cwd, logDir);
  const files = listLogFiles(dir);
  if (files.length === 0) {
    throw new Error(`No log files in ${logDir}. muxa writes them when it starts processes.`);
  }

  const processes = readProcesses(dir);
  const taken = new Set(processes.map(({ file }) => fileKey(file)));
  const unlisted = files.filter((file) => !taken.has(fileKey(file)));
  const file =
    findProcess(processes, nameOrCommand) ??
    possibleTabNames(nameOrCommand)
      .flatMap((tabName) => [withSuffix(nameOrCommand, tabName), tabName])
      .map(logFileName)
      .find((candidate) => unlisted.includes(candidate));
  if (file && logFileExists(path.join(dir, file))) {
    return path.join(dir, file);
  }

  const available = [
    ...processes.map(({ name }) => name),
    ...unlisted.map((name) => name.replace(/\.log$/, "")),
  ];
  throw new Error(
    `No log file for '${nameOrCommand}' in ${logDir}\nAvailable processes: ${[...new Set(available)].join(", ")}`,
  );
}

/** The log file of the process with this name, this command, or this name in the process list */
function findProcess(processes: LoggedProcess[], nameOrCommand: string): string | undefined {
  const named = (name: string) =>
    [
      processes.filter((process) => process.name === name),
      processes.filter((process) => possibleTabNames(process.name).includes(name)),
      processes.filter(
        (process) => hasSuffix(name, process.name) && logFileName(name) === process.file,
      ),
    ].find((matches) => matches.length > 0) ?? [];

  const matches = named(nameOrCommand);
  if (matches.length > 1) {
    throw new Error(
      `${matches.length} processes are named '${nameOrCommand}'. Start each with its own name.`,
    );
  }
  if (matches[0]) return matches[0].file;

  // dekit adds a number to a duplicate name
  const [, name, number] = /^(.+) \((\d+)\)$/s.exec(nameOrCommand) ?? [];
  return name ? named(name)[Number(number) - 1]?.file : undefined;
}

/** The log files in `dir`, with a file that has only its older part left */
function listLogFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((file) => /\.log(\.1)?$/.test(file));
  return [...new Set(files.map((file) => file.replace(/\.1$/, "")))].sort();
}

interface CurrentRun {
  /** The parts of the log files that hold the run, oldest first */
  parts: FilePart[];
  /** The end of the last part */
  position: ReadPosition;
  older: number | undefined;
}

async function currentRun(file: string): Promise<CurrentRun> {
  await rotationEnd(file);
  const older = openIfExists(`${file}.1`);
  const olderId = fileId(older);
  const current = openIfExists(file);

  const parts: FilePart[] = [];
  let position = START;
  for (const fd of [current, older]) {
    if (fd === undefined) continue;
    const { size, offset } = lastStartLineOffset(fd);
    const start = offset ?? 0;
    if (fd === current) {
      const part = copyPart(fd, start);
      parts.push(part);
      position = positionAt(start + part.end - part.start, part);
    } else {
      parts.unshift({ fd, start, end: size });
    }
    if (offset !== undefined) break;
  }
  if (current !== undefined && !parts.some(({ fd }) => fd === current)) fs.closeSync(current);
  // A new file cannot get the id of an open one, so another id means a rotation came meanwhile
  if (![undefined, olderId].includes(fileId(`${file}.1`))) return currentRun(file);
  return { parts, position, older };
}

/**
 * A copy of the log file from `start`, because a rotation empties it while a slow reader takes the
 * output. The older file needs none: a rotation deletes it, and it stays readable while it is open.
 */
function copyPart(fd: number, start: number): FilePart {
  let copy: number | undefined;
  try {
    const file = path.join(os.tmpdir(), `muxa-${randomUUID()}.log`);
    copy = fs.openSync(file, "wx+", 0o600);
    // An open file stays readable, and no way out of muxa leaves it behind
    fs.unlinkSync(file);
    return { fd: copy, start: 0, end: copyFrom(fd, start, copy) - start };
  } catch {
    // With no room for a copy, only a rotation during the output can take lines from it
    if (copy !== undefined) fs.closeSync(copy);
    return { fd, start, end: fs.fstatSync(fd).size };
  }
}

function* readParts(parts: FilePart[]): Generator<Buffer> {
  const chunk = Buffer.alloc(64 * 1024);
  for (const { fd, start, end } of parts) {
    for (let offset = start, length; offset < end; offset += length) {
      length = fs.readSync(fd, chunk, 0, Math.min(chunk.length, end - offset), offset);
      if (length === 0) break;
      yield chunk.subarray(0, length);
    }
  }
}

/** Makes the text to print from the bytes of a log file, line by line */
class LineFormatter {
  private readonly decoder = new StringDecoder("utf8");
  private rest = "";
  /** What `unfinished` gave of the line in `rest` */
  private shown = "";

  constructor(private readonly format: (text: string) => string) {}

  /** The lines that end in `bytes` */
  add(bytes: Buffer): string {
    const lines = this.decoder.write(bytes).split("\n");
    lines[0] = this.rest + lines[0];
    this.rest = lines.pop() ?? "";
    return lines.map((line) => `${this.notShown(line)}\n`).join("");
  }

  /** What is new in the line that has no end yet */
  unfinished(): string {
    const line = this.rest;
    if (toPlainText(lastState(line)) === "") return "";
    const text = this.notShown(line);
    this.shown = this.format(lastState(line));
    return text;
  }

  /** The line that never ended */
  end(): string {
    this.rest += this.decoder.end();
    return this.rest && `${this.notShown(this.rest)}\n`;
  }

  private notShown(line: string): string {
    const text = this.format(lastState(line));
    const shown = this.shown;
    this.shown = "";
    return text.startsWith(shown) ? text.slice(shown.length) : `\n${text}`;
  }
}

/** A progress line goes back to its start, or erases itself, before each new state */
function lastState(line: string): string {
  const erased = line.lastIndexOf(ERASE_LINE);
  const text = erased < 0 ? line : line.slice(erased + ERASE_LINE.length);
  const states = text.split(/\r|\x1b\[1?G/); // eslint-disable-line no-control-regex
  let last = states.length - 1;
  while (last > 0 && !changesLine(states[last] ?? "")) last--;
  return colorsAtEnd(states.slice(0, last)) + states.slice(last).join("");
}

/** The colors that the text of `states` leaves on */
function colorsAtEnd(states: string[]): string {
  const codes = (states.join("").match(TERMINAL_CODE) ?? []).filter(isColor);
  return codes
    .slice(Math.max(codes.lastIndexOf("\x1b[0m"), codes.lastIndexOf("\x1b[m"), 0))
    .join("");
}

function changesLine(state: string): boolean {
  return /\x1b\[[01]?K/.test(state) || toPlainText(state) !== ""; // eslint-disable-line no-control-regex
}
