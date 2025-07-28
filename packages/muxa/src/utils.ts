// Utility functions for muxa

import * as readline from "readline";

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
    const cleanup = () => {
      if (process.stdin.isTTY) {
        process.stdin.removeListener("data", handleKeypress);
        process.stdin.setRawMode(false);
      }
      rl.close();
    };

    const handleKeypress = (chunk: Buffer) => {
      const char = chunk.toString();

      // Handle various key inputs
      if (char === "\r" || char === "\n") {
        // Enter key - use default
        process.stdout.write("\n");
        cleanup();
        resolve(defaultValue);
      } else if (char === "y" || char === "Y" || char === "у" || char === "У") {
        // Yes (including Cyrillic у)
        process.stdout.write("y\n");
        cleanup();
        resolve(true);
      } else if (char === "n" || char === "N" || char === "н" || char === "Н") {
        // No (including Cyrillic н)
        process.stdout.write("n\n");
        cleanup();
        resolve(false);
      } else if (char === "\x03") {
        // Ctrl+C
        process.stdout.write("\n");
        cleanup();
        process.exit(1);
      }
      // Ignore other keys
    };

    const handleLine = (line: string) => {
      const input = line.trim().toLowerCase();

      if (input === "" || input === "\n" || input === "\r") {
        // Enter key - use default
        cleanup();
        resolve(defaultValue);
      } else if (input === "y" || input === "yes" || input === "у") {
        // Yes
        cleanup();
        resolve(true);
      } else if (input === "n" || input === "no" || input === "н") {
        // No
        cleanup();
        resolve(false);
      } else {
        // Invalid input - re-prompt
        process.stdout.write(`Please enter y or n (${defaultStr}): `);
      }
    };

    if (process.stdin.isTTY) {
      // TTY mode - handle single keypresses
      process.stdin.on("data", handleKeypress);
    } else {
      // Non-TTY mode - handle full lines
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
