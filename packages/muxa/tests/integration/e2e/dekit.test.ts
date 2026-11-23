import { describe, expect, it, setDefaultTimeout } from "bun:test";
import * as path from "path";
import { fixturesPath } from "@tests/helpers/constants";
import { createRootPackageWorkspace } from "@tests/helpers/fixture-helpers";
import { runInTerminal, type TerminalRun } from "@tests/helpers/terminal-runner";

const basicNpm = path.join(fixturesPath, "basic-npm");

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
    const cwd = createRootPackageWorkspace({
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
