import { afterEach, describe, expect, it } from "bun:test";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { dekitBinaryPath } from "@/dekit";
import { runnerTasks } from "@/runner";
import { cleanupFixture, createRootPackageWorkspace } from "@tests/helpers/fixture-helpers";
import { runMuxa } from "@tests/helpers/muxa-runner";
import { quit, runInTerminal } from "@tests/helpers/terminal-runner";
import { waitUntil } from "@tests/helpers/wait-until";

let toDelete: string[] = [];
afterEach(() => {
  toDelete.forEach(cleanupFixture);
  toDelete = [];
});

function createProject() {
  const cwd = fs.realpathSync(createRootPackageWorkspace({ muxa: { processListTitle: "dev" } }));
  toDelete.push(cwd);
  return cwd;
}

/** A runner in `.muxa/<title>`, as a muxa there leaves it after Detach */
function startRunner(cwd: string, tasks: Record<string, string>, title = "dev") {
  const root = path.join(cwd, ".muxa", title);
  fs.mkdirSync(root, { recursive: true });
  const specs = Object.fromEntries(
    Object.entries(tasks).map(([taskPath, label]) => [
      taskPath,
      { label, cmd: "sleep 30", cwd, autostart: true },
    ]),
  );
  fs.writeFileSync(path.join(root, "dekit.yaml"), JSON.stringify({ tasks: specs }));
  spawnSync(dekitBinaryPath(), ["-C", root, "up"]);
  return root;
}

const stateOf = (root: string, task: string) =>
  runnerTasks(dekitBinaryPath(), root)?.find(({ path: taskPath }) => taskPath === task)?.state;

describe("muxa restart, stop, and start with no process to act on", () => {
  it("stop when no muxa runs in the folder", async () => {
    const cwd = createProject();
    const result = await runMuxa(["restart", "web"], { cwd });
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(
      "Error: No muxa in this folder runs 'web'. Start it with muxa first.\n",
    );
  });

  it("stop on a name that the runner lacks, and name the processes it runs", async () => {
    const cwd = createProject();
    startRunner(cwd, { api: "api", web: "web" });
    const result = await runMuxa(["stop", "worker"], { cwd });
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(
      "Error: No muxa in this folder runs 'worker'. Start it with muxa first.\nRunning processes: api, web\n",
    );
  });

  it("stop on a name that two runners of the folder have", async () => {
    const cwd = createProject();
    startRunner(cwd, { web: "web" }, "first");
    startRunner(cwd, { web: "web" }, "second");
    const result = await runMuxa(["restart", "web"], { cwd });
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(
      "Error: 'web' runs in 2 muxa sessions in this folder. Quit all but one, then run the command again.\n",
    );
  });

  it("stop on a name that two processes of one runner have", async () => {
    const cwd = createProject();
    startRunner(cwd, { web: "web", web_2_: "web" });
    const result = await runMuxa(["start", "web"], { cwd });
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(
      "Error: 2 processes are named 'web'. Start each with its own name.\n",
    );
  });
});

describe("muxa restart, stop, and start on a runner that runs", () => {
  it("stop, start, and restart the process of the name", async () => {
    const cwd = createProject();
    const root = startRunner(cwd, { api: "api", "my-web": "my web" });
    await waitUntil(() => stateOf(root, "my-web") === "ready", "my web runs");

    const stopped = await runMuxa(["stop", "my web"], { cwd });
    expect(stopped).toMatchObject({ code: 0, stdout: "Stopped my web\n", stderr: "" });
    await waitUntil(() => stateOf(root, "my-web") === "idle", "my web stops");
    expect(stateOf(root, "api")).toBe("ready");

    const started = await runMuxa(["start", "my web"], { cwd });
    expect(started).toMatchObject({ code: 0, stdout: "Started my web\n", stderr: "" });
    await waitUntil(() => stateOf(root, "my-web") === "ready", "my web starts");

    const restarted = await runMuxa(["restart", "my web"], { cwd });
    expect(restarted).toMatchObject({ code: 0, stdout: "Restarted my web\n", stderr: "" });
  });

  it("take the second of two processes of one name as dekit numbers it", async () => {
    const cwd = createProject();
    const root = startRunner(cwd, { web: "web", web_2_: "web" });
    await waitUntil(() => stateOf(root, "web_2_") === "ready", "the second web runs");
    const result = await runMuxa(["stop", "web (2)"], { cwd });
    expect(result.code).toBe(0);
    await waitUntil(() => stateOf(root, "web_2_") === "idle", "the second web stops");
    expect(stateOf(root, "web")).toBe("ready");
  });
});

describe("muxa restart, stop, and start beside a muxa screen", () => {
  /** muxa runs `web`, which writes a line at each start */
  async function startMuxa(cwd: string) {
    const run = runInTerminal(["-c", "echo started; sleep 30", "web"], { cwd });
    await run.waitFor(/started/);
    return run;
  }
  const starts = (cwd: string) =>
    (fs.readFileSync(path.join(cwd, ".muxa", "logs", "web.log"), "utf8").match(/^started/gm) ?? [])
      .length;

  it("act on a process while its screen is open", async () => {
    const cwd = createProject();
    const run = await startMuxa(cwd);
    const root = path.join(cwd, ".muxa", "dev");

    expect((await runMuxa(["restart", "web"], { cwd })).code).toBe(0);
    await waitUntil(() => starts(cwd) === 2, "web starts again");
    expect((await runMuxa(["stop", "web"], { cwd })).code).toBe(0);
    await waitUntil(() => stateOf(root, "web") === "idle", "web stops");
    expect((await runMuxa(["start", "web"], { cwd })).code).toBe(0);
    await waitUntil(() => starts(cwd) === 3, "web starts");

    expect(await quit(run)).toBe(0);
  });

  it("act on a process that runs on after Detach", async () => {
    const cwd = createProject();
    const run = await startMuxa(cwd);
    const root = path.join(cwd, ".muxa", "dev");
    run.type("q");
    await run.waitFor(/Save and quit/);
    run.type("d");
    expect(await run.exited()).toBe(0);

    expect((await runMuxa(["restart", "web"], { cwd })).code).toBe(0);
    await waitUntil(() => starts(cwd) === 2, "web starts again");
    expect((await runMuxa(["stop", "web"], { cwd })).code).toBe(0);
    await waitUntil(() => stateOf(root, "web") === "idle", "web stops");
    expect((await runMuxa(["start", "web"], { cwd })).code).toBe(0);
    await waitUntil(() => starts(cwd) === 3, "web starts");
  });
});
