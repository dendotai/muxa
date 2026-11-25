import * as fs from "fs";
import * as path from "path";
import { ensureMuxaFolder } from "./log-files";
import { confirmPrompt, hasPackageJson } from "./utils";

const LOGS_LINE = "For a process's output under muxa, run `muxa logs <process>`.";

const DECLINED_FILE = path.join(".muxa", "claude-md-line-declined");

/**
 * Ask once whether to add a line about `muxa logs` to the CLAUDE.md in `cwd`, so the project's
 * agents learn to read the processes' output. A no is stored in `.muxa/`, which only a folder with
 * a package.json has.
 */
export async function offerLogsLine(cwd: string): Promise<void> {
  // A script or CI job that starts muxa never waits on input
  if (!process.stdin.isTTY || process.env.MUXA_TEST_SKIP_LOGS_LINE_QUESTION) return;
  if (!hasPackageJson(cwd) || fs.existsSync(path.join(cwd, DECLINED_FILE))) return;
  if (
    ["CLAUDE.md", "AGENTS.md"].some((file) => readText(path.join(cwd, file)).includes("muxa logs"))
  ) {
    return;
  }

  if (await confirmPrompt("Add a line about `muxa logs` to CLAUDE.md?")) {
    const file = path.join(cwd, "CLAUDE.md");
    const text = readText(file).trimEnd();
    fs.writeFileSync(file, text ? `${text}\n\n${LOGS_LINE}\n` : `${LOGS_LINE}\n`);
  } else {
    ensureMuxaFolder(cwd);
    fs.writeFileSync(path.join(cwd, DECLINED_FILE), "");
  }
}

function readText(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}
