import { describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { createRootPackageWorkspace, createTempWorkspace } from "@tests/helpers/fixture-helpers";
import { dekitConfigOf, processesOf, runMuxa } from "@tests/helpers/muxa-runner";

/** The process list title, which names the runner's folder */
const titleOf = (stdout: string) => path.basename(dekitConfigOf(stdout)?.root ?? "");

describe("CLI > Settings in package.json", () => {
  it("sets mouse_scroll_speed for every process", async () => {
    const cwd = createRootPackageWorkspace({ muxa: { mouseScrollSpeed: 1 } });
    const result = await runMuxa(["echo hi"], { cwd });
    expect(result.code).toBe(0);
    expect(dekitConfigOf(result.stdout)?.config.defaults).toMatchObject({ mouse_scroll_speed: 1 });
  });

  it("leaves mouse_scroll_speed to dekit when package.json has no muxa key", async () => {
    const result = await runMuxa(["echo hi"], { cwd: createRootPackageWorkspace() });
    expect(result.code).toBe(0);
    expect(dekitConfigOf(result.stdout)?.config.defaults).not.toHaveProperty("mouse_scroll_speed");
  });

  it("titles the process list with the package.json name", async () => {
    const result = await runMuxa(["echo hi"], { cwd: createRootPackageWorkspace() });
    expect(result.code).toBe(0);
    expect(titleOf(result.stdout)).toBe("root");
  });

  it("titles the process list with processListTitle from Settings", async () => {
    const cwd = createRootPackageWorkspace({ muxa: { processListTitle: "Dev" } });
    const result = await runMuxa(["echo hi"], { cwd });
    expect(result.code).toBe(0);
    expect(titleOf(result.stdout)).toBe("Dev");
  });

  it("stops before dekit on an unknown key", async () => {
    const cwd = createRootPackageWorkspace({ muxa: { mouseScrolSpeed: 1 } });
    const result = await runMuxa(["echo hi"], { cwd });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`Unknown key 'mouseScrolSpeed'`);
    expect(processesOf(result.stdout)).toEqual([]);
  });

  it("stops before dekit on an unknown key under logs", async () => {
    const cwd = createRootPackageWorkspace({ muxa: { logs: { maxSize: "1MB" } } });
    const result = await runMuxa(["echo hi"], { cwd });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Unknown key 'maxSize' in package.json 'muxa.logs'");
    expect(processesOf(result.stdout)).toEqual([]);
  });
});

describe("CLI > Settings in settings.json", () => {
  it.each([
    [".config", () => ""],
    [".config", () => "relative/is-ignored"],
    ["xdg", (home: string) => path.join(home, "xdg")],
  ])("are read from %s in the home folder", async (folder, xdgConfigHome) => {
    const home = createTempWorkspace();
    fs.mkdirSync(path.join(home, folder, "muxa"), { recursive: true });
    fs.writeFileSync(
      path.join(home, folder, "muxa", "settings.json"),
      `{ "processListTitle": "Mine" }`,
    );
    const env = { HOME: home, XDG_CONFIG_HOME: xdgConfigHome(home) };
    const start = (cwd: string) => runMuxa(["echo hi"], { cwd, env });
    expect(titleOf((await start(createTempWorkspace())).stdout)).toBe("Mine");
    expect(titleOf((await start(createRootPackageWorkspace())).stdout)).toBe("root");
  });
});
