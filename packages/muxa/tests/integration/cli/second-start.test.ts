import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import {
  cleanupFixture,
  createRootPackageWorkspace,
  createTempWorkspace,
} from "@tests/helpers/fixture-helpers";
import { LATIN_KEYBOARD_LAYOUT } from "@tests/helpers/constants";
import { endedPid } from "@tests/helpers/ended-pid";
import { runMuxa } from "@tests/helpers/muxa-runner";
import { runInTerminal } from "@tests/helpers/terminal-runner";

const STARTED_AT = Date.UTC(2026, 0, 31, 14, 2);
const TZ = "UTC";
const TERMINAL_ENV = {
  MUXA_TEST_MODE: "true",
  MUXA_TEST_KEYBOARD_LAYOUT: LATIN_KEYBOARD_LAYOUT,
  TZ,
};
const QUESTION =
  "Warning: web already runs in another muxa in this folder (started 14:02). Continue?";

let toDelete: string[] = [];
afterEach(() => {
  toDelete.forEach(cleanupFixture);
  toDelete = [];
});

function createProject() {
  const cwd = createRootPackageWorkspace();
  toDelete.push(cwd);
  return { cwd, dir: path.join(cwd, ".muxa", "logs") };
}

/** A folder with no package.json, in a home folder of its own */
function createHome() {
  const home = fs.realpathSync(createTempWorkspace());
  toDelete.push(home);
  const cwd = path.join(home, "work");
  fs.mkdirSync(cwd);
  const logs = path.join(home, ".local", "state", "muxa", "logs");
  const dir = path.join(logs, cwd.slice(1).replaceAll("_", "__").replaceAll("/", "_"));
  return { cwd, dir, env: { HOME: home, XDG_STATE_HOME: "", XDG_CONFIG_HOME: "" } };
}

/** The record of another run, whose muxa is this test while `pid` is left out; `null` writes no id */
function writeOtherRun(
  dir: string,
  files: string[],
  { pid = process.pid as number | null, startedAt = STARTED_AT, name = "other" } = {},
) {
  fs.mkdirSync(dir, { recursive: true });
  for (const file of files) fs.writeFileSync(path.join(dir, file), "");
  const record = { ...(pid === null ? {} : { pid }), startedAt, files, rotationSize: 1024 };
  fs.writeFileSync(path.join(dir, `run-0000000000001-${name}.json`), JSON.stringify(record));
}

describe("A start beside an open run in the same folder", () => {
  it("asks before it starts a process that the other run has, and starts on y", async () => {
    const { cwd, dir } = createProject();
    writeOtherRun(dir, ["web.log"]);
    const run = runInTerminal(["-c", "echo 1", "web"], {
      cwd,
      env: TERMINAL_ENV,
    });
    await run.waitFor(/Continue\? \(y\/N\)/);
    expect(run.output()).toContain(QUESTION);
    run.type("y");
    expect(await run.exited()).toBe(0);
    expect(run.output()).toContain("Would execute: dekit mprocs");
  });

  for (const [label, key] of [
    ["n", "n"],
    ["Enter", "\r"],
  ]) {
    it(`stops on ${label}`, async () => {
      const { cwd, dir } = createProject();
      writeOtherRun(dir, ["web.log"]);
      const run = runInTerminal(["-c", "echo 1", "web"], {
        cwd,
        env: TERMINAL_ENV,
      });
      await run.waitFor(/Continue\? \(y\/N\)/);
      run.type(key ?? "");
      expect(await run.exited()).toBe(1);
      expect(run.output()).not.toContain("Would execute");
    });
  }

  it("exits with no terminal on its input, and names muxa restart", async () => {
    const { cwd, dir } = createProject();
    writeOtherRun(dir, ["web.log"]);
    const result = await runMuxa(["-c", "echo 1", "web", "-c", "echo 2", "api"], {
      cwd,
      env: { TZ },
    });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "Error: web already runs in another muxa in this folder (started 14:02). To restart it there, run muxa restart web.",
    );
    expect(result.stdout).not.toContain("Would execute");
  });

  it("names each process that the other run has", async () => {
    const { cwd, dir } = createProject();
    writeOtherRun(dir, ["web.log", "api.log"]);
    const result = await runMuxa(["-c", "echo 1", "web", "-c", "echo 2", "api"], { cwd });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("web and api already run in another muxa");
  });

  it("asks in a folder with no package.json", async () => {
    const { cwd, dir, env } = createHome();
    writeOtherRun(dir, ["web.log"]);
    const result = await runMuxa(["-c", "echo 1", "web"], { cwd, env });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("web already runs in another muxa");
  });

  it("starts with no question when no process shares a log file with the other run", async () => {
    const { cwd, dir } = createProject();
    writeOtherRun(dir, ["api.log"]);
    const result = await runMuxa(["-c", "echo 1", "web"], { cwd });
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("starts with no question in a folder with no package.json when no process shares a log file with the other run", async () => {
    const { cwd, dir, env } = createHome();
    writeOtherRun(dir, ["api.log"]);
    const result = await runMuxa(["-c", "echo 1", "web"], { cwd, env });
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("starts with no question when the muxa of the other run has ended, and deletes its record", async () => {
    const { cwd, dir } = createProject();
    writeOtherRun(dir, ["web.log"], { pid: await endedPid() });
    const result = await runMuxa(["-c", "echo 1", "web"], { cwd });
    expect(result.code).toBe(0);
    expect(fs.readdirSync(dir).filter((name) => name.startsWith("run-"))).toEqual([]);
  });

  it("takes a record with no muxa process id, from an older muxa, for an ended run, and deletes it", async () => {
    const { cwd, dir } = createProject();
    writeOtherRun(dir, ["web.log"], { pid: null });
    const result = await runMuxa(["-c", "echo 1", "web"], { cwd });
    expect(result.code).toBe(0);
    expect(fs.readdirSync(dir).filter((name) => name.startsWith("run-"))).toEqual([]);
  });

  it("names the start time of the earliest of the open runs that have the process", async () => {
    const { cwd, dir } = createProject();
    writeOtherRun(dir, ["web.log"], { startedAt: STARTED_AT + 3600_000, name: "later" });
    writeOtherRun(dir, ["web.log"]);
    const result = await runMuxa(["-c", "echo 1", "web"], { cwd, env: { TZ } });
    expect(result.stderr).toContain("(started 14:02)");
  });

  it.if(process.platform === "darwin")(
    "asks when the process differs from the other run's only in case, as the file system of macOS takes them for one file",
    async () => {
      const { cwd, dir } = createProject();
      writeOtherRun(dir, ["web.log"]);
      const result = await runMuxa(["-c", "echo 1", "Web"], { cwd });
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("Web already runs in another muxa");
    },
  );

  it("takes a run for open however old its record is, as after a sleep of the computer", async () => {
    const { cwd, dir } = createProject();
    writeOtherRun(dir, ["web.log"]);
    const old = Date.now() / 1000 - 3600;
    fs.utimesSync(path.join(dir, "run-0000000000001-other.json"), old, old);
    const result = await runMuxa(["-c", "echo 1", "web"], { cwd });
    expect(result.code).toBe(1);
  });
});
