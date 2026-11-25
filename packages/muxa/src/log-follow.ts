import * as fs from "fs";
import { setTimeout as sleep } from "timers/promises";
import { fileId, openIfExists } from "./log-files";

/** A rotation comes at most once per second, so a look in between sees each one */
const LOOK_INTERVAL_MS = 100;
/** Many times what it takes from the end of the copy to the empty log file */
const MAX_ROTATION_MS = 1000;
export const CHUNK = 64 * 1024;
/** Enough to compare, and few enough to compare at each read */
const COMPARED_BYTES = 256;
/** More than a rotation loses of a fast writer, so the end of a copy can be found in them */
const MAX_LAST_BYTES = 4 * CHUNK;

/** How far a log file is read: the offset, and the bytes before it, which tell whether the content moved */
export interface ReadPosition {
  offset: number;
  lastBytes: Buffer;
}

export interface FilePart {
  fd: number;
  start: number;
  end: number;
}

export const LOG_START: ReadPosition = { offset: 0, lastBytes: Buffer.alloc(0) };

/** The position at the end of `part`, the bytes of a log file up to `offset` */
export function positionAt(offset: number, part: FilePart): ReadPosition {
  // With no bytes before it, an offset could not be told from one in an emptied file
  if (part.start === part.end) return LOG_START;
  const lastBytes = readBytes(part.fd, Math.max(part.start, part.end - COMPARED_BYTES), part.end);
  return { offset, lastBytes };
}

/**
 * The bytes that a process adds to its log file after `position`, for ever, and an empty buffer
 * whenever there are none yet. `older` is the open `.log.1` file from when `position` was read.
 */
export async function* newOutput(
  file: string,
  position: ReadPosition,
  older: number | undefined,
): AsyncGenerator<Buffer> {
  for (;;) {
    // A deleted file keeps its space on the disk while it is open
    if (older !== undefined && !fs.existsSync(`${file}.1`)) {
      fs.closeSync(older);
      older = undefined;
    }
    const bytes = readNext(file, position);
    // After the read, because a rotation can come before it
    if (bytes && !isRotated(file, older)) {
      position = advance(position, bytes);
      yield bytes;
      if (bytes.length === 0) await sleep(LOOK_INTERVAL_MS);
      continue;
    }

    // muxa empties the log file after a rotation has copied it, so the `.log.1` file is whole
    const copy = openIfExists(`${file}.1`);
    const isNew = fileId(copy) !== fileId(older);
    if (older !== undefined) fs.closeSync(older);
    older = copy;
    // A rotation loses the lines written between its last copy and the empty log file
    if (copy !== undefined && !endsBefore(copy, position)) {
      // More than one rotation came while the reader of muxa's output stopped it
      if (readAfter(copy, position) === undefined) position = LOG_START;
      if (isNew || position.offset > 0) {
        for (let rest; (rest = readAfter(copy, position))?.length; ) {
          position = advance(position, rest);
          yield rest;
        }
      }
    }
    position = LOG_START;
    // Also when the log file is deleted: the next run of muxa writes a new one
    await sleep(LOOK_INTERVAL_MS);
  }
}

function advance({ offset, lastBytes }: ReadPosition, bytes: Buffer): ReadPosition {
  return {
    offset: offset + bytes.length,
    lastBytes: Buffer.concat([lastBytes, bytes]).subarray(-MAX_LAST_BYTES),
  };
}

function readNext(file: string, position: ReadPosition): Buffer | undefined {
  const fd = openIfExists(file);
  if (fd === undefined) return undefined;
  try {
    return readAfter(fd, position);
  } finally {
    fs.closeSync(fd);
  }
}

/** The next bytes of an open file, or `undefined` when the position is not from its content */
function readAfter(fd: number, { offset, lastBytes }: ReadPosition): Buffer | undefined {
  const compared = lastBytes.subarray(-COMPARED_BYTES);
  // In one read, so no rotation comes between the bytes before the position and those after it
  const bytes = readBytes(fd, offset - compared.length, offset + CHUNK);
  if (!bytes.subarray(0, compared.length).equals(compared)) return undefined;
  return bytes.subarray(compared.length);
}

/** Whether an open file ends with bytes that were read before the position */
function endsBefore(fd: number, { offset, lastBytes }: ReadPosition): boolean {
  const { size } = fs.fstatSync(fd);
  const after = offset - size;
  if (after < 0 || after >= lastBytes.length) return false;
  const end = lastBytes.length - after;
  const compared = Math.min(COMPARED_BYTES, end, size);
  return readBytes(fd, size - compared, size).equals(lastBytes.subarray(end - compared, end));
}

/** Whether a rotation emptied the log file since `older` was its `.log.1` file */
function isRotated(file: string, older: number | undefined): boolean {
  return withBoth(
    file,
    // A new file cannot get the id of an open one
    (current, copy) => fileId(copy) !== fileId(older) && !startsWith(current, copy),
  );
}

/**
 * Wait while a log file and its `.log.1` file hold the same lines: a rotation that copied the log
 * file empties it next. Output that repeats itself can look the same, so the wait has an end.
 */
export async function rotationEnd(file: string): Promise<void> {
  const deadline = Date.now() + MAX_ROTATION_MS;
  while (withBoth(file, startsWith) && Date.now() < deadline) await sleep(LOOK_INTERVAL_MS);
}

function withBoth(file: string, check: (current: number, older: number) => boolean): boolean {
  const older = openIfExists(`${file}.1`);
  const current = openIfExists(file);
  try {
    return current !== undefined && older !== undefined && check(current, older);
  } finally {
    for (const fd of [older, current]) if (fd !== undefined) fs.closeSync(fd);
  }
}

/** Whether a log file starts with its `.log.1` file, as until a rotation empties it */
function startsWith(current: number, older: number): boolean {
  const { size } = fs.fstatSync(older);
  if (fs.fstatSync(current).size < size) return false;
  const head = Math.min(size, COMPARED_BYTES);
  return readBytes(current, 0, head).equals(readBytes(older, 0, head));
}

function readBytes(fd: number, start: number, end: number): Buffer {
  const bytes = Buffer.alloc(end - start);
  return bytes.subarray(0, fs.readSync(fd, bytes, 0, bytes.length, start));
}
