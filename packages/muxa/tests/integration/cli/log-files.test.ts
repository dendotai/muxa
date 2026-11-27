import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import {
  cleanupFixture,
  createRootPackageWorkspace,
  createTempWorkspace,
} from "@tests/helpers/fixture-helpers";
import { dekitTasksOf, processesOf, runMuxa } from "@tests/helpers/muxa-runner";

describe("CLI > Log files", () => {
  let created: string[] = [];
  afterEach(() => {
    created.forEach(cleanupFixture);
    created = [];
  });
  const track = (dir: string) => {
    created.push(dir);
    return dir;
  };

  it("gives each task its log file in .muxa/logs, in append mode", async () => {
    const cwd = fs.realpathSync(track(createRootPackageWorkspace()));
    const result = await runMuxa(["echo hi"], { cwd });
    expect(result.code).toBe(0);
    expect(dekitTasksOf(result.stdout)?.[0]?.log).toEqual({
      file: `${cwd}/.muxa/logs/echo_hi.log`,
      mode: "append",
    });
  });

  it("gives the root folder a log folder of its own", async () => {
    const result = await runMuxa(["echo hi"], { cwd: "/", env: { XDG_STATE_HOME: "/state" } });
    expect(result.code).toBe(0);
    expect(processesOf(result.stdout)[0]?.log).toBe("/state/muxa/logs/_/echo_hi.log");
  });

  it("shortens a log file name that would be too long", async () => {
    const long = `echo long,${"x".repeat(300)}`;
    const result = await runMuxa(["echo a,b", long], { cwd: track(createRootPackageWorkspace()) });
    expect(result.code).toBe(0);
    expect(processesOf(result.stdout).map(({ log }) => path.basename(log ?? ""))).toEqual([
      "echo_a_b.log",
      `echo_long_${"x".repeat(190)}.log`,
    ]);
  });

  it("puts the log files in the home folder when the folder has no package.json", async () => {
    const result = await runMuxa(["echo hi"], {
      cwd: track(createTempWorkspace()),
      env: { HOME: "/home/me", XDG_STATE_HOME: "relative/is-ignored" },
    });
    expect(result.code).toBe(0);
    expect(processesOf(result.stdout)[0]?.log).toStartWith("/home/me/.local/state/muxa/logs/");
  });

  describe("with names that would give one log file", () => {
    const named = (names: string[]) => names.flatMap((name) => ["-c", "echo 1", name]);
    const logFiles = async (args: string[]) => {
      const result = await runMuxa(args, { cwd: track(createRootPackageWorkspace()) });
      expect(result).toMatchObject({ code: 0, stderr: "" });
      return processesOf(result.stdout).map(({ log }) => path.basename(log ?? ""));
    };

    it.each([
      ["the dots at the ends", ["web", ".web"], /^web-[a-z0-9]{3}\.log$/],
      ["the .log ending", ["web", "web.log"], /^web\.log-[a-z0-9]{3}\.log$/],
    ])("adds a suffix to the one with %s, in any order", async (_, names, suffixed) => {
      const [kept, changed] = await logFiles(named(names));
      expect(kept).toBe("web.log");
      expect(changed).toMatch(suffixed);
      expect(await logFiles(named([...names].reverse()))).toEqual([changed!, kept!]);
    });

    it("adds a suffix after the first one when none is the file's name", async () => {
      const [first, second] = await logFiles(named([".web", "web.."]));
      expect(first).toBe("web.log");
      expect(second).toMatch(/^web\.\.-[a-z0-9]{3}\.log$/);
    });

    it("gives each of several names its own suffix", async () => {
      const [web, dot, dots] = await logFiles(named(["web", ".web", "..web"]));
      expect(web).toBe("web.log");
      expect(dot).toMatch(/^web-[a-z0-9]{3}\.log$/);
      expect(dots).toMatch(/^web-[a-z0-9]{3}\.log$/);
      expect(dots).not.toBe(dot);
    });

    it.skipIf(process.platform !== "darwin").each([
      ["Web", "web"],
      ["web", "Web"],
    ])("adds a suffix to the second of two that differ in case: %s, %s", async (first, second) => {
      const [kept, changed] = await logFiles(named([first, second]));
      expect(kept).toBe(`${first}.log`);
      expect(changed).toMatch(new RegExp(`^${second}-[a-z0-9]{3}\\.log$`));
    });

    it("adds a suffix to a command that differs only in a comma", async () => {
      const [first, second] = await logFiles(["echo a,b", "echo a b"]);
      expect(first).toBe("echo_a_b.log");
      expect(second).toMatch(/^echo_a_b-[a-z0-9]{3}\.log$/);
    });

    it("adds a suffix to the second of two long commands with one start", async () => {
      const long = `echo ${"x".repeat(200)}`;
      const [first, second] = await logFiles([`${long} 1`, `${long} 2`]);
      expect(first).toBe(`echo_${"x".repeat(195)}.log`);
      expect(second).toMatch(/^echo_x{191}-[a-z0-9]{3}\.log$/);
    });

    it("makes a suffix longer when a typed name equals the name with the suffix", async () => {
      const [, suffixed] = await logFiles(named(["web", ".web"]));
      const typedName = `.${suffixed!.replace(/\.log$/, "")}`;
      const [, longer, typed] = await logFiles(named(["web", ".web", typedName]));
      expect(typed).toBe(suffixed!);
      expect(longer).toMatch(/^web-[a-z0-9]{4}\.log$/);
    });

    it("adds a suffix to a command in basic mode", async () => {
      const [ls, dots, shell] = await logFiles(["ls", "ls.", "echo a,b; ls"]);
      expect(ls).toBe("ls.log");
      expect(dots).toMatch(/^ls\.-[a-z0-9]{3}\.log$/);
      expect(shell).toBe("echo_a_b__ls.log");
    });

    it("keeps a name with a suffix inside the length of a file name", async () => {
      const long = "x".repeat(199);
      const [kept, changed] = await logFiles(named([long, `.${long}`]));
      expect(kept).toBe(`${long}.log`);
      expect(changed).toMatch(/^x{195}-[a-z0-9]{3}\.log$/);
    });

    it.each([
      [["a b", "a/b"], "a_b.log", /^a_b-[a-z0-9]{3}\.log$/],
      [["backend_dev", "backend:dev"], "backend_dev.log", /^backend_dev-[a-z0-9]{3}\.log$/],
    ])(
      "adds a suffix when the file name replaces characters: %p",
      async (names, file, suffixed) => {
        const [kept, changed] = await logFiles(named(names));
        expect(kept).toBe(file);
        expect(changed).toMatch(suffixed);
      },
    );

    it("adds no suffix to names that do not clash", async () => {
      const names = ["a b", "a_b-2", ".api", "web.log", "web-2"];
      expect(await logFiles(named(names))).toEqual([
        "a_b.log",
        "a_b-2.log",
        "api.log",
        "web.log",
        "web-2.log",
      ]);
    });
  });

  it("writes nothing in test mode, which starts no process", async () => {
    const cwd = track(createRootPackageWorkspace());
    const result = await runMuxa(["echo hi"], { cwd });
    expect(result.code).toBe(0);
    expect(fs.existsSync(path.join(cwd, ".muxa"))).toBe(false);
  });
});
