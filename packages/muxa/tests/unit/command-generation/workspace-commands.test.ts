import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { getMuxaCommand } from "@tests/helpers/muxa-runner";
import { createTempWorkspace, cleanupFixture } from "@tests/helpers/fixture-helpers";

describe("Command Generation > Workspace Commands (-w flag)", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = createTempWorkspace("muxa-cmd-test");
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    cleanupFixture(tempDir);
  });

  it("should transform workspace command with cd", async () => {
    // Create a simple workspace
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "test", workspaces: ["packages/*"] }, null, 2),
    );

    fs.mkdirSync(path.join(tempDir, "packages", "backend"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "packages", "backend", "package.json"),
      JSON.stringify({ name: "@test/backend" }, null, 2),
    );

    const result = await getMuxaCommand(["-w", "backend", "npm run dev"], tempDir);
    expect(result.command).toContain("'--names' 'backend'");
    expect(result.command).toContain("'sh -c 'cd");
    expect(result.command).toContain("/packages/backend && npm run dev''");
  });

  it("should handle multiple workspace commands", async () => {
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "test", workspaces: ["packages/*"] }, null, 2),
    );

    fs.mkdirSync(path.join(tempDir, "packages", "backend"), { recursive: true });
    fs.mkdirSync(path.join(tempDir, "packages", "frontend"), { recursive: true });

    fs.writeFileSync(
      path.join(tempDir, "packages", "backend", "package.json"),
      JSON.stringify({ name: "@test/backend" }, null, 2),
    );

    fs.writeFileSync(
      path.join(tempDir, "packages", "frontend", "package.json"),
      JSON.stringify({ name: "@test/frontend" }, null, 2),
    );

    const result = await getMuxaCommand(
      ["-w", "backend", "npm run dev", "-w", "frontend", "npm start"],
      tempDir,
    );

    expect(result.command).toContain("'--names' 'backend,frontend'");
    expect(result.command).toContain("/packages/backend && npm run dev''");
    expect(result.command).toContain("/packages/frontend && npm start''");
  });

  it("should use custom names for workspaces", async () => {
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "test", workspaces: ["packages/*"] }, null, 2),
    );

    fs.mkdirSync(path.join(tempDir, "packages", "backend"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "packages", "backend", "package.json"),
      JSON.stringify({ name: "@test/backend" }, null, 2),
    );

    const result = await getMuxaCommand(["-w", "backend", "npm run dev", "api"], tempDir);
    expect(result.command).toContain("'--names' 'api'");
    expect(result.command).toContain("/packages/backend && npm run dev''");
  });

  it("should escape quotes in workspace commands", async () => {
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "test", workspaces: ["packages/*"] }, null, 2),
    );

    fs.mkdirSync(path.join(tempDir, "packages", "backend"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "packages", "backend", "package.json"),
      JSON.stringify({ name: "@test/backend" }, null, 2),
    );

    const result = await getMuxaCommand(["-w", "backend", "echo 'hello world'"], tempDir);
    expect(result.command).toContain("'--names' 'backend'");
    expect(result.command).toContain("echo");
    expect(result.command).toContain("hello world");
  });
});
