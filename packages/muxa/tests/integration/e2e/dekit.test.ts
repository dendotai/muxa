import { afterEach, describe, expect, it, setDefaultTimeout } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { fixturesPath, muxaPath, muxaRuntime } from "@tests/helpers/constants";
import {
  cleanupFixture,
  createRootPackageWorkspace,
  createTempWorkspace,
} from "@tests/helpers/fixture-helpers";
import { runInTerminal, type TerminalRun } from "@tests/helpers/terminal-runner";

const basicNpm = path.join(fixturesPath, "basic-npm");

// Folders a test made or wrote in, deleted after it
const toDelete = [path.join(basicNpm, ".muxa")];
afterEach(() => toDelete.forEach(cleanupFixture));

const createRootFolder = (...extras: Parameters<typeof createRootPackageWorkspace>) => {
  const dir = createRootPackageWorkspace(...extras);
  toDelete.push(dir);
  return dir;
};

async function quit(run: TerminalRun): Promise<number> {
  run.type("q");
  await run.waitFor(/Save and quit/);
  run.type("x");
  return run.exited();
}

// Each run starts dekit and waits for its screen, which takes longer than a test-mode run
setDefaultTimeout(15000);

describe("muxa on dekit in mprocs mode", () => {
  it("shows each named command, its output, and the process list title", async () => {
    const run = runInTerminal(
      ["-c", "echo hello-from-alpha", "alpha", "-c", "echo hello-from-beta", "beta"],
      { cwd: basicNpm },
    );
    await run.waitFor(/basic-npm-monorepo/);
    await run.waitFor(/alpha/);
    await run.waitFor(/beta/);
    await run.waitFor(/hello-from-alpha/);

    expect(await quit(run)).toBe(0);
  });

  it("runs a workspace script in its package folder", async () => {
    const run = runInTerminal(["-s", "packages/backend", "dev"], { cwd: basicNpm });
    await run.waitFor(/backend:dev/);
    await run.waitFor(/Backend running on port 3000/);

    expect(await quit(run)).toBe(0);
  });

  it("starts with Settings passed in a temporary config", async () => {
    const cwd = createRootFolder({
      muxa: { mouseScrollSpeed: 1, processListTitle: "Dev stack" },
    });
    const run = runInTerminal(["echo hi"], { cwd });
    await run.waitFor(/Dev stack/);

    expect(await quit(run)).toBe(0);
  });

  it("exits 0 after a process failed", async () => {
    const run = runInTerminal(["-c", "exit 3", "failing"], { cwd: basicNpm });
    await run.waitFor(/failing\s+DOWN \(3\)/);

    expect(await quit(run)).toBe(0);
  });
});

