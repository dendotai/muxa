import { afterEach, describe, expect, it, setDefaultTimeout } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import {
  cleanupFixture,
  createRootPackageWorkspace,
  createTempWorkspace,
} from "@tests/helpers/fixture-helpers";
import { runMuxa } from "@tests/helpers/muxa-runner";
import { quit, runInTerminal } from "@tests/helpers/terminal-runner";

const QUESTION = /Add a line about `muxa logs` to CLAUDE\.md\? \(y\/N\): /;
const LINE = "For a process's output under muxa, run `muxa logs <process>`.";

const toDelete: string[] = [];
afterEach(() => toDelete.splice(0).forEach(cleanupFixture));

function project(files: Record<string, string> = {}): string {
  const dir = createRootPackageWorkspace();
  toDelete.push(dir);
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

const read = (dir: string, name: string) => fs.readFileSync(path.join(dir, name), "utf8");

// Test mode prints the dekit command in place of the screen; the terminal runner skips the question unless asked
function start(cwd: string, env: Record<string, string> = { MUXA_TEST_MODE: "true" }) {
  return runInTerminal(["-c", "echo hi", "api"], {
    cwd,
    env: { ...env, MUXA_TEST_SKIP_LOGS_LINE_QUESTION: "" },
  });
}

async function startWithoutQuestion(cwd: string) {
  const run = start(cwd);
  expect(await run.exited()).toBe(0);
  expect(run.output()).toContain("Would execute: dekit mprocs");
  expect(run.output()).not.toContain("Add a line about");
}

setDefaultTimeout(15000);

describe("The question about a muxa logs line in CLAUDE.md", () => {
  it("adds the line to a new CLAUDE.md on y", async () => {
    const cwd = project();
    const run = start(cwd);
    await run.waitFor(QUESTION);
    run.type("y");
    expect(await run.exited()).toBe(0);
    expect(run.output()).toContain("Would execute: dekit mprocs");
    expect(read(cwd, "CLAUDE.md")).toBe(`${LINE}\n`);
  });

  it("adds the line after the text of an existing CLAUDE.md, as its own paragraph", async () => {
    const cwd = project({ "CLAUDE.md": "# Rules\n\nUse bun." });
    const run = start(cwd);
    await run.waitFor(QUESTION);
    run.type("y");
    expect(await run.exited()).toBe(0);
    expect(read(cwd, "CLAUDE.md")).toBe(`# Rules\n\nUse bun.\n\n${LINE}\n`);
  });

  it("stores n in .muxa/ and does not ask again", async () => {
    const cwd = project({ "CLAUDE.md": "# Rules\n" });
    const run = start(cwd);
    await run.waitFor(QUESTION);
    run.type("n");
    expect(await run.exited()).toBe(0);
    expect(read(cwd, "CLAUDE.md")).toBe("# Rules\n");
    expect(fs.existsSync(path.join(cwd, ".muxa", "claude-md-line-declined"))).toBe(true);
    expect(read(cwd, ".muxa/.gitignore")).toBe("*\n");

    await startWithoutQuestion(cwd);
  });

  it("takes Enter as n", async () => {
    const cwd = project();
    const run = start(cwd);
    await run.waitFor(QUESTION);
    run.type("\r");
    expect(await run.exited()).toBe(0);
    expect(fs.existsSync(path.join(cwd, "CLAUDE.md"))).toBe(false);
    expect(fs.existsSync(path.join(cwd, ".muxa", "claude-md-line-declined"))).toBe(true);
  });

  it("does not ask when CLAUDE.md mentions muxa logs", async () => {
    await startWithoutQuestion(project({ "CLAUDE.md": "Run `muxa logs web` for web.\n" }));
  });

  it("does not ask when AGENTS.md mentions muxa logs", async () => {
    await startWithoutQuestion(project({ "AGENTS.md": "Run muxa logs api.\n" }));
  });

  it("does not ask in a folder with no package.json", async () => {
    const cwd = createTempWorkspace();
    toDelete.push(cwd);
    await startWithoutQuestion(cwd);
    expect(fs.readdirSync(cwd)).toEqual([]);
  });

  it("does not ask, and stores nothing, with no terminal on muxa's input", async () => {
    const cwd = project();
    const result = await runMuxa(["-c", "echo hi", "api"], { cwd });
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("Add a line about");
    expect(fs.readdirSync(cwd).sort()).toEqual(["package.json"]);
  });

  it("starts dekit after the answer", async () => {
    const cwd = project();
    const run = start(cwd, {});
    await run.waitFor(QUESTION);
    run.type("y");
    await run.waitFor(/api/);
    expect(await quit(run)).toBe(0);
    expect(read(cwd, "CLAUDE.md")).toBe(`${LINE}\n`);
  });
});
