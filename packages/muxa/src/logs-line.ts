import * as fs from "fs";
import * as path from "path";
import { confirmPrompt, ensureMuxaFolder, hasPackageJson } from "./utils";

const LOGS_LINE = "For a process's output under muxa, run `muxa logs <process>`.";

const DECLINED_FILE = path.join(".muxa", "claude-md-line-declined");

/**
 * Ask once whether to add a line about `muxa logs` to the CLAUDE.md in `cwd`. A no is stored in
 * `.muxa/`, which only a folder with a package.json has.
 */
export async function offerLogsLine(cwd: string): Promise<void> {
  // A script or CI job that starts muxa never waits on input
  if (!process.stdin.isTTY || process.env.MUXA_TEST_SKIP_LOGS_LINE_QUESTION) return;
  if (!hasPackageJson(cwd) || fs.existsSync(path.join(cwd, DECLINED_FILE))) return;
  const file = path.join(cwd, "CLAUDE.md");
  const text = readIfExists(file);
  if (
    text.includes("muxa logs") ||
    readIfExists(path.join(cwd, "AGENTS.md")).includes("muxa logs")
  ) {
    return;
  }

  if (await confirmPrompt("Add a line about `muxa logs` to CLAUDE.md?")) {
    // Appended, so the rest of the user's file stays byte for byte
    const gap = text === "" || text.endsWith("\n\n") ? "" : text.endsWith("\n") ? "\n" : "\n\n";
    fs.appendFileSync(file, `${gap}${LOGS_LINE}\n`);
  } else {
    ensureMuxaFolder(cwd);
    fs.writeFileSync(path.join(cwd, DECLINED_FILE), "");
  }
}

/** The file's text, or "" when it is missing; any other error throws, so an unreadable file is never written over */
function readIfExists(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}
