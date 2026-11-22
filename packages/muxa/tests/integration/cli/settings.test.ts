import { describe, expect, it } from "bun:test";
import * as fs from "fs";
import { createRootPackageWorkspace } from "@tests/helpers/fixture-helpers";
import { runMuxa } from "@tests/helpers/muxa-runner";

describe("CLI > Settings in package.json", () => {
  it("passes mouseScrollSpeed to mprocs in a temporary config, then deletes it", async () => {
    const cwd = createRootPackageWorkspace({ muxa: { mouseScrollSpeed: 1 } });
    const result = await runMuxa(["echo hi"], { cwd });
    expect(result.code).toBe(0);

    const match = result.stdout.match(/'--config' '([^']+\.json)'/);
    expect(match).not.toBeNull();
    expect(result.stdout).toContain(`mprocs config: {"mouse_scroll_speed":1}`);
    expect(fs.existsSync(match![1]!)).toBe(false);
  });

  it("adds no --config when package.json has no muxa key", async () => {
    const result = await runMuxa(["echo hi"], { cwd: createRootPackageWorkspace() });
    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("--config");
  });

  it("titles the process list with the package.json name", async () => {
    const result = await runMuxa(["echo hi"], { cwd: createRootPackageWorkspace() });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("'--proc-list-title' 'root'");
  });

  it("titles the process list with processListTitle from Settings", async () => {
    const cwd = createRootPackageWorkspace({ muxa: { processListTitle: "Dev" } });
    const result = await runMuxa(["echo hi"], { cwd });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("'--proc-list-title' 'Dev'");
    expect(result.stdout).not.toContain("--config");
  });

  it("stops before mprocs on an unknown key", async () => {
    const cwd = createRootPackageWorkspace({ muxa: { mouseScrolSpeed: 1 } });
    const result = await runMuxa(["echo hi"], { cwd });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(`Unknown key 'mouseScrolSpeed'`);
    expect(result.stdout).not.toContain("Would execute");
  });
});
