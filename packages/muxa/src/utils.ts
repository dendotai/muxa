// Utility functions for muxa

import * as readline from "readline";
import { loadLatinKeyMap } from "./keyboard-layout";

export type KeyAnswer = "yes" | "no" | "default" | "interrupt" | "other";

/**
 * Reads one keypress of the confirmation prompt.
 * `latinKeys` maps a character of a non-Latin layout to the Latin letter of the same key (`loadLatinKeyMap`).
 */
export function answerForKey(
  char: string,
  latinKeys: ReadonlyMap<string, string> | null,
): KeyAnswer {
  if (char === "\r" || char === "\n") return "default";
  if (char === "\x03") return "interrupt";
  const typed = char.toLowerCase();
  const letter = typed === "y" || typed === "n" ? typed : latinKeys?.get(typed);
  if (letter === "y") return "yes";
  if (letter === "n") return "no";
  return "other";
}

const isNonLatinLetter = (char: string) => /^\p{L}$/u.test(char) && !/^[a-z]$/i.test(char);

/**
 * Show a confirmation prompt with single keypress support
 */
export async function confirmPrompt(
  message: string,
  defaultValue: boolean = false,
): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Enable raw mode for single keypress
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }

  const defaultStr = defaultValue ? "Y/n" : "y/N";
  process.stdout.write(`${message} (${defaultStr}): `);

  return new Promise((resolve) => {
    let settled = false;
    let hinted = false;

    const cleanup = () => {
      settled = true;
      if (process.stdin.isTTY) {
        process.stdin.removeListener("data", handleKeypress);
        process.stdin.setRawMode(false);
      }
      rl.close();
    };

    // Started with the prompt, so the lookup's cold start overlaps the user's reading time
    const latinKeys = process.stdin.isTTY ? loadLatinKeyMap() : Promise.resolve(null);

    const handleKey = async (char: string) => {
      let answer = answerForKey(char, null);
      if (answer === "other") {
        answer = answerForKey(char, await latinKeys);
      }
      if (settled) return;

      if (answer === "default") {
        process.stdout.write("\n");
        cleanup();
        resolve(defaultValue);
      } else if (answer === "yes") {
        process.stdout.write("y\n");
        cleanup();
        resolve(true);
      } else if (answer === "no") {
        process.stdout.write("n\n");
        cleanup();
        resolve(false);
      } else if (answer === "interrupt") {
        process.stdout.write("\n");
        cleanup();
        process.exit(1);
      } else if (!hinted && isNonLatinLetter(char)) {
        hinted = true;
        process.stdout.write(`\nPress y or n (switch to a Latin layout) (${defaultStr}): `);
      }
    };

    // Keys typed while muxa is busy (the lookup's cold start blocks it) arrive in one chunk, so each is read in turn
    let reading = Promise.resolve();
    const handleKeypress = (chunk: Buffer) => {
      reading = reading.then(async () => {
        for (const char of chunk.toString()) {
          if (settled) return;
          await handleKey(char);
        }
      });
    };

    const handleLine = (line: string) => {
      const input = line.trim().toLowerCase();

      if (input === "") {
        cleanup();
        resolve(defaultValue);
      } else if (input === "y" || input === "yes") {
        cleanup();
        resolve(true);
      } else if (input === "n" || input === "no") {
        cleanup();
        resolve(false);
      } else {
        process.stdout.write(`Please enter y or n (${defaultStr}): `);
      }
    };

    if (process.stdin.isTTY) {
      process.stdin.on("data", handleKeypress);
    } else {
      rl.on("line", handleLine);
    }
  });
}

/**
 * Check for duplicate tab names and prompt if found
 */
export async function checkDuplicateNames(names: string[]): Promise<boolean> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const name of names) {
    if (seen.has(name)) {
      duplicates.add(name);
    }
    seen.add(name);
  }

  if (duplicates.size > 0) {
    const dupList = Array.from(duplicates).join(", ");
    const message = `Warning: Duplicate tab name${duplicates.size > 1 ? "s" : ""} detected: ${dupList}\nContinue with duplicate names?`;
    return await confirmPrompt(message, false);
  }

  return true;
}

/**
 * Check if tab name contains comma
 */
export function validateTabName(name: string): void {
  if (name.includes(",")) {
    throw new Error(`Tab name '${name}' contains comma. Commas are reserved as separators.`);
  }
}

/**
 * Debug log if MUXA_DEBUG is set
 */
export function debugLog(message: string): void {
  if (process.env.MUXA_DEBUG) {
    console.error(`[muxa debug] ${message}`);
  }
}

/**
 * Check if muxa is already running (nested execution)
 */
export function checkNestedExecution(): void {
  if (process.env.MUXA_RUNNING) {
    throw new Error(
      "Nested muxa execution detected. " +
        "muxa is already running in a parent process. " +
        "This usually happens when a script tries to run muxa.",
    );
  }
}

/**
 * Format error message with helpful context
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
