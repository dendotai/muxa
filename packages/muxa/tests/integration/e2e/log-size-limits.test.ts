import { afterEach, describe, expect, it, setDefaultTimeout } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import {
  cleanupFixture,
  createPackageJson,
  createRootPackageWorkspace,
  createTempWorkspace,
} from "@tests/helpers/fixture-helpers";
import { runMuxa } from "@tests/helpers/muxa-runner";
import { quit, runInTerminal } from "@tests/helpers/terminal-runner";

// Each run starts dekit, and muxa checks the sizes once per second
setDefaultTimeout(30000);

const KB = 1024;
const MB = 1024 * KB;

let toDelete: string[] = [];
afterEach(() => {
  toDelete.forEach(cleanupFixture);
  toDelete = [];
});

function createProject(logs?: { maxSizePerProcess?: string; maxSizeTotal?: string }) {
  const cwd = createRootPackageWorkspace(logs && { muxa: { logs } });
  toDelete.push(cwd);
  const dir = path.join(cwd, ".muxa", "logs");
  fs.mkdirSync(dir, { recursive: true });
  return { cwd, dir };
}

/** A folder with no package.json, in a home folder of its own */
function createHome(settings?: object) {
  const home = fs.realpathSync(createTempWorkspace());
  toDelete.push(home);
  const cwd = path.join(home, "work");
  fs.mkdirSync(cwd);
  const logs = path.join(home, ".local", "state", "muxa", "logs");
  const dir = path.join(logs, cwd.slice(1).replaceAll("_", "__").replaceAll("/", "_"));
  fs.mkdirSync(dir, { recursive: true });
  if (settings) {
    fs.mkdirSync(path.join(home, ".config", "muxa"), { recursive: true });
    fs.writeFileSync(path.join(home, ".config", "muxa", "settings.json"), JSON.stringify(settings));
  }
  return { cwd, dir, logs, env: { HOME: home, XDG_STATE_HOME: "", XDG_CONFIG_HOME: "" } };
}

/** A file of this size, with no content on the disk; `age` orders files by their last change */
function writeLog(file: string, size: number, age = 0) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "");
  fs.truncateSync(file, size);
  const changed = Date.now() / 1000 - 60 * age;
  fs.utimesSync(file, changed, changed);
}

