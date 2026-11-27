import { describe, it, expect } from "bun:test";
import { processesOf, runMuxaInFixture } from "@tests/helpers/muxa-runner";

describe("Fixture Tests > single-dir", () => {
  it("should handle single directory workspaces", async () => {
    const result = await runMuxaInFixture("single-dir", ["-w", "api", "npm run dev"]);
    expect(result.code).toBe(0);
    expect(processesOf(result.stdout)).toMatchObject([
      { command: "npm run dev", folder: expect.stringMatching(/\/single-dir\/api$/) },
    ]);
  });

  it("should handle all three packages", async () => {
    const result = await runMuxaInFixture("single-dir", [
      "-w",
      "api",
      "npm run dev",
      "-w",
      "web",
      "npm run dev",
      "-w",
      "mobile",
      "npm start",
    ]);
    expect(result.code).toBe(0);
    expect(processesOf(result.stdout).map(({ name }) => name)).toEqual(["api", "web", "mobile"]);
  });
});

describe("Fixture Tests > script commands (-s flag)", () => {
  it("should run scripts from workspace packages", async () => {
    const result = await runMuxaInFixture("basic-npm", ["-s", "shared", "build"]);
    expect(result.code).toBe(0);
    expect(processesOf(result.stdout)).toMatchObject([
      { name: "shared:build", command: "npm run build" },
    ]);
  });

  it("should run multiple scripts", async () => {
    const result = await runMuxaInFixture("basic-npm", [
      "-s",
      "@basic/frontend",
      "build",
      "frontend-build",
      "-s",
      "@basic/backend",
      "test",
      "backend-test",
    ]);
    expect(result.code).toBe(0);
    expect(processesOf(result.stdout).map(({ name }) => name)).toEqual([
      "frontend-build",
      "backend-test",
    ]);
  });

  it("should error on missing script", async () => {
    const result = await runMuxaInFixture("basic-npm", ["-s", "shared", "nonexistent"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Script 'nonexistent' not found");
    expect(result.stderr).toContain("Available scripts:");
    expect(result.stderr).toContain("build");
  });

  it("should use default name format for scripts", async () => {
    const result = await runMuxaInFixture("basic-npm", ["-s", "shared", "build"]);
    expect(result.code).toBe(0);
    expect(processesOf(result.stdout)).toMatchObject([{ name: "shared:build" }]);
  });
});

describe("Fixture Tests > error cases", () => {
  it("should error when package not found", async () => {
    const result = await runMuxaInFixture("basic-npm", ["-w", "nonexistent", "npm run dev"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Package 'nonexistent' not found");
    expect(result.stderr).toContain("Available packages:");
  });

  it("should handle no workspace configuration", async () => {
    // Run in a fixture directory without workspaces
    const result = await runMuxaInFixture(".", ["-w", "anything", "npm run dev"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("No workspace configuration found");
  });

  it("should handle no workspace configuration for -s flag", async () => {
    const result = await runMuxaInFixture(".", ["-s", "anything", "test"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("No workspace configuration found");
  });

  it("should work with -c flag without workspace configuration", async () => {
    const result = await runMuxaInFixture(".", ["-c", "echo hello"]);
    expect(result.code).toBe(0);
    expect(processesOf(result.stdout)).toMatchObject([{ command: "echo hello" }]);
  });
});
