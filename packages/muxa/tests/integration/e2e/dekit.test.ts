import { afterEach, describe, expect, it, setDefaultTimeout } from "bun:test";
import * as fs from "fs";
import { spawnSync } from "child_process";
import * as path from "path";
import {
  fixturesPath,
  LATIN_KEYBOARD_LAYOUT,
  muxaPath,
  muxaRuntime,
} from "@tests/helpers/constants";
import {
  cleanupFixture,
  createRootPackageWorkspace,
  createTempWorkspace,
} from "@tests/helpers/fixture-helpers";
import { dekitBinaryPath } from "@/dekit";
import { runMuxa } from "@tests/helpers/muxa-runner";
import { quit, runInTerminal } from "@tests/helpers/terminal-runner";
import { waitUntil } from "@tests/helpers/wait-until";

const basicNpm = path.join(fixturesPath, "basic-npm");

// Folders a test made or wrote in, deleted after it
const toDelete = [path.join(basicNpm, ".muxa")];
afterEach(() => toDelete.forEach(cleanupFixture));

const createRootFolder = (...extras: Parameters<typeof createRootPackageWorkspace>) => {
  const dir = createRootPackageWorkspace(...extras);
  toDelete.push(dir);
  return dir;
};

// Each run starts dekit and waits for its screen, which takes longer than a test-mode run
setDefaultTimeout(15000);

/** The process that runs in the runner root and is not dekit: muxad, whose task has the root as its folder */
function muxadPid(root: string): number | undefined {
  const lsof = spawnSync("lsof", ["-a", "-d", "cwd", "-F", "pc", root], {
    encoding: "utf8",
  }).stdout;
  const pid = /^p(\d+)\nc(?!dekit$).*$/m.exec(lsof)?.[1];
  return pid === undefined ? undefined : Number(pid);
}

