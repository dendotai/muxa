import { describe, it, expect } from "bun:test";
import { runMuxaInFixture } from "@tests/helpers/muxa-runner";

describe("Fixture Tests > scoped-packages", () => {
  it("should handle complex scoped names", async () => {
    const result = await runMuxaInFixture("scoped-packages", [
      "-w",
      "@company/ui-components",
      "npm run storybook",
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("libs/ui");
  });

  it("should use directory name when no name provided", async () => {
    const result = await runMuxaInFixture("scoped-packages", [
      "-w",
      "ui",
      "npm run build",
      "-w",
      "auth",
      "npm run dev",
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("--names");
    expect(result.stdout).toContain("ui,auth");
  });
});
