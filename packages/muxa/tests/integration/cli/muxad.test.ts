import { afterEach, describe, expect, it } from "bun:test";
import * as path from "path";
import { muxaPath } from "@tests/helpers/constants";
import { cleanupFixture, createRootPackageWorkspace } from "@tests/helpers/fixture-helpers";
import { dekitConfigOf, runMuxa } from "@tests/helpers/muxa-runner";

let toDelete: string[] = [];
afterEach(() => {
  toDelete.forEach(cleanupFixture);
  toDelete = [];
});

describe("muxad in dekit.yaml", () => {
  it("is added when the runner loads, as muxa's own program with MUXA_MUXAD in the runner root", async () => {
    const cwd = createRootPackageWorkspace();
    toDelete.push(cwd);
    const result = await runMuxa(["-c", "echo hi", "web"], { cwd });
    expect(result.code).toBe(0);
    const dekit = dekitConfigOf(result.stdout);
    if (!dekit) throw new Error(`no dekit.yaml in:\n${result.stdout}`);

    expect(Object.keys(dekit.config.tasks ?? {})).toEqual(["web"]);
    expect(dekit.config.on_init).toEqual({
      command: "batch",
      commands: [
        // `dekit down` keeps the added task for the next load
        { command: "remove", target: "@muxa/muxad" },
        {
          command: "add",
          target: "@muxa/muxad",
          spec: {
            cmd: [expect.any(String), path.resolve(muxaPath)],
            cwd: dekit.root,
            env: { MUXA_MUXAD: "1" },
          },
        },
      ],
    });
  });
});