describe("log files of a dekit session", () => {
  const startLine = /=== muxa started [\d-]+ [\d:]+[+-]\d\d:\d\d ===\n/g;
  const logDir = (cwd: string) => path.join(cwd, ".muxa", "logs");
  const readLog = (cwd: string, file: string) =>
    fs.readFileSync(path.join(logDir(cwd), file), "utf-8");
  const readLogs = (cwd: string) =>
    Object.fromEntries(
      fs
        .readdirSync(logDir(cwd))
        .map((file) => [file, readLog(cwd, file).replace(startLine, "start ")]),
    );

  it("hold a process that is not selected and the lines that scrolled off", async () => {
    const cwd = createRootFolder();
    const count = (word: string) =>
      `for i in $(seq 1 200); do echo ${word}-$i.; done; echo ${word}-end`;
    const run = runInTerminal(["-c", count("shown"), "selected", "-c", count("hidden"), "other"], {
      cwd,
    });
    await run.waitFor(/shown-end/);
    await run.waitFor(/other\s+DOWN \(0\)/);
    expect(run.output()).not.toContain("hidden-");
    expect(await quit(run)).toBe(0);

    for (const [file, word] of [
      ["selected.log", "shown"],
      ["other.log", "hidden"],
    ] as const) {
      const log = readLog(cwd, file);
      for (let i = 1; i <= 200; i++) expect(log).toContain(`${word}-${i}.`);
    }
  });

  it("keep the output of every run, each after its own start line", async () => {
    const cwd = createRootFolder();
    for (const word of ["first", "second"]) {
      const run = runInTerminal(["-c", `echo ${word}-run`, "api"], { cwd });
      await run.waitFor(new RegExp(`${word}-run`));
      await run.waitFor(/api\s+DOWN \(0\)/);
      expect(await quit(run)).toBe(0);
    }
    const [beforeFirst, first, second] = readLog(cwd, "api.log").split(startLine);
    expect(beforeFirst).toBe("");
    expect(first).toBe("first-run\r\n");
    expect(second).toBe("second-run\r\n");
  });

  it("hold a process's output and start line in one file, whatever its tab name", async () => {
    const cwd = createRootFolder();
    const names = ["backend:dev", "a b", "a/b", "web", ".dots.", "...", "é🙂", "server.log"];
    const run = runInTerminal(
      names.flatMap((name, i) => ["-c", `echo output-${i}`, name]),
      { cwd },
    );
    await run.waitFor(/server\.log\s+DOWN \(0\)/);
    expect(await quit(run)).toBe(0);

    expect(readLogs(cwd)).toEqual({
      "backend_dev.log": "start output-0\r\n",
      "a_b.log": "start output-1\r\n",
      "a_b-2.log": "start output-2\r\n",
      "web.log": "start output-3\r\n",
      "dots.log": "start output-4\r\n",
      "task.log": "start output-5\r\n",
      "__.log": "start output-6\r\n",
      "server.log": "start output-7\r\n",
    });
  });

  it("are named by the command in basic mode, also for a repeated or a long command", async () => {
    const cwd = createRootFolder();
    const long = `echo long,${"x".repeat(300)}`;
    const run = runInTerminal(["echo same", "echo same", long], { cwd });
    await run.waitFor(/(DOWN \(0\)[^]*){3}/);
    expect(await quit(run)).toBe(0);

    expect(readLogs(cwd)).toEqual({
      "echo_same.log": "start same\r\n",
      "echo_same__2_.log": "start same\r\n",
      [`echo_long_${"x".repeat(190)}.log`]: `start long,${"x".repeat(300)}\r\n`,
    });
  });

  it("stay in .muxa/logs when an mprocs.yaml names another log file", async () => {
    const cwd = createRootFolder();
    fs.writeFileSync(path.join(cwd, "mprocs.yaml"), "proc_log:\n  file: elsewhere.log\n");
    const run = runInTerminal(["-c", "echo hi", "api"], { cwd });
    await run.waitFor(/api\s+DOWN \(0\)/);
    expect(await quit(run)).toBe(0);
    expect(readLog(cwd, "api.log").replace(startLine, "start ")).toBe("start hi\r\n");
    expect(fs.existsSync(path.join(cwd, "elsewhere.log"))).toBe(false);
  });

  it("keep an earlier run's last line when it has no line end", async () => {
    const cwd = createRootFolder();
    fs.mkdirSync(logDir(cwd), { recursive: true });
    fs.writeFileSync(path.join(logDir(cwd), "api.log"), "killed mid-line");
    const run = runInTerminal(["-c", "echo hi", "api"], { cwd });
    await run.waitFor(/api\s+DOWN \(0\)/);
    expect(await quit(run)).toBe(0);
    expect(readLog(cwd, "api.log").replace(startLine, "start ")).toBe(
      "killed mid-line\nstart hi\r\n",
    );
  });

  it.each([
    ["Asia/Kathmandu", "+05:45"],
    ["Pacific/Marquesas", "-09:30"],
    ["UTC", "+00:00"],
  ])("get a start line with the local time and its time zone in %s", async (zone, offset) => {
    const cwd = createRootFolder();
    const before = Math.floor(Date.now() / 1000) * 1000;
    const run = runInTerminal(["-c", "echo hi", "api"], { cwd, env: { TZ: zone } });
    await run.waitFor(/api\s+DOWN \(0\)/);
    expect(await quit(run)).toBe(0);

    const line = readLog(cwd, "api.log").match(
      /^=== muxa started (\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d)(\S+) ===\n/,
    );
    expect(line?.[3]).toBe(offset);
    const startedAt = Date.parse(`${line?.[1]}T${line?.[2]}${offset}`);
    expect(startedAt).toBeGreaterThanOrEqual(before);
    expect(startedAt).toBeLessThanOrEqual(Date.now());
  });

  it("stay out of git without an edit to the project's .gitignore", async () => {
    const cwd = createRootFolder();
    fs.writeFileSync(path.join(cwd, ".gitignore"), "dist/\n");
    const run = runInTerminal(["-c", "echo hi", "api"], { cwd });
    await run.waitFor(/api\s+DOWN \(0\)/);
    expect(await quit(run)).toBe(0);
    expect(fs.readFileSync(path.join(cwd, ".muxa", ".gitignore"), "utf-8")).toBe("*\n");
    expect(fs.readFileSync(path.join(cwd, ".gitignore"), "utf-8")).toBe("dist/\n");
  });

  describe("in a folder with no package.json", () => {
    const start = (folder: string, env: (home: string) => Record<string, string>) => {
      // The real path, as muxa gets it from process.cwd()
      const home = fs.realpathSync(createTempWorkspace());
      toDelete.push(home);
      const cwd = path.join(home, folder);
      fs.mkdirSync(cwd, { recursive: true });
      const run = runInTerminal(["-c", "echo hi", "api"], { cwd, env: env(home) });
      return { home, cwd, run };
    };
    const expectLog = (file: string) => {
      const log = fs.readFileSync(file, "utf-8");
      expect(log.replace(startLine, "start ")).toBe("start hi\r\n");
    };
    const folderName = (cwd: string) => cwd.slice(1).replaceAll("_", "__").replaceAll("/", "_");

    it("are in ~/.local/state, in a folder of their own", async () => {
      const { home, cwd, run } = start("Загрузки/my_files", (home) => ({
        HOME: home,
        XDG_STATE_HOME: "",
      }));
      await run.waitFor(/api\s+DOWN \(0\)/);
      expect(await quit(run)).toBe(0);

      const logs = path.join(home, ".local", "state", "muxa", "logs");
      expect(fs.readdirSync(logs)).toEqual([folderName(home) + "_Загрузки_my__files"]);
      expectLog(path.join(logs, folderName(cwd), "api.log"));
      expect(fs.existsSync(path.join(cwd, ".muxa"))).toBe(false);
    });

    it("are in XDG_STATE_HOME when it is set", async () => {
      const { home, cwd, run } = start("work", (home) => ({
        HOME: home,
        XDG_STATE_HOME: path.join(home, "state"),
      }));
      await run.waitFor(/api\s+DOWN \(0\)/);
      expect(await quit(run)).toBe(0);
      expectLog(path.join(home, "state", "muxa", "logs", folderName(cwd), "api.log"));
      expect(fs.existsSync(path.join(home, ".local"))).toBe(false);
    });

    it("are in a folder with a short enough name for a deep path", async () => {
      const deep = Array.from({ length: 30 }, (_, i) => `папка-${i}-x`).join("/");
      const { home, run } = start(deep, (home) => ({
        HOME: home,
        XDG_STATE_HOME: path.join(home, "state"),
      }));
      await run.waitFor(/api\s+DOWN \(0\)/);
      expect(await quit(run)).toBe(0);
      const logs = path.join(home, "state", "muxa", "logs");
      const [folder] = fs.readdirSync(logs);
      expect(folder).toEndWith("_папка-28-x_папка-29-x");
      expect(Buffer.byteLength(folder!)).toBeLessThanOrEqual(200);
      expect(folder).not.toContain("\uFFFD");
      expectLog(path.join(logs, folder!, "api.log"));
    });
  });

  describe("that muxa cannot write", () => {
    const createUnwritable = () => {
      const cwd = createRootFolder();
      fs.writeFileSync(path.join(cwd, ".muxa"), "a file where the folder goes");
      return cwd;
    };
    const start = () => runInTerminal(["-c", "echo hi", "api"], { cwd: createUnwritable() });
    const question =
      /Warning: muxa cannot write log files in \.muxa\/logs: E\w+[^]*Continue without log files\? \(y\/N\): /;

    it("make muxa ask, and a yes starts the processes without log files", async () => {
      const run = start();
      await run.waitFor(question);
      run.type("y");
      await run.waitFor(/api\s+DOWN \(0\)/);
      expect(await quit(run)).toBe(0);
    });

    it("make muxa ask, and Enter stops it with exit code 1", async () => {
      const run = start();
      await run.waitFor(question);
      run.type("\r");
      expect(await run.exited()).toBe(1);
      expect(run.output()).not.toContain("DOWN");
    });

    it("leave the files that muxa can write without a start line", async () => {
      const cwd = createRootFolder();
      fs.mkdirSync(path.join(logDir(cwd), "web.log"), { recursive: true });
      fs.writeFileSync(path.join(logDir(cwd), "api.log"), "earlier\n");
      const run = runInTerminal(["-c", "echo hi", "api", "-c", "echo hi", "web"], { cwd });
      await run.waitFor(/Continue without log files\?/);
      run.type("n");
      expect(await run.exited()).toBe(1);
      expect(readLog(cwd, "api.log")).toBe("earlier\n");
    });

    it("bring only a warning when muxa has no terminal on its input", async () => {
      const env: NodeJS.ProcessEnv = { ...process.env, MUXA_DEBUG: "1" };
      delete env.MUXA_TEST_MODE;
      delete env.MUXA_RUNNING;
      const proc = Bun.spawn([muxaRuntime, muxaPath, "-c", "echo hi", "api"], {
        cwd: createUnwritable(),
        env,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });
      const timer = setTimeout(() => proc.kill("SIGKILL"), 2000);
      const stderr = await Bun.readableStreamToText(proc.stderr);
      clearTimeout(timer);
      expect(stderr).toContain("Warning: muxa cannot write log files in .muxa/logs: ");
      expect(stderr).toMatch(/Executing: dekit mprocs .*'echo hi'/);
      expect(stderr).not.toContain("--log-dir");
      expect(await Bun.readableStreamToText(proc.stdout)).not.toContain(
        "Continue without log files?",
      );
    });
  });
});
