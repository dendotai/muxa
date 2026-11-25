import { randomUUID } from "crypto";
import { once } from "events";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { StringDecoder } from "string_decoder";
import { possibleTabNames } from "./command-builder";
import {
  copyFrom,
  fileKey,
  hasSuffix,
  lastStartLineOffset,
  type LoggedProcess,
  logFileExists,
  logFileName,
  readProcesses,
  resolveLogDir,
  withSuffix,
} from "./log-files";

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

interface FilePart {
  fd: number;
  start: number;
  end: number;
}

/**
 * Print the output of a process since its last start line.
 */
export async function printLog(cwd: string, nameOrCommand: string): Promise<void> {
  const parts = currentRun(resolveLogFile(cwd, nameOrCommand));
  if (parts.every(({ start, end }) => start === end)) {
    // On stderr, so a pipe gets only the output of the process
    console.error(
      `The log of '${nameOrCommand}' is empty. muxa empties logs to keep them under logs.maxSizeTotal.`,
    );
    return;
  }

  const out = process.stdout;
  // A reader that has enough, such as `head`, closes the pipe
  out.on("error", (error: NodeJS.ErrnoException) => {
    process.exit(error.code === "EPIPE" ? 0 : 1);
  });

  const format = out.isTTY ? keepColors : toPlainText;
  for (const lines of readLines(parts)) {
    const text = lines.map((line) => `${format(lastState(line))}\n`).join("");
    if (text && !out.write(text)) await once(out, "drain");
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

/** The parts of the log files that hold the current run, oldest first */
function currentRun(file: string): FilePart[] {
  const older = openIfExists(`${file}.1`);
  const olderId = fileId(older);
  const current = openIfExists(file);

  const parts: FilePart[] = [];
  for (const fd of [current, older]) {
    if (fd === undefined) continue;
    const { size, offset } = lastStartLineOffset(fd);
    parts.unshift(
      fd === current ? copyPart(fd, offset ?? 0) : { fd, start: offset ?? 0, end: size },
    );
    if (offset !== undefined) break;
  }
  // A new file cannot get the id of an open one, so another id means a rotation came meanwhile
  return [undefined, olderId].includes(fileId(`${file}.1`)) ? parts : currentRun(file);
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

function openIfExists(file: string): number | undefined {
  try {
    return fs.openSync(file, "r");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function fileId(file: number | string | undefined): number | undefined {
  if (file === undefined) return undefined;
  return typeof file === "number"
    ? fs.fstatSync(file).ino
    : fs.statSync(file, { throwIfNoEntry: false })?.ino;
}

/** The lines of the parts as one text, in batches, without their line ends */
function* readLines(parts: FilePart[]): Generator<string[]> {
  const decoder = new StringDecoder("utf8");
  const chunk = Buffer.alloc(64 * 1024);
  let rest = "";
  for (const { fd, start, end } of parts) {
    for (let offset = start, length; offset < end; offset += length) {
      length = fs.readSync(fd, chunk, 0, Math.min(chunk.length, end - offset), offset);
      if (length === 0) break;
      const lines = decoder.write(chunk.subarray(0, length)).split("\n");
      lines[0] = rest + lines[0];
      rest = lines.pop() ?? "";
      yield lines;
    }
  }
  rest += decoder.end();
  if (rest) yield [rest];
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
