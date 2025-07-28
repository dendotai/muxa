import { describe, it, expect } from "bun:test";
import * as path from "path";
import { runMuxa } from "@tests/helpers/muxa-runner";

describe("Muxa CLI Integration > Workspace Commands", () => {
  it("should list workspaces", async () => {
    const result = await runMuxa(["workspaces"], {
      cwd: path.join(__dirname, "..", "..", ".."),
      env: { MUXA_TEST_MODE: "true" },
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Found 1 workspace");
    expect(result.stdout).toContain("@den-ai/muxa");
  });

  it("should list workspaces with ws alias", async () => {
    const result = await runMuxa(["ws"], {
      cwd: path.join(__dirname, "..", "..", ".."),
      env: { MUXA_TEST_MODE: "true" },
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Found 1 workspace");
  });
});
