import { afterEach, describe, expect, it } from "bun:test";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { dekitBinaryPath } from "@/dekit";
import { cleanupFixture, createRootPackageWorkspace } from "@tests/helpers/fixture-helpers";
import { LATIN_KEYBOARD_LAYOUT } from "@tests/helpers/constants";
import { dekitTasksOf, runMuxa } from "@tests/helpers/muxa-runner";
import { runInTerminal } from "@tests/helpers/terminal-runner";
import { waitUntil } from "@tests/helpers/wait-until";

const TERMINAL_ENV = { MUXA_TEST_MODE: "true", MUXA_TEST_KEYBOARD_LAYOUT: LATIN_KEYBOARD_LAYOUT };
const QUESTION = 'web already runs "sleep 30" in this folder. Replace it with "sleep 60"?';

let toDelete: string[] = [];
afterEach(() => {
  toDelete.forEach(cleanupFixture);
  toDelete = [];
});

/** A project whose runner runs `web` as `cmd`, as a first muxa there leaves it; test mode then reads it */
function createProjectWithRunner({ running = true, cmd = "sleep 30" } = {}) {
  const cwd = fs.realpathSync(createRootPackageWorkspace({ muxa: { processListTitle: "dev" } }));
  toDelete.push(cwd);
  const root = path.join(cwd, ".muxa", "dev");
  fs.mkdirSync(root, { recursive: true });
  const task = { label: "web", cmd, cwd, autostart: true };
  fs.writeFileSync(path.join(root, "dekit.yaml"), JSON.stringify({ tasks: { web: task } }));
  if (running) spawnSync(dekitBinaryPath(), ["-C", root, "up"]);
  return { cwd, root };
}

const executed = (stdout: string) =>
  [...stdout.matchAll(/^Would execute: dekit '-C' '[^']*' '([^']*)'(?: '([^']*)')?/gm)].map(
    ([, verb, arg]) => (arg ? `${verb} ${arg}` : verb),
  );

describe("A start in a folder whose runner runs", () => {
  it("opens the screen with no question when its processes run with the same commands", async () => {
    const { cwd } = createProjectWithRunner();
    const result = await runMuxa(["-c", "sleep 30", "web"], { cwd });
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(executed(result.stdout)).toEqual(["reload --yes", "attach", "runner stop"]);
  });

  it("adds a new name to the runner and starts it, beside the processes that run", async () => {
    const { cwd } = createProjectWithRunner();
    const result = await runMuxa(["-c", "sleep 30", "api"], { cwd });
    expect(result.code).toBe(0);
    expect(dekitTasksOf(result.stdout)?.map((task) => task.label)).toEqual(["web", "api"]);
    expect(executed(result.stdout)).toEqual(["reload --yes", "start api", "attach", "runner stop"]);
  });

  it("answers No to the question with no terminal on its input, and exits 1", async () => {
    const { cwd } = createProjectWithRunner();
    const result = await runMuxa(["-c", "sleep 60", "web"], { cwd });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`${QUESTION} (y/N): N`);
    expect(dekitTasksOf(result.stdout)).toBeNull();
  });

  it("replaces the process on y, and restarts it", async () => {
    const { cwd } = createProjectWithRunner();
    const run = runInTerminal(["-c", "sleep 60", "web"], { cwd, env: TERMINAL_ENV });
    await run.waitFor(/\(y\/N\)/);
    expect(run.output()).toContain(QUESTION);
    run.type("y");
    expect(await run.exited()).toBe(0);
    expect(executed(run.output())).toEqual([
      "reload --yes",
      "restart web",
      "attach",
      "runner stop",
    ]);
  });

  it("starts again a process of the same command that has ended", async () => {
    const { cwd, root } = createProjectWithRunner({ cmd: "true" });
    const state = () =>
      spawnSync(dekitBinaryPath(), ["-C", root, "ls", "web"], { encoding: "utf8" }).stdout;
    await waitUntil(() => !/ready|running|starting/.test(state()), "web ends");
    const result = await runMuxa(["-c", "true", "web"], { cwd });
    expect(result.stderr).toBe("");
    expect(executed(result.stdout)).toEqual(["reload --yes", "start web", "attach", "runner stop"]);
  });

  for (const [label, key] of [
    ["n", "n"],
    ["Enter", "\r"],
  ]) {
    it(`exits 1 on ${label}`, async () => {
      const { cwd } = createProjectWithRunner();
      const run = runInTerminal(["-c", "sleep 60", "web"], { cwd, env: TERMINAL_ENV });
      await run.waitFor(/\(y\/N\)/);
      run.type(key ?? "");
      expect(await run.exited()).toBe(1);
      expect(dekitTasksOf(run.output())).toBeNull();
    });
  }
});

it("starts the runner with no question when it does not run", async () => {
  const { cwd } = createProjectWithRunner({ running: false });
  const result = await runMuxa(["-c", "sleep 60", "web"], { cwd });
  expect(result.code).toBe(0);
  expect(executed(result.stdout)).toEqual(["up", "reload --yes", "attach", "runner stop"]);
});
