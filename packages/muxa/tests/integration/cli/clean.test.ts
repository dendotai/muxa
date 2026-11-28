import { afterEach, describe, expect, it } from "bun:test";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { dekitBinaryPath } from "@/dekit";
import {
  cleanupFixture,
  createRootPackageWorkspace,
  createTempWorkspace,
} from "@tests/helpers/fixture-helpers";
import { runMuxa } from "@tests/helpers/muxa-runner";
import { quit, runInTerminal } from "@tests/helpers/terminal-runner";

let toDelete: string[] = [];
afterEach(() => {
  toDelete.forEach(cleanupFixture);
  toDelete = [];
});

const track = (dir: string) => {
  toDelete.push(dir);
  return fs.realpathSync(dir);
};

const listFile = (state: string) => path.join(state, "muxa", "log-folders");

/** A project with log files in `.muxa/logs`, listed in the log folder list of `state` */
function projectWithLogs(state: string, files: Record<string, string>) {
  const cwd = track(createRootPackageWorkspace({ muxa: { processListTitle: "dev" } }));
  const logDir = path.join(cwd, ".muxa", "logs");
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(path.join(cwd, ".muxa", ".gitignore"), "*\n");
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(logDir, name), content);
  }
  fs.mkdirSync(path.dirname(listFile(state)), { recursive: true });
  fs.appendFileSync(listFile(state), `${logDir}\n`);
  return { cwd, logDir };
}

const clean = (state: string, args: string[] = []) =>
  runMuxa(["clean", ...args], { env: { XDG_STATE_HOME: state } });

describe("muxa clean", () => {
  it("deletes the log files of every listed folder after -y, and keeps other files", async () => {
    const state = track(createTempWorkspace());
    const { cwd, logDir } = projectWithLogs(state, {
      "web.log": "x".repeat(100),
      "web.log.1": "x".repeat(50),
      "web.log.1.tmp": "x".repeat(10),
      "processes.json": "[]",
    });

    const result = await clean(state, ["-y"]);

    expect(result).toMatchObject({ code: 0, stderr: "" });
    expect(result.stdout).toBe(`160 B  ${logDir}\nDeleted 160 B of log files.\n`);
    expect(fs.readdirSync(logDir)).toEqual(["processes.json"]);
    expect(fs.existsSync(path.join(cwd, ".muxa", ".gitignore"))).toBe(true);
  });

  it("takes --yes as -y", async () => {
    const state = track(createTempWorkspace());
    const { logDir } = projectWithLogs(state, { "web.log": "hi" });
    const result = await clean(state, ["--yes"]);
    expect(result.code).toBe(0);
    expect(fs.readdirSync(logDir)).toEqual([]);
  });

  it("lists each folder with its size, and drops a folder that no longer exists", async () => {
    const state = track(createTempWorkspace());
    const first = projectWithLogs(state, { "web.log": "x".repeat(2048) });
    fs.appendFileSync(listFile(state), "/no/such/folder\n");
    const second = projectWithLogs(state, { "api.log": "x".repeat(3) });

    const result = await clean(state, ["-y"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toBe(
      `2.0 KB  ${first.logDir}\n   3 B  ${second.logDir}\nDeleted 2.0 KB of log files.\n`,
    );
    expect(fs.readFileSync(listFile(state), "utf8")).toBe(`${first.logDir}\n${second.logDir}\n`);
  });

  it("deletes nothing and exits 1 with no terminal on its input and no -y", async () => {
    const state = track(createTempWorkspace());
    const { logDir } = projectWithLogs(state, { "web.log": "hi" });

    const result = await clean(state);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe(`2 B  ${logDir}\n`);
    expect(result.stderr).toBe(
      "Error: muxa clean cannot ask before it deletes, because its input is not a terminal. To delete with no question, run: muxa clean -y\n",
    );
    expect(fs.readdirSync(logDir)).toEqual(["web.log"]);
  });

  it("says so when no folder has log files", async () => {
    const state = track(createTempWorkspace());
    const result = await clean(state, ["-y"]);
    expect(result).toMatchObject({ code: 0, stdout: "No log files to delete.\n", stderr: "" });
  });

  it("empties the log files of a muxa that runs, and keeps the copy that muxad rotates", async () => {
    const state = track(createTempWorkspace());
    const { cwd, logDir } = projectWithLogs(state, {
      "web.log": "hi",
      "web.log.1": "old",
      "web.log.1.tmp": "copy",
    });
    const root = path.join(cwd, ".muxa", "dev");
    fs.mkdirSync(root);
    fs.writeFileSync(
      path.join(root, "dekit.yaml"),
      JSON.stringify({ tasks: { web: { label: "web", cmd: "sleep 30", cwd, autostart: true } } }),
    );
    spawnSync(dekitBinaryPath(), ["-C", root, "up"]);

    const result = await clean(state, ["-y"]);

    expect(result.code).toBe(0);
    expect(fs.readdirSync(logDir).sort()).toEqual(["web.log", "web.log.1.tmp"]);
    expect(fs.statSync(path.join(logDir, "web.log")).size).toBe(0);
  });

  it("deletes after y at the question, and keeps the files after Enter", async () => {
    const state = track(createTempWorkspace());
    const { logDir } = projectWithLogs(state, { "web.log": "hi" });
    const env = { XDG_STATE_HOME: state, MUXA_TEST_MODE: "true" };

    const kept = runInTerminal(["clean"], { cwd: logDir, env });
    await kept.waitFor(/Delete 2 B of log files\? \(y\/N\): /);
    kept.type("\r");
    expect(await kept.exited()).toBe(1);
    expect(fs.readdirSync(logDir)).toEqual(["web.log"]);

    const deleted = runInTerminal(["clean"], { cwd: logDir, env });
    await deleted.waitFor(/\(y\/N\): /);
    deleted.type("y");
    expect(await deleted.exited()).toBe(0);
    expect(fs.readdirSync(logDir)).toEqual([]);
  });
});

describe("the log folder list", () => {
  it("gets the log folder at each start, once", async () => {
    const state = track(createTempWorkspace());
    const cwd = track(createRootPackageWorkspace({ muxa: { processListTitle: "dev" } }));
    for (let start = 0; start < 2; start++) {
      const run = runInTerminal(["-c", "echo hello-from-web", "web"], {
        cwd,
        env: { XDG_STATE_HOME: state },
      });
      await run.waitFor(/hello-from-web/);
      expect(await quit(run)).toBe(0);
    }
    expect(fs.readFileSync(listFile(state), "utf8")).toBe(`${cwd}/.muxa/logs\n`);
  });

  it("does not stop a start that cannot write it", async () => {
    const state = track(createTempWorkspace());
    // A file where the list's folder would be
    fs.writeFileSync(path.join(state, "muxa"), "");
    const cwd = track(createRootPackageWorkspace({ muxa: { processListTitle: "dev" } }));
    const run = runInTerminal(["-c", "echo hello-from-web", "web"], {
      cwd,
      env: { XDG_STATE_HOME: state },
    });
    await run.waitFor(/hello-from-web/);
    expect(await quit(run)).toBe(0);
  });
});
