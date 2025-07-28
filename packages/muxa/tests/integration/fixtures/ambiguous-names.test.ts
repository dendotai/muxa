import { describe, it, expect } from "bun:test";
import { runMuxaInFixture } from "@tests/helpers/muxa-runner";

describe("Fixture Tests > ambiguous-names", () => {
  it("should error on ambiguous directory name", async () => {
    const result = await runMuxaInFixture("ambiguous-names", ["-w", "backend", "npm run dev"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Ambiguous package identifier 'backend'");
    expect(result.stderr).toContain("@app/backend");
    expect(result.stderr).toContain("@tools/backend");
    expect(result.stderr).toContain("@services/backend");
  });

  it("should resolve by full package name", async () => {
    const result = await runMuxaInFixture("ambiguous-names", [
      "-w",
      "@tools/backend",
      "npm run dev",
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("tools/backend");
  });

  it("should resolve by path", async () => {
    const result = await runMuxaInFixture("ambiguous-names", [
      "-w",
      "services/backend",
      "npm run dev",
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("services/backend");
  });
});
