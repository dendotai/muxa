import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { getMuxaProcesses } from "@tests/helpers/muxa-runner";
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

    const result = await getMuxaProcesses(["-w", "backend", "npm run dev"], tempDir);
    expect(result.processes).toMatchObject([
      {
        name: "backend",
        command: "npm run dev",
        folder: path.join(fs.realpathSync(tempDir), "packages", "backend"),
      },
    ]);
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

    const result = await getMuxaProcesses(
      ["-w", "backend", "npm run dev", "-w", "frontend", "npm start"],
      tempDir,
    );

    const root = fs.realpathSync(tempDir);
    expect(result.processes).toMatchObject([
      { name: "backend", command: "npm run dev", folder: path.join(root, "packages", "backend") },
      { name: "frontend", command: "npm start", folder: path.join(root, "packages", "frontend") },
    ]);
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

    const result = await getMuxaProcesses(["-w", "backend", "npm run dev", "api"], tempDir);
    expect(result.processes).toMatchObject([
      {
        name: "api",
        command: "npm run dev",
        folder: path.join(fs.realpathSync(tempDir), "packages", "backend"),
      },
    ]);
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

    const result = await getMuxaProcesses(["-w", "backend", "echo 'hello world'"], tempDir);
    expect(result.processes).toMatchObject([{ name: "backend", command: "echo 'hello world'" }]);
  });
});
