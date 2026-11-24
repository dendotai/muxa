import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import {
  cleanupFixture,
  createRootPackageWorkspace,
  createTempWorkspace,
} from "@tests/helpers/fixture-helpers";
import { runMuxa } from "@tests/helpers/muxa-runner";

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

  it("passes dekit the log folder and append mode", async () => {
    const cwd = fs.realpathSync(track(createRootPackageWorkspace()));
    const result = await runMuxa(["echo hi"], { cwd });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      `'--log-dir' '.muxa/logs' '--log-file' '${cwd}/.muxa/logs/{name}.log' '--log-mode' 'append'`,
    );
  });

  it("gives the root folder a log folder of its own", async () => {
    const result = await runMuxa(["echo hi"], { cwd: "/", env: { XDG_STATE_HOME: "/state" } });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("'--log-dir' '/state/muxa/logs/_'");
  });

  it("shortens a tab name whose log file name would be too long", async () => {
    const long = `echo long,${"x".repeat(300)}`;
    const result = await runMuxa(["echo a,b", long], { cwd: track(createRootPackageWorkspace()) });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      `'--names' 'echo a b,echo long ${"x".repeat(190)}' 'echo a,b' '${long}'`,
    );
  });

  it("passes dekit a log folder in the home folder when the folder has no package.json", async () => {
    const result = await runMuxa(["echo hi"], {
      cwd: track(createTempWorkspace()),
      env: { HOME: "/home/me", XDG_STATE_HOME: "relative/is-ignored" },
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("'--log-dir' '/home/me/.local/state/muxa/logs/");
  });

  describe("with names that would give one log file", () => {
    const named = (names: string[]) => names.flatMap((name) => ["-c", "echo 1", name]);
    const tabNames = async (args: string[]) => {
      const result = await runMuxa(args, { cwd: track(createRootPackageWorkspace()) });
      expect(result).toMatchObject({ code: 0, stderr: "" });
      return result.stdout.match(/'--names' '([^']*)'/)?.[1]?.split(",");
    };

    it.each([
      ["the dots at the ends", ["web", ".web"], /^\.web-[a-z0-9]{3}$/],
      ["the .log ending", ["web", "web.log"], /^web\.log-[a-z0-9]{3}$/],
    ])("adds a suffix to the one with %s, in any order", async (_, names, suffixed) => {
      const [kept, changed] = (await tabNames(named(names))) ?? [];
      expect(kept).toBe(names[0]);
      expect(changed).toMatch(suffixed);
      expect(await tabNames(named([...names].reverse()))).toEqual([changed!, kept!]);
    });

    it("adds a suffix after the first one when none is the file's name", async () => {
      const [first, second] = (await tabNames(named([".web", "web.."]))) ?? [];
      expect(first).toBe(".web");
      expect(second).toMatch(/^web\.\.-[a-z0-9]{3}$/);
    });

    it("gives each of several names its own suffix", async () => {
      const [web, dot, dots] = (await tabNames(named(["web", ".web", "..web"]))) ?? [];
      expect(web).toBe("web");
      expect(dot).toMatch(/^\.web-[a-z0-9]{3}$/);
      expect(dots).toMatch(/^\.\.web-[a-z0-9]{3}$/);
      expect(dots?.slice(-3)).not.toBe(dot?.slice(-3));
    });

    it.skipIf(process.platform !== "darwin").each([
      ["Web", "web"],
      ["web", "Web"],
    ])("adds a suffix to the second of two that differ in case: %s, %s", async (first, second) => {
      const [kept, changed] = (await tabNames(named([first, second]))) ?? [];
      expect(kept).toBe(first);
      expect(changed).toMatch(new RegExp(`^${second}-[a-z0-9]{3}$`));
    });

    it("adds a suffix to a command that differs only in a comma", async () => {
      const [first, second] = (await tabNames(["echo a,b", "echo a b", "x".repeat(201)])) ?? [];
      expect(first).toMatch(/^echo a b-[a-z0-9]{3}$/);
      expect(second).toBe("echo a b");
    });

    it("adds a suffix to the second of two long commands with one start", async () => {
      const long = `echo ${"x".repeat(200)}`;
      const [first, second] = (await tabNames([`${long} 1`, `${long} 2`])) ?? [];
      expect(first).toBe(long.slice(0, 200));
      expect(second).toMatch(/^echo x{191}-[a-z0-9]{3}$/);
    });

    it("makes a suffix longer when a typed name equals the name with the suffix", async () => {
      const [, suffixed] = (await tabNames(named(["web", ".web"]))) ?? [];
      const [, longer, typed] = (await tabNames(named(["web", ".web", suffixed!]))) ?? [];
      expect(typed).toBe(suffixed!);
      expect(longer).toMatch(/^\.web-[a-z0-9]{4}$/);
    });

    it("adds a suffix to a command, and shows the others as in advanced mode", async () => {
      const [ls, dots, shell] = (await tabNames(["ls", "ls.", "echo a,b; ls"])) ?? [];
      expect(ls).toBe("ls");
      expect(dots).toMatch(/^ls\.-[a-z0-9]{3}$/);
      expect(shell).toBe("echo a b; ls");
    });

    it("keeps a name with a suffix inside the length of a file name", async () => {
      const long = "x".repeat(199);
      const [kept, changed] = (await tabNames(named([long, `.${long}`]))) ?? [];
      expect(kept).toBe(long);
      expect(changed).toMatch(/^\.x{195}-[a-z0-9]{3}$/);
    });

    it.each([
      [["a b", "a/b"], /^a\/b-[a-z0-9]{3}$/],
      [["backend_dev", "backend:dev"], /^backend:dev-[a-z0-9]{3}$/],
    ])("adds a suffix when the file name replaces characters: %p", async (names, suffixed) => {
      const [kept, changed] = (await tabNames(named(names))) ?? [];
      expect(kept).toBe(names[0]);
      expect(changed).toMatch(suffixed);
    });

    it("adds no suffix to names that do not clash", async () => {
      const names = ["a b", "a_b-2", ".api", "web.log", "web-2"];
      expect(await tabNames(named(names))).toEqual(names);
    });
  });

  it("writes nothing in test mode, which starts no process", async () => {
    const cwd = track(createRootPackageWorkspace());
    const result = await runMuxa(["echo hi"], { cwd });
    expect(result.code).toBe(0);
    expect(fs.existsSync(path.join(cwd, ".muxa"))).toBe(false);
  });
});
