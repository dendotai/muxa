import { describe, it, expect } from "bun:test";
import { runMuxaInFixture } from "@tests/helpers/muxa-runner";

describe("Fixture Tests > yarn-workspace", () => {
  it("should handle yarn workspace format", async () => {
    const result = await runMuxaInFixture("yarn-workspace", ["-w", "core", "npm run build"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("packages/core");
  });

  it("should resolve multiple packages", async () => {
    const result = await runMuxaInFixture("yarn-workspace", [
      "-w",
      "@yarn-test/core",
      "npm run build",
      "-w",
      "@yarn-test/utils",
      "npm run test",
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("packages/core");
    expect(result.stdout).toContain("packages/utils");
  });
});