async function waitUntil(condition: () => boolean, what: string, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting until ${what}`);
    await Bun.sleep(20);
  }
}

const size = (file: string) => fs.statSync(file, { throwIfNoEntry: false })?.size;
const read = (file: string) => fs.readFileSync(file, "latin1");

/** Start a process with each name, wait until muxa checked the sizes, and quit */
async function runProcesses(names: string[], options: Parameters<typeof runInTerminal>[1]) {
  const run = runInTerminal(
    names.flatMap((name) => ["-c", "true", name]),
    options,
  );
  await run.waitFor(new RegExp(`(DOWN \\(0\\)[^]*){${names.length}}`));
  expect(await quit(run)).toBe(0);
  return run;
}

describe("rotation of a log file", () => {
  it("moves the output to .log.1 at half of maxSizePerProcess, and muxa logs joins both", async () => {
    const { cwd, dir } = createProject({ maxSizePerProcess: "200KB" });
    const file = path.join(dir, "web.log");
    const run = runInTerminal(
      [
        "-c",
        "seq -f %099.0f 1 1500; until [ -e go ]; do sleep 0.1; done; echo after",
        "web",
        "-c",
        "seq -f %099.0f 1 900",
        "api",
      ],
      { cwd },
    );
    await waitUntil(() => (size(`${file}.1`) ?? 0) > 100 * KB && size(file) === 0, "web rotates");
    fs.writeFileSync(path.join(cwd, "go"), "");
    await waitUntil(() => (size(file) ?? 0) > 0, "web writes on");
    expect(await quit(run)).toBe(0);

    const lines = read(`${file}.1`).split("\r\n");
    expect(lines).toHaveLength(1501);
    expect(lines[1499]).toEndWith("01500");
    expect(read(file)).toBe("after\r\n");
    expect(fs.readdirSync(dir).sort()).toEqual([
      "api.log",
      "processes.json",
      "web.log",
      "web.log.1",
    ]);

    const { stdout } = await runMuxa(["logs", "web"], { cwd });
    expect(stdout).toStartWith("=== muxa started ");
    expect(stdout.split("\n")).toHaveLength(1503);
    expect(stdout).toEndWith("01500\nafter\n");
  });

  it("replaces an earlier .log.1", async () => {
    const { cwd, dir } = createProject({ maxSizePerProcess: "200KB" });
    fs.writeFileSync(path.join(dir, "web.log.1"), "older");
    fs.writeFileSync(path.join(dir, "web.log"), "x".repeat(100 * KB));
    await runProcesses(["web"], { cwd });
    expect(read(path.join(dir, "web.log.1"))).toMatch(/^x+\n=== muxa started .* ===\n$/);
    expect(size(path.join(dir, "web.log"))).toBe(0);
  });

  it("comes at 50 MB in a project and at 25 MB elsewhere, when no Setting sets a limit", async () => {
    const project = createProject();
    const home = createHome();
    for (const [{ cwd, dir, ...rest }, half] of [
      [project, 50 * MB],
      [home, 25 * MB],
    ] as const) {
      // The start line and the line end before it add less than 1 KB
      writeLog(path.join(dir, "under.log"), half - KB);
      writeLog(path.join(dir, "over.log"), half);
      await runProcesses(["under", "over"], { cwd, env: "env" in rest ? rest.env : {} });
      expect(fs.readdirSync(dir).filter((file) => file.endsWith(".1"))).toEqual(["over.log.1"]);
    }
  });

  it("comes at half of maxSizeTotal when that is the smaller limit", async () => {
    const { cwd, dir } = createProject({ maxSizeTotal: "200KB" });
    writeLog(path.join(dir, "web.log"), 100 * KB);
    await runProcesses(["web"], { cwd });
    expect(size(path.join(dir, "web.log.1"))).toBeGreaterThan(100 * KB);
  });

  it("that fails leaves the log file whole, and muxa warns when it quits", async () => {
    const { cwd, dir } = createProject({ maxSizePerProcess: "200KB" });
    fs.mkdirSync(path.join(dir, "web.log.1"));
    writeLog(path.join(dir, "web.log"), 100 * KB);
    writeLog(path.join(dir, "api.log"), 100 * KB);
    const run = await runProcesses(["web", "api"], { cwd });
    expect(size(path.join(dir, "web.log"))).toBeGreaterThan(100 * KB);
    expect(size(path.join(dir, "api.log"))).toBe(0);
    const warnings = run.output().match(/Warning: muxa cannot .*/g);
    expect(warnings).toHaveLength(1);
    expect(warnings?.[0]).toContain(
      "Warning: muxa cannot keep the log files in .muxa/logs under their size limits: ",
    );
  });

  it("loses few lines of a fast writer", async () => {
    const { cwd, dir } = createProject({ maxSizePerProcess: "2MB" });
    const file = path.join(dir, "web.log");
    const run = runInTerminal(["-c", "seq -f %099.0f 1 100000000", "web"], { cwd });
    const older = () => fs.statSync(`${file}.1`, { throwIfNoEntry: false })?.ino;

    const ROTATIONS = 5;
    const lost: number[] = [];
    let rotated = 0;
    for (let seen = older(); lost.length < ROTATIONS; seen = older()) {
      await waitUntil(() => older() !== seen && older() !== undefined, "web rotates");
      // The last line before the rotation and the first one after it can be one line, cut in two
      await waitUntil(() => (size(file) ?? 0) > 10 * KB && older() !== seen, "web writes on");
      await Bun.sleep(100);
      const text = read(`${file}.1`).slice(-10 * KB) + read(file).slice(0, 10 * KB);
      const lines = (text.match(/^\d{99}(?=\r$)/gm) ?? []).map(Number);
      const gaps = lines.slice(1).map((line, i) => line - (lines[i] ?? 0) - 1);
      lost.push(gaps.reduce((sum, gap) => sum + gap, 0));
      rotated = lines.at(-1) ?? 0;
    }
    expect(await quit(run)).toBe(0);

    console.log(`Lines lost in ${ROTATIONS} rotations, of ${rotated} lines: ${lost.join(", ")}`);
    expect(Math.min(...lost)).toBeGreaterThanOrEqual(0);
    expect(lost.reduce((sum, count) => sum + count, 0)).toBeLessThan(rotated / 100);
  });
});

describe("total size of the log files", () => {
  // In KB, with the age that orders the logs of processes the run does not start
  const before = {
    "gone.log.1": [10, 3],
    "past.log": [30, 2],
    "gone.log": [20, 1],
    "web.log.1": [50, 0],
    "web.log": [40, 0],
    "api.log.1": [60, 0],
    "api.log": [15, 0],
  } as const;

  it.each([
    ["226KB", []],
    ["220KB", ["gone.log.1"]],
    ["200KB", ["gone.log.1", "past.log"]],
    ["180KB", ["gone.log.1", "past.log", "gone.log"]],
    ["150KB", ["gone.log.1", "past.log", "gone.log", "web.log.1"]],
    ["100KB", ["gone.log.1", "past.log", "gone.log", "web.log.1", "api.log.1"]],
  ])("stays under %s by freeing %p", async (maxSizeTotal, freed) => {
    const { cwd, dir } = createProject({ maxSizeTotal });
    for (const [file, [kilobytes, age]] of Object.entries(before)) {
      writeLog(path.join(dir, file), kilobytes * KB, age);
    }
    await runProcesses(["web", "api"], { cwd });
    const nowFreed = Object.keys(before).filter((file) => !size(path.join(dir, file)));
    expect(nowFreed).toEqual(freed);
    expect(
      fs
        .readdirSync(dir)
        .filter((file) => file.endsWith(".1"))
        .sort(),
    ).toEqual(["api.log.1", "gone.log.1", "web.log.1"].filter((file) => !freed.includes(file)));
  });

  it("empties the largest current log when only current logs are left", async () => {
    const { cwd, dir } = createProject({ maxSizeTotal: "50KB" });
    for (const [file, kilobytes] of [
      ["a.log", 20],
      ["b.log", 22],
      ["c.log", 20],
    ] as const) {
      writeLog(path.join(dir, file), kilobytes * KB);
    }
    await runProcesses(["a", "b", "c"], { cwd });
    expect(size(path.join(dir, "a.log"))).toBeGreaterThan(20 * KB);
    expect(size(path.join(dir, "b.log"))).toBe(0);
    expect(size(path.join(dir, "c.log"))).toBeGreaterThan(20 * KB);
  });

  it("is 500 MB in a project, when no Setting sets it", async () => {
    const { cwd, dir } = createProject();
    writeLog(path.join(dir, "old.log"), 300 * MB, 2);
    writeLog(path.join(dir, "past.log"), 199 * MB, 1);
    await runProcesses(["web"], { cwd });
    expect(size(path.join(dir, "old.log"))).toBe(300 * MB);
    writeLog(path.join(dir, "more.log"), 1 * MB);
    await runProcesses(["web"], { cwd });
    expect(size(path.join(dir, "old.log"))).toBe(0);
    expect(size(path.join(dir, "past.log"))).toBe(199 * MB);
  });

  it("is 200 MB in all folders with no package.json together, when no Setting sets it", async () => {
    const { cwd, logs, env } = createHome();
    const other = path.join(logs, "another_folder");
    writeLog(path.join(other, "web.log"), 199 * MB, 1);
    await runProcesses(["web"], { cwd, env });
    expect(size(path.join(other, "web.log"))).toBe(199 * MB);
    writeLog(path.join(other, "api.log"), 1 * MB);
    await runProcesses(["web"], { cwd, env });
    expect(size(path.join(other, "web.log"))).toBe(0);
    expect(size(path.join(other, "api.log"))).toBe(1 * MB);
  });

  it("comes from settings.json in a folder with no package.json", async () => {
    const { cwd, logs, env } = createHome({ logs: { maxSizeTotal: "100KB" } });
    writeLog(path.join(logs, "another_folder", "web.log"), 100 * KB, 1);
    await runProcesses(["web"], { cwd, env });
    expect(size(path.join(logs, "another_folder", "web.log"))).toBe(0);
  });

  it("counts no file that muxa did not write, and follows no link", async () => {
    const { cwd, dir } = createProject({ maxSizeTotal: "100KB" });
    writeLog(path.join(dir, "notes.txt"), 200 * KB);
    writeLog(path.join(cwd, "mine.log"), 200 * KB);
    fs.symlinkSync(path.join(cwd, "mine.log"), path.join(dir, "link.log"));
    writeLog(path.join(dir, "old.log"), 50 * KB, 1);
    await runProcesses(["web"], { cwd });
    expect(size(path.join(dir, "old.log"))).toBe(50 * KB);
    expect(size(path.join(dir, "notes.txt"))).toBe(200 * KB);
    expect(size(path.join(cwd, "mine.log"))).toBe(200 * KB);
  });

  it("empties the log of a process of another run, which then writes on in it", async () => {
    const { cwd, dir } = createProject();
    const file = path.join(dir, "other.log");
    const other = runInTerminal(
      ["-c", "seq -f %099.0f 1 450; until [ -e go ]; do sleep 0.1; done; echo after", "other"],
      { cwd },
    );
    await waitUntil(() => (size(file) ?? 0) > 450 * 100, "other writes");
    createPackageJson(cwd, ".", "root", { muxa: { logs: { maxSizeTotal: "100KB" } } });
    writeLog(path.join(dir, "web.log"), 49 * KB);
    writeLog(path.join(dir, "api.log"), 49 * KB);
    await runProcesses(["web", "api"], { cwd });
    fs.writeFileSync(path.join(cwd, "go"), "");
    await waitUntil(() => (size(file) ?? 0) > 0, "other writes on");
    expect(await quit(other)).toBe(0);
    expect(read(file)).toBe("after\r\n");
  });
});
