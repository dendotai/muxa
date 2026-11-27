import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { buildDekitConfig, otherRoots, runnerRoot, toYaml } from "@/runner";
import {
  cleanupFixture,
  createRootPackageWorkspace,
  createTempWorkspace,
} from "@tests/helpers/fixture-helpers";

const names = (...typed: string[]) => typed.map((name) => ({ typed: name, tabName: name }));

describe("runnerRoot", () => {
  let created: string[] = [];
  afterEach(() => {
    created.forEach(cleanupFixture);
    created = [];
  });

  it("puts the root in .muxa under the title, with a slash turned into _", () => {
    const cwd = createRootPackageWorkspace();
    created.push(cwd);
    expect(runnerRoot(cwd, "@acme/web")).toBe(path.join(cwd, ".muxa", "@acme_web"));
  });

  it("puts the root of a folder with no package.json in the user's state folder", () => {
    const cwd = createTempWorkspace();
    created.push(cwd);
    const state = process.env.XDG_STATE_HOME;
    process.env.XDG_STATE_HOME = "/state";
    try {
      const root = runnerRoot(cwd, "a:b");
      expect(path.dirname(path.dirname(root))).toBe("/state/muxa/runners");
      expect(path.basename(root)).toBe("a_b");
    } finally {
      if (state === undefined) delete process.env.XDG_STATE_HOME;
      else process.env.XDG_STATE_HOME = state;
    }
  });

  it("lists the roots under other titles that hold a dekit.yaml", () => {
    const cwd = createRootPackageWorkspace();
    created.push(cwd);
    for (const dir of ["old", "logs", "new"])
      fs.mkdirSync(path.join(cwd, ".muxa", dir), { recursive: true });
    fs.writeFileSync(path.join(cwd, ".muxa", "old", "dekit.yaml"), "tasks: {}\n");
    fs.writeFileSync(path.join(cwd, ".muxa", "new", "dekit.yaml"), "tasks: {}\n");
    expect(otherRoots(path.join(cwd, ".muxa", "new"))).toEqual([path.join(cwd, ".muxa", "old")]);
  });
});

describe("buildDekitConfig", () => {
  const env = { MUXA_RUNNING: "1" };

  it("runs a command that needs a shell through sh -c, and any other as a string", () => {
    const config = buildDekitConfig(
      [
        { command: "npm run dev", name: "web", folder: "/repo/web", needsShell: false },
        { command: "echo a && echo b", name: "", needsShell: true },
      ],
      names("web", "echo a && echo b"),
      { cwd: "/repo", env },
    );
    expect(config.tasks).toEqual({
      web: { label: "web", cmd: "npm run dev", cwd: "/repo/web", autostart: true },
      echo_a____echo_b: {
        label: "echo a && echo b",
        cmd: ["sh", "-c", "echo a && echo b"],
        cwd: "/repo",
        autostart: true,
      },
    });
  });

  it("gives each task its log file in append mode", () => {
    const config = buildDekitConfig(
      [{ command: "echo 1", name: "Web App", needsShell: false }],
      names("Web App"),
      { cwd: "/repo", logDir: "/repo/.muxa/logs", env },
    );
    expect(config.tasks["Web_App"]?.log).toEqual({
      file: "/repo/.muxa/logs/Web_App.log",
      mode: "append",
    });
  });

  it("sets mouse_scroll_speed for every task only when Settings set it", () => {
    const commands = [{ command: "echo 1", name: "a", needsShell: false }];
    expect(buildDekitConfig(commands, names("a"), { cwd: "/", env }).defaults).toEqual({ env });
    expect(
      buildDekitConfig(commands, names("a"), { cwd: "/", env, mouseScrollSpeed: 2 }).defaults,
    ).toEqual({ env, mouse_scroll_speed: 2 });
  });
});

describe("toYaml", () => {
  it("writes YAML that reads back as the same config", () => {
    const config = buildDekitConfig(
      [{ command: `echo "a: b" # 'c'\n`, name: "x: y", needsShell: true }],
      names("x: y"),
      { cwd: "/repo", logDir: "/repo/logs", env: { MUXA_RUNNING: "1" }, mouseScrollSpeed: 3 },
    );
    expect(Bun.YAML.parse(toYaml(config))).toEqual(config);
  });
});
