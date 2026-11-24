import { afterEach, describe, expect, it, setDefaultTimeout } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import {
  cleanupFixture,
  createPackageJson,
  createRootPackageWorkspace,
  createTempWorkspace,
} from "@tests/helpers/fixture-helpers";
import { muxaPath, muxaRuntime } from "@tests/helpers/constants";
import { runMuxa } from "@tests/helpers/muxa-runner";
import { quit, runInTerminal } from "@tests/helpers/terminal-runner";

// Each run starts dekit, and muxa checks the sizes once per second
setDefaultTimeout(30000);

const START_LINE = "=== muxa started 2026-01-31 09:30:00+01:00 ===\n".length;
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
function createHome(settings?: { logs: { maxSizeTotal: string } }) {
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

/** In a log file, where a pseudo-terminal ends a line with \r\n, and on macOS now and then with \r\r\n */
const LINE = 101;

/** A command that prints one number on each line */
const numbers = (from: number, to: number) =>
  `awk 'BEGIN { for (i = ${from}; i <= ${to}; i++) printf "%099d\\n", i }'`;

/** A command that waits for a file */
const until = (name: string) => `until [ -e ${name} ]; do sleep 0.1; done`;

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
  it("comes from one of two runs that write it", async () => {
    const { cwd, dir } = createProject({ maxSizePerProcess: "20MB" });
    const file = path.join(dir, "web.log");
    const start = () =>
      runInTerminal(["-c", `${until("go")}; ${numbers(1, 60_000)}`, "web"], { cwd });
    const runs = [start(), start()];
    const records = () => fs.readdirSync(dir).filter((name) => name.startsWith("run-"));
    await waitUntil(() => records().length === 2, "both run");
    await Bun.sleep(1500);
    fs.writeFileSync(path.join(cwd, "go"), "");
    await waitUntil(() => (size(`${file}.1`) ?? 0) > 10 * MB, "web rotates");
    for (const run of runs) await run.waitFor(/DOWN \(0\)/, 10000);
    for (const run of runs) expect(await quit(run)).toBe(0);
    expect((size(`${file}.1`) ?? 0) + (size(file) ?? 0)).toBeGreaterThan(120_000 * 100 * 0.99);
    expect(records()).toEqual([]);
  });

  it("moves the output to .log.1 at half of maxSizePerProcess, and muxa logs joins both", async () => {
    const { cwd, dir } = createProject({ maxSizePerProcess: "200KB" });
    const file = path.join(dir, "web.log");
    const run = runInTerminal(
      [
        "-c",
        `${numbers(1, 1000)}; ${until("more")}; ${numbers(1001, 1050)}; ${until("after")}; echo after`,
        "web",
        "-c",
        numbers(1, 900),
        "api",
      ],
      { cwd },
    );
    await waitUntil(() => (size(file) ?? 0) >= 1000 * LINE + START_LINE, "web writes");
    // Two checks of the sizes
    await Bun.sleep(2100);
    expect(size(`${file}.1`)).toBeUndefined();
    fs.writeFileSync(path.join(cwd, "more"), "");
    await waitUntil(() => size(`${file}.1`) !== undefined && size(file) === 0, "web rotates");
    fs.writeFileSync(path.join(cwd, "after"), "");
    await waitUntil(() => (size(file) ?? 0) > 0, "web writes on");
    expect(await quit(run)).toBe(0);

    expect(read(`${file}.1`)).toEndWith(`${"1050".padStart(99, "0")}\r\n`);
    expect(read(file)).toBe("after\r\n");
    expect(fs.readdirSync(dir).sort()).toEqual([
      "api.log",
      "processes.json",
      "web.log",
      "web.log.1",
    ]);

    const { stdout } = await runMuxa(["logs", "web"], { cwd });
    const [startLine, ...lines] = stdout.split("\n");
    expect(startLine).toStartWith("=== muxa started ");
    expect(lines).toEqual([
      ...Array.from({ length: 1050 }, (_, i) => String(i + 1).padStart(99, "0")),
      "after",
      "",
    ]);
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
    const run = runInTerminal(["-c", numbers(1, 100_000_000), "web"], { cwd });
    // Each rotation brings another first line; a new file can get the inode of the old one
    const older = () => (size(`${file}.1`) ? read(`${file}.1`).slice(0, 200) : "");

    const ROTATIONS = 5;
    const lost: number[] = [];
    let last = 0;
    for (let seen = ""; lost.length < ROTATIONS; seen = older()) {
      await waitUntil(() => older() !== seen, "web rotates");
      await waitUntil(() => (size(file) ?? Infinity) < 500 * KB, "web is empty", 1000);
      await waitUntil(() => (size(file) ?? 0) > 10 * KB, "web writes on");
      // The last line before the rotation and the first one after it can be one line, cut in two
      const text = read(`${file}.1`).slice(-10 * KB) + read(file).slice(0, 10 * KB);
      const lines = (text.match(/^\d{99}(?=\r$)/gm) ?? []).map(Number);
      const gaps = lines.slice(1).map((line, i) => line - (lines[i] ?? 0) - 1);
      lost.push(gaps.reduce((sum, gap) => sum + gap, 0));
      last = lines.at(-1) ?? 0;
    }
    expect(await quit(run)).toBe(0);

    console.log(`Lines lost in ${ROTATIONS} rotations, of ${last} lines: ${lost.join(", ")}`);
    expect(Math.min(...lost)).toBeGreaterThanOrEqual(0);
    expect(lost.reduce((sum, count) => sum + count, 0)).toBeLessThan(last / 100);
  });
});