describe("muxa on dekit", () => {
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

  it("starts with Settings in dekit.yaml", async () => {
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

  it("runs muxad hidden from the screen and from a plain dekit ls, and stops it with the runner", async () => {
    const cwd = createRootFolder({ muxa: { processListTitle: "dev" } });
    const root = path.join(fs.realpathSync(cwd), ".muxa", "dev");
    const run = runInTerminal(["-c", "sleep 30", "web"], { cwd });
    await run.waitFor(/web/);
    await waitUntil(() => muxadPid(root) !== undefined, "dekit starts muxad", 5000);
    const pid = muxadPid(root) as number;
    const ls = (...target: string[]) =>
      spawnSync(dekitBinaryPath(), ["-C", root, "ls", ...target], { encoding: "utf8" }).stdout;

    expect(ls("@*/**")).toMatch(/^@muxa\/muxad\s+ready$/m);
    expect(ls()).not.toContain("muxad");
    expect(run.output()).not.toContain("muxad");

    expect(await quit(run)).toBe(0);
    expect(() => process.kill(pid, 0)).toThrow();
  });
});

describe("a second start in the same folder", () => {
  const startLines = (cwd: string) =>
    (
      fs
        .readFileSync(path.join(cwd, ".muxa", "logs", "web.log"), "utf8")
        .match(/=== muxa started/g) ?? []
    ).length;

  it("joins the runner of the first while its screen is open, and replaces a process after a yes", async () => {
    const cwd = createRootFolder({ muxa: { processListTitle: "dev" } });
    const root = path.join(fs.realpathSync(cwd), ".muxa", "dev");
    const tasks = () =>
      (
        JSON.parse(
          spawnSync(dekitBinaryPath(), ["-C", root, "ls", "--json"], { encoding: "utf8" }).stdout,
        ) as { tasks: { path: string; state: string; spec: { cmd: string[] } }[] }
      ).tasks.map(({ path: task, state, spec }) => `${task} ${state} ${spec.cmd.join(" ")}`);

    const first = runInTerminal(["-c", "sleep 30", "web"], { cwd });
    await first.waitFor(/web/);

    const second = runInTerminal(["-c", "sleep 30", "web", "-c", "sleep 31", "api"], { cwd });
    await second.waitFor(/api/);
    await waitUntil(() => tasks().join() === "web ready sleep 30,api ready sleep 31", "api runs");
    // web ran on, so no start line came into its log file
    expect(startLines(cwd)).toBe(1);

    const third = runInTerminal(["-c", "sleep 32", "web"], {
      cwd,
      env: { MUXA_TEST_KEYBOARD_LAYOUT: LATIN_KEYBOARD_LAYOUT },
    });
    await third.waitFor(/Replace it with "sleep 32"\? \(y\/N\)/);
    third.type("y");
    await waitUntil(
      () => tasks().join() === "web ready sleep 32,api ready sleep 31",
      "web runs the new command",
    );
    expect(startLines(cwd)).toBe(2);
    expect(await quit(third)).toBe(0);
    // The quit stopped the runner, which closes every screen on it
    expect(await first.exited()).toBe(0);
    expect(await second.exited()).toBe(0);
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
        .filter((file) => file.endsWith(".log"))
        .map((file) => [file, readLog(cwd, file).replace(startLine, "start ")]),
    );

  it("are beside a processes.json with the name and the log file of each process", async () => {
    const cwd = createRootFolder();
    for (const [args, processes] of [
      [
        ["-c", "echo hi", "backend:dev", "-c", "echo hi,; echo"],
        [
          { name: "backend:dev", file: "backend_dev.log" },
          { name: "echo hi,; echo", file: "echo_hi___echo.log" },
        ],
      ],
      [["echo 1; echo"], [{ name: "echo 1; echo", file: "echo_1__echo.log" }]],
    ] as const) {
      const run = runInTerminal([...args], { cwd });
      await run.waitFor(new RegExp(`(DOWN \\(0\\)[^]*){${processes.length}}`));
      expect(await quit(run)).toBe(0);
      expect(JSON.parse(readLog(cwd, "processes.json")).slice(0, processes.length)).toEqual([
        ...processes,
      ]);
    }
  });

  const printLog = async (cwd: string, name: string) => {
    const { stdout, stderr } = await runMuxa(["logs", name], { cwd });
    return stdout.replace(startLine, "start ") + stderr;
  };

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

    const { "a_b.log": spaced, ...logs } = readLogs(cwd);
    expect(spaced).toBe("start output-1\r\n");
    const slashed = Object.keys(logs).find((file) => /^a_b-[a-z0-9]{3}\.log$/.test(file)) ?? "";
    expect(logs).toEqual({
      "backend_dev.log": "start output-0\r\n",
      [slashed]: "start output-2\r\n",
      "web.log": "start output-3\r\n",
      "dots.log": "start output-4\r\n",
      "task.log": "start output-5\r\n",
      "__.log": "start output-6\r\n",
      "server.log": "start output-7\r\n",
    });
    for (const [i, name] of names.entries()) {
      expect(await printLog(cwd, name)).toBe(`start output-${i}\n`);
    }
    expect(await printLog(cwd, "a:b")).toContain("Error: No log file for 'a:b' in .muxa/logs\n");
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

  it("print by the command, as written, of a process with no name", async () => {
    const cwd = createRootFolder();
    const commands = ["echo one,two", "echo a; echo b", `echo ${"x".repeat(300)}`];
    const outputs = ["one,two", "a\nb", "x".repeat(300)];
    const runs = [commands.slice(0, 2), commands, ["-c", "echo hi", "api"]];
    for (const [i, args] of runs.entries()) {
      const advanced = i === 2 ? [...args, ...commands.flatMap((c) => ["-c", c])] : args;
      const run = runInTerminal(advanced, { cwd });
      await run.waitFor(new RegExp(`(DOWN \\(0\\)[^]*){${i === 2 ? 4 : args.length}}`));
      expect(await quit(run)).toBe(0);
      for (const [j, command] of commands.entries()) {
        if (i > 0 || j < 2) expect(await printLog(cwd, command)).toBe(`start ${outputs[j]}\n`);
      }
    }
  });

  it("print by a duplicate name only with the number from the process list", async () => {
    const cwd = createRootFolder();
    const run = runInTerminal(["echo same", "echo same"], { cwd });
    await run.waitFor(/(DOWN \(0\)[^]*){2}/);
    expect(await quit(run)).toBe(0);
    expect(await printLog(cwd, "echo same")).toBe(
      "Error: 2 processes are named 'echo same'. Start each with its own name.\n",
    );
    expect(await printLog(cwd, "echo same (2)")).toBe("start same\n");
  });

  it("are separate for names that would give one log file, and the same at each start", async () => {
    const cwd = createRootFolder();
    const names = [".web", "web", "web.log"];
    if (process.platform === "darwin") names.push("Web");
    const files = new Set<string>();
    for (const order of [names, [...names].reverse()]) {
      const run = runInTerminal(
        order.flatMap((name) => ["-c", `echo output-of-${name}`, name]),
        { cwd },
      );
      await run.waitFor(new RegExp(`(DOWN \\(0\\)[^]*){${names.length}}`));
      expect(await quit(run)).toBe(0);

      for (const { name, file } of JSON.parse(readLog(cwd, "processes.json"))) {
        expect(readLog(cwd, file).replace(startLine, "start ")).toEndWith(
          `start output-of-${name}\r\n`,
        );
        expect(await printLog(cwd, name)).toBe(`start output-of-${name}\n`);
        // The process list shows the name as typed, whatever its log file
        expect(run.output()).toContain(name);
        if (name.toLowerCase() !== "web") files.add(file);
      }
    }
    expect([...files]).toEqual([
      expect.stringMatching(/^web-[a-z0-9]{3}\.log$/),
      expect.stringMatching(/^web\.log-[a-z0-9]{3}\.log$/),
    ]);

    const run = runInTerminal(["-c", "echo hi", "api"], { cwd });
    await run.waitFor(/api\s+DOWN \(0\)/);
    expect(await quit(run)).toBe(0);
    expect(await printLog(cwd, ".web")).toBe("start output-of-.web\n");
  });

  it("are separate for a name that equals the number dekit adds", async () => {
    const cwd = createRootFolder();
    const run = runInTerminal(["-c", "echo 1", "-c", "echo 1", "-c", "echo 2", ".echo_1__2_"], {
      cwd,
    });
    await run.waitFor(/(DOWN \(0\)[^]*){3}/);
    expect(await quit(run)).toBe(0);
    expect(await printLog(cwd, "echo 1 (2)")).toBe("start 1\n");
    expect(await printLog(cwd, ".echo_1__2_")).toBe("start 2\n");
  });

  it("stay in processes.json while they exist and no later process takes them", async () => {
    const cwd = createRootFolder();
    const start = async (names: string[]) => {
      const run = runInTerminal(
        names.flatMap((name) => ["-c", `echo from-${name}`, name]),
        { cwd },
      );
      await run.waitFor(new RegExp(`(DOWN \\(0\\)[^]*){${names.length}}`));
      expect(await quit(run)).toBe(0);
    };
    const processes = () => JSON.parse(readLog(cwd, "processes.json"));
    await start(["a b", "web", "gone"]);
    fs.rmSync(path.join(logDir(cwd), "gone.log"));
    await start(["api", ".web"]);
    expect(processes()).toEqual([
      { name: "api", file: "api.log" },
      { name: ".web", file: "web.log" },
      { name: "a b", file: "a_b.log" },
    ]);
    expect(await printLog(cwd, "a b")).toBe("start from-a b\n");
    expect(await printLog(cwd, "a/b")).toBe(
      "Error: No log file for 'a/b' in .muxa/logs\nAvailable processes: api, .web, a b\n",
    );
    await start(["a/b"]);
    expect(processes()[0]).toEqual({ name: "a/b", file: "a_b.log" });
    expect(processes()).toHaveLength(3);
  });

  it("print for a process that only an earlier run started", async () => {
    const cwd = createRootFolder();
    for (const name of ["web", "api"]) {
      const run = runInTerminal(["-c", `echo from-${name}`, name], { cwd });
      await run.waitFor(/DOWN \(0\)/);
      expect(await quit(run)).toBe(0);
    }
    expect(await printLog(cwd, "web")).toBe("start from-web\n");
    expect(await printLog(cwd, "wbe")).toContain("Available processes: api, web\n");
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
      expect(fs.existsSync(path.join(home, ".local", "state", "muxa"))).toBe(false);
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
      fs.mkdirSync(path.join(cwd, ".muxa"));
      fs.writeFileSync(path.join(cwd, ".muxa", "logs"), "a file where the folder goes");
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
      expect(stderr).toMatch(/Executing: dekit '-C' '[^']*' 'up'/);
      expect(await Bun.readableStreamToText(proc.stdout)).not.toContain(
        "Continue without log files?",
      );
    });
  });
});
