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

  it("writes nothing in test mode, which starts no process", async () => {
    const cwd = track(createRootPackageWorkspace());
    const result = await runMuxa(["echo hi"], { cwd });
    expect(result.code).toBe(0);
    expect(fs.existsSync(path.join(cwd, ".muxa"))).toBe(false);
  });
});