describe("muxa logs beside a rotation", () => {
  it("prints each line once to a reader that stops during two rotations", async () => {
    const { cwd, dir } = createProject({ maxSizePerProcess: "8MB" });
    const file = path.join(dir, "web.log");
    // Under half of the limit, and more than a pipe holds
    const COUNT = 40000;
    const run = runInTerminal(
      [
        "-c",
        `${numbers(1, COUNT)}; ${until("go")}; ${numbers(1, COUNT)}; ${until("again")}; ${numbers(1, COUNT * 2)}`,
        "web",
      ],
      { cwd },
    );
    await waitUntil(() => (size(file) ?? 0) >= COUNT * LINE + START_LINE, "web writes");
    const logs = Bun.spawn([muxaRuntime, muxaPath, "logs", "web"], { cwd, stdout: "pipe" });
    const reader = logs.stdout.getReader();
    const decoder = new TextDecoder();
    let text = decoder.decode((await reader.read()).value);
    for (const go of ["go", "again"]) {
      const first = size(`${file}.1`) ? read(`${file}.1`).slice(0, 200) : "";
      fs.writeFileSync(path.join(cwd, go), "");
      await waitUntil(
        () => (size(`${file}.1`) ? read(`${file}.1`).slice(0, 200) : "") !== first,
        "web rotates",
      );
      await waitUntil(() => (size(file) ?? Infinity) < 4 * MB, "web is empty");
    }
    for (let chunk; !(chunk = await reader.read()).done; ) text += decoder.decode(chunk.value);
    expect(await quit(run)).toBe(0);

    const lines = text.split("\n").slice(1, -1);
    expect(lines.length).toBe(COUNT);
    expect(lines.findIndex((line, i) => Number(line) !== i + 1)).toBe(-1);
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

  it("counts only log files, and follows no link", async () => {
    const { cwd, dir } = createProject({ maxSizeTotal: "100KB" });
    writeLog(path.join(dir, "notes.txt"), 200 * KB);
    writeLog(path.join(cwd, "mine.log"), 200 * KB);
    fs.symlinkSync(path.join(cwd, "mine.log"), path.join(dir, "link.log"));
    writeLog(path.join(dir, "old.log"), 50 * KB, 1);
    await runProcesses(["web", "link"], { cwd });
    expect(size(path.join(dir, "old.log"))).toBe(50 * KB);
    expect(size(path.join(dir, "notes.txt"))).toBe(200 * KB);
    expect(size(path.join(cwd, "mine.log"))).toBeGreaterThan(200 * KB);
  });

  it("frees only as much as needed beside a file and a folder that muxa cannot change", async () => {
    const { cwd, logs, env } = createHome({ logs: { maxSizeTotal: "100KB" } });
    const locked = path.join(logs, "locked_folder");
    writeLog(path.join(logs, "another_folder", "locked.log"), 200 * KB, 3);
    writeLog(path.join(logs, "another_folder", "old.log"), 60 * KB, 2);
    writeLog(path.join(logs, "another_folder", "past.log"), 60 * KB, 1);
    writeLog(path.join(locked, "web.log"), 200 * KB, 4);
    fs.chmodSync(path.join(logs, "another_folder", "locked.log"), 0o444);
    fs.chmodSync(locked, 0o000);
    const run = await runProcesses(["web"], { cwd, env });
    fs.chmodSync(locked, 0o755);
    expect(size(path.join(logs, "another_folder", "old.log"))).toBe(0);
    expect(size(path.join(logs, "another_folder", "past.log"))).toBe(60 * KB);
    expect(run.output()).toContain("under their size limits: EACCES");
  });

  it.skipIf(process.platform !== "darwin")(
    "counts the files of a process whose name differs in case as its own",
    async () => {
      const { cwd, dir } = createProject({ maxSizeTotal: "200KB" });
      writeLog(path.join(dir, "Web.log"), 60 * KB);
      writeLog(path.join(dir, "web.log.1"), 70 * KB);
      writeLog(path.join(dir, "api.log"), 5 * KB);
      writeLog(path.join(dir, "api.log.1"), 80 * KB);
      await runProcesses(["web", "api"], { cwd });
      expect(size(path.join(dir, "web.log.1"))).toBeUndefined();
      expect(size(path.join(dir, "api.log.1"))).toBe(80 * KB);
    },
  );

  it("frees the .log.1 files of the run before the log of another run that is open", async () => {
    const { cwd, dir } = createProject();
    const file = path.join(dir, "other.log");
    const other = runInTerminal(["-c", `${numbers(1, 450)}; ${until("go")}; echo after`, "other"], {
      cwd,
    });
    await waitUntil(() => (size(file) ?? 0) >= 450 * LINE, "other writes");
    const written = read(file);
    createPackageJson(cwd, ".", "root", { muxa: { logs: { maxSizeTotal: "100KB" } } });
    writeLog(path.join(dir, "web.log"), 20 * KB);
    writeLog(path.join(dir, "web.log.1"), 45 * KB);
    await runProcesses(["web"], { cwd });
    expect(size(path.join(dir, "web.log.1"))).toBeUndefined();
    fs.writeFileSync(path.join(cwd, "go"), "");
    await waitUntil(() => (size(file) ?? 0) > written.length, "other writes on");
    expect(await quit(other)).toBe(0);
    expect(read(file)).toBe(`${written}after\r\n`);
  });

  it("empties the log of another run when its muxa no longer runs", async () => {
    const { cwd, dir } = createProject({ maxSizeTotal: "100KB" });
    writeLog(path.join(dir, "other.log"), 60 * KB);
    writeLog(path.join(dir, "web.log"), 49 * KB);
    const record = path.join(dir, "run-killed.json");
    fs.writeFileSync(record, JSON.stringify(["other.log"]));
    const changed = Date.now() / 1000 - 60;
    fs.utimesSync(record, changed, changed);
    await runProcesses(["web"], { cwd });
    expect(size(path.join(dir, "other.log"))).toBe(0);
    expect(fs.readdirSync(dir).filter((name) => name.startsWith("run-"))).toEqual([]);
  });

  it("counts a copy that a killed muxa left, and the next rotation or limit removes it", async () => {
    const { cwd, dir } = createProject({ maxSizeTotal: "100KB" });
    writeLog(path.join(dir, "old.log.1.tmp"), 60 * KB, 1);
    writeLog(path.join(dir, "web.log"), 49 * KB);
    await runProcesses(["web"], { cwd });
    expect(fs.existsSync(path.join(dir, "old.log.1.tmp"))).toBe(false);
  });
});
