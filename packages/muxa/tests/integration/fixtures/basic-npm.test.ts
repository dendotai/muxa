import { describe, it, expect } from "bun:test";
import { runMuxaInFixture } from "@tests/helpers/muxa-runner";

describe("Fixture Tests > basic-npm", () => {
  it("should error on ambiguous directory name backend", async () => {
    const result = await runMuxaInFixture("basic-npm", ["-w", "backend", "npm run dev"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Ambiguous package identifier 'backend'");
  });

  it("should resolve packages by scoped name", async () => {
    const result = await runMuxaInFixture("basic-npm", ["-w", "@basic/frontend", "npm run dev"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("packages/frontend");
  });

  it("should resolve packages with unique directory names", async () => {
    const result = await runMuxaInFixture("basic-npm", ["-w", "shared", "npm run build"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("packages/shared");
  });

  it("should resolve packages by path", async () => {
    const result = await runMuxaInFixture("basic-npm", ["-w", "packages/shared", "npm run build"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("packages/shared");
  });

  it("should handle multiple targets", async () => {
    const result = await runMuxaInFixture("basic-npm", [
      "-w",
      "@basic/backend",
      "npm run dev",
      "-w",
      "@basic/frontend",
      "npm run dev",
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("--names");
    expect(result.stdout).toContain("backend,frontend");
  });

  it("should handle app vs package with same name", async () => {
    const result = await runMuxaInFixture("basic-npm", ["-w", "backend-app", "npm run dev"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("apps/backend");
  });
});
