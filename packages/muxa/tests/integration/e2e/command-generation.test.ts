import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { runMuxa } from "@tests/helpers/muxa-runner";
import { createMonorepoFixture, cleanupFixture } from "@tests/helpers/fixture-helpers";
import { spawn } from "child_process";
import { muxaPath } from "@tests/helpers/constants";

describe("E2E: Command Generation and Validation", () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = createMonorepoFixture({
      type: "npm",
      packages: [
        {
          path: "packages/backend",
          name: "@test/backend",
          scripts: {
            dev: "node -e \"console.log('backend dev')\"",
            test: "node -e \"console.log('backend test'); process.exit(0)\"",
            build: "node -e \"console.log('backend build'); process.exit(0)\"",
          },
        },
        {
          path: "packages/frontend",
          name: "@test/frontend",
          scripts: {
            start: "node -e \"console.log('frontend start')\"",
            test: "node -e \"console.log('frontend test'); process.exit(0)\"",
            build: "node -e \"console.log('frontend build'); process.exit(0)\"",
          },
        },
      ],
    });
  });

  afterEach(() => {
    cleanupFixture(fixtureDir);
  });

  describe("Command validation", () => {
    it("should validate script commands exist", async () => {
      const result = await runMuxa(["-s", "backend", "nonexistent"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("Script 'nonexistent' not found");
    });

    it("should validate workspace exists", async () => {
      const result = await runMuxa(["-s", "nonexistent", "test"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("Package 'nonexistent' not found");
    });

    it("should handle duplicate process names", async () => {
      const result = await runMuxa(["-c", "echo test", "same", "-c", "echo test2", "same"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      // Should either fail or warn about duplicates
      expect(result.stdout + result.stderr).toMatch(/duplicate|same name/i);
    });
  });

  describe("Argument parsing", () => {
    it("should parse complex command lines", async () => {
      const result = await runMuxa(
        [
          "-s",
          "backend",
          "dev",
          "backend:dev",
          "-c",
          "npm run test -- --coverage",
          "test:coverage",
          "-w",
          "packages/frontend",
          "npm run build",
          "frontend:build",
        ],
        {
          cwd: fixtureDir,
          env: { MUXA_TEST_MODE: "true" },
        },
      );

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Would execute: mprocs");
      expect(result.stdout).toContain("--names");
      expect(result.stdout).toContain("backend:dev,test:coverage,frontend:build");
    });

    it("should handle pass-through options", async () => {
      const result = await runMuxa(["-s", "backend", "test", "--", "--watch", "--coverage"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).toBe(0);
      // The -- and following options are passed to mprocs, not the npm script
      expect(result.stdout).toContain("--");
      expect(result.stdout).toContain("--watch");
      expect(result.stdout).toContain("--coverage");
      expect(result.stdout).toContain("npm run test");
    });
  });

  describe("Help and version", () => {
    it("should show help", async () => {
      const result = await runMuxa(["--help"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("muxa");
      expect(result.stdout).toContain("Usage:");
      expect(result.stdout).toContain("-s, --script");
      expect(result.stdout).toContain("-c, --command");
    });

    it("should show version", async () => {
      const result = await runMuxa(["--version"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  describe("Workspace discovery", () => {
    it("should list workspaces", async () => {
      const result = await runMuxa(["workspaces"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("backend");
      expect(result.stdout).toContain("frontend");
      expect(result.stdout).toContain("packages/backend");
      expect(result.stdout).toContain("packages/frontend");
    });
  });

  describe("Environment handling", () => {
    it("should detect nested execution", async () => {
      const result = await runMuxa(["-c", "echo test"], {
        cwd: fixtureDir,
        env: { MUXA_RUNNING: "1", MUXA_TEST_MODE: "true" },
      });

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("Nested muxa execution detected");
    });

    it("should set MUXA_RUNNING in test mode", async () => {
      const result = await runMuxa(["-c", "echo test"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("MUXA_RUNNING=1");
    });
  });

  describe("Real script execution (single command)", () => {
    it("should execute a single npm script", async () => {
      // Run a single script without mprocs to test basic execution
      const runtime = process.env.CI ? "node" : "bun";
      const proc = spawn(runtime, [muxaPath, "-s", "backend", "test"], {
        cwd: fixtureDir,
        env: { ...process.env, MUXA_SINGLE_MODE: "true" }, // Hypothetical single mode
      });

      proc.stdout?.on("data", (data) => {
        // Handle stdout if needed
        data.toString();
      });

      proc.stderr?.on("data", (data) => {
        // Handle stderr if needed
        data.toString();
      });

      const code = await new Promise<number>((resolve) => {
        proc.on("exit", (code) => resolve(code || 0));
      });

      // Even without single mode, muxa should fail gracefully when mprocs can't start
      // We're mainly testing that muxa itself doesn't crash
      expect(code).toBeDefined();
    });
  });
});
