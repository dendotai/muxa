import { describe, it, expect } from "bun:test";
import * as path from "path";
import * as fs from "fs";
import { runMuxaQuick } from "@tests/helpers/muxa-runner";
import { createTempWorkspace, cleanupFixture } from "@tests/helpers/fixture-helpers";

describe("Muxa CLI Integration > Error Cases", () => {
  it("should error when mixing basic and advanced modes", async () => {
    const result = await runMuxaQuick(["echo hello", "-c", "echo world"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("Cannot mix basic and advanced arguments");
  });

  it("should error when -c flag has no command", async () => {
    const result = await runMuxaQuick(["-c"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("Option -c requires a command");
  });

  it("should error when -w flag has no package", async () => {
    const result = await runMuxaQuick(["-w"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("Option -w requires a package identifier");
  });

  it("should error when -s flag has no package", async () => {
    const result = await runMuxaQuick(["-s"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("Option -s requires a package identifier");
  });

  it("should error when -s flag has no script", async () => {
    const result = await runMuxaQuick(["-s", "backend"]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("Option -s requires a script name");
  });
});

describe("Muxa CLI Integration > Simple Commands", () => {
  it("should run basic commands", async () => {
    const result = await runMuxaQuick(["echo hello", "echo world"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Would execute: mprocs 'echo hello' 'echo world'");
  });

  it("should run -c commands", async () => {
    const result = await runMuxaQuick(["-c", "echo hello", "-c", "echo world"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Would execute: mprocs 'echo hello' 'echo world'");
  });

  it("should run -c commands with names", async () => {
    const result = await runMuxaQuick(["-c", "echo hello", "first", "-c", "echo world", "second"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("'--names' 'first,second'");
  });
});

describe("Muxa CLI Integration > Workspace Errors", () => {
  it("should error when using -w without workspace configuration", async () => {
    const tempDir = createTempWorkspace("muxa-test");

    // Create a non-monorepo package.json
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "non-monorepo" }, null, 2),
    );

    const result = await runMuxaQuick(["-w", "backend", "npm run dev"], tempDir);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("No workspace configuration found");

    cleanupFixture(tempDir);
  });

  it("should error when using -s without workspace configuration", async () => {
    const tempDir = createTempWorkspace("muxa-test");

    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "non-monorepo" }, null, 2),
    );

    const result = await runMuxaQuick(["-s", "backend", "dev"], tempDir);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("No workspace configuration found");

    cleanupFixture(tempDir);
  });

  it("should work with -c without workspace configuration", async () => {
    const tempDir = createTempWorkspace("muxa-test");

    const result = await runMuxaQuick(["-c", "echo hello"], tempDir);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Would execute: mprocs 'echo hello'");

    cleanupFixture(tempDir);
  });

  it("should error when package not found", async () => {
    const tempDir = createTempWorkspace("muxa-test");

    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "test", workspaces: ["packages/*"] }, null, 2),
    );

    fs.mkdirSync(path.join(tempDir, "packages"), { recursive: true });

    const result = await runMuxaQuick(["-w", "nonexistent", "npm run dev"], tempDir);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("Package 'nonexistent' not found");

    cleanupFixture(tempDir);
  });

  it("should error on ambiguous package identifier", async () => {
    const tempDir = createTempWorkspace("muxa-test");

    // Create workspace config
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "test", workspaces: ["packages/*", "apps/*"] }, null, 2),
    );

    // Create two packages with 'backend' in their path
    fs.mkdirSync(path.join(tempDir, "packages", "backend"), { recursive: true });
    fs.mkdirSync(path.join(tempDir, "apps", "backend"), { recursive: true });

    fs.writeFileSync(
      path.join(tempDir, "packages", "backend", "package.json"),
      JSON.stringify({ name: "@test/backend" }, null, 2),
    );

    fs.writeFileSync(
      path.join(tempDir, "apps", "backend", "package.json"),
      JSON.stringify({ name: "@apps/backend" }, null, 2),
    );

    const result = await runMuxaQuick(["-w", "backend", "npm run dev"], tempDir);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("Ambiguous package identifier 'backend'");

    cleanupFixture(tempDir);
  });
});
