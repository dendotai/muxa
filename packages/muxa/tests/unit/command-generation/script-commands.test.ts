import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { getMuxaCommand, getMuxaProcesses } from "@tests/helpers/muxa-runner";
import { createTempWorkspace, cleanupFixture } from "@tests/helpers/fixture-helpers";

describe("Command Generation > Script Commands (-s flag)", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempWorkspace("muxa-script-test");
  });

  afterEach(() => {
    cleanupFixture(tempDir);
  });

  it("should run script from workspace package", async () => {
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "test", workspaces: ["packages/*"] }, null, 2),
    );

    fs.mkdirSync(path.join(tempDir, "packages", "backend"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "packages", "backend", "package.json"),
      JSON.stringify(
        {
          name: "@test/backend",
          scripts: {
            dev: "nodemon server.js",
            build: "tsc",
          },
        },
        null,
        2,
      ),
    );

    const result = await getMuxaProcesses(["-s", "backend", "dev"], tempDir);
    expect(result.processes).toMatchObject([
      {
        name: "backend:dev",
        command: "npm run dev",
        folder: path.join(fs.realpathSync(tempDir), "packages", "backend"),
      },
    ]);
  });

  it("should use custom name for scripts", async () => {
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "test", workspaces: ["packages/*"] }, null, 2),
    );

    fs.mkdirSync(path.join(tempDir, "packages", "backend"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "packages", "backend", "package.json"),
      JSON.stringify(
        {
          name: "@test/backend",
          scripts: { dev: "nodemon" },
        },
        null,
        2,
      ),
    );

    const result = await getMuxaProcesses(["-s", "backend", "dev", "api"], tempDir);
    expect(result.processes).toMatchObject([{ name: "api" }]);
  });

  it("should run script from root with .", async () => {
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify(
        {
          name: "test-root",
          scripts: {
            build: "webpack",
            test: "jest",
          },
        },
        null,
        2,
      ),
    );

    const result = await getMuxaProcesses(["-s", ".", "build"], tempDir);
    expect(result.error).toBeNull();
    // Should use .:build as the default name (ADR 0005)
    expect(result.processes).toMatchObject([
      { name: ".:build", command: "npm run build", folder: fs.realpathSync(tempDir) },
    ]);
  });

  it("should use custom name for root script", async () => {
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify(
        {
          name: "test-root",
          scripts: {
            dev: "nodemon",
          },
        },
        null,
        2,
      ),
    );

    const result = await getMuxaProcesses(["-s", ".", "dev", "myapp"], tempDir);
    expect(result.error).toBeNull();
    expect(result.processes).toMatchObject([{ name: "myapp", command: "npm run dev" }]);
  });

  it("should error on missing script", async () => {
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "test", workspaces: ["packages/*"] }, null, 2),
    );

    fs.mkdirSync(path.join(tempDir, "packages", "backend"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "packages", "backend", "package.json"),
      JSON.stringify(
        {
          name: "@test/backend",
          scripts: { build: "tsc" },
        },
        null,
        2,
      ),
    );

    const result = await getMuxaCommand(["-s", "backend", "dev"], tempDir);
    expect(result.error).toContain("Script 'dev' not found");
    expect(result.error).toContain("Available scripts: build");
  });
});
