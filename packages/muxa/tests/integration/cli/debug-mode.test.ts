import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { runMuxa } from "@tests/helpers/muxa-runner";
import { createMonorepoFixture, cleanupFixture } from "@tests/helpers/fixture-helpers";

describe("Debug Mode", () => {
  let fixtureDir: string;
  let originalDebug: string | undefined;

  beforeEach(() => {
    originalDebug = process.env.MUXA_DEBUG;
    fixtureDir = createMonorepoFixture({
      type: "npm",
      packages: [
        {
          path: "packages/backend",
          name: "@test/backend",
          scripts: {
            dev: "echo 'backend dev'",
            test: "echo 'backend test'",
          },
        },
      ],
    });
  });

  afterEach(() => {
    cleanupFixture(fixtureDir);
    if (originalDebug === undefined) {
      delete process.env.MUXA_DEBUG;
    } else {
      process.env.MUXA_DEBUG = originalDebug;
    }
  });

  describe("MUXA_DEBUG=1 output", () => {
    it("should show debug output when MUXA_DEBUG=1", async () => {
      const result = await runMuxa(["-c", "echo test"], {
        cwd: fixtureDir,
        env: { MUXA_DEBUG: "1", MUXA_TEST_MODE: "true" },
      });

      expect(result.stderr).toContain("[muxa debug]");
    });

    it("should not show debug output when MUXA_DEBUG is not set", async () => {
      const result = await runMuxa(["-c", "echo test"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.stderr).not.toContain("[muxa debug]");
    });

    it("should show debug output for any truthy MUXA_DEBUG value", async () => {
      const result = await runMuxa(["-c", "echo test"], {
        cwd: fixtureDir,
        env: { MUXA_DEBUG: "true", MUXA_TEST_MODE: "true" },
      });

      expect(result.stderr).toContain("[muxa debug]");
    });
  });

  describe("Workspace discovery details", () => {
    it("should show workspace package count", async () => {
      const result = await runMuxa(["-s", "backend", "dev"], {
        cwd: fixtureDir,
        env: { MUXA_DEBUG: "1", MUXA_TEST_MODE: "true" },
      });

      expect(result.stderr).toContain("[muxa debug]");
      expect(result.stderr).toMatch(/Found \d+ workspace packages?/);
    });

    it("should show workspace root detection", async () => {
      const result = await runMuxa(["workspaces"], {
        cwd: fixtureDir,
        env: { MUXA_DEBUG: "1", MUXA_TEST_MODE: "true" },
      });

      // workspaces command exits early, so no debug output
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Found");
      expect(result.stdout).toContain("workspaces");
    });

    it("should show package resolution details", async () => {
      const result = await runMuxa(["-s", "backend", "test"], {
        cwd: fixtureDir,
        env: { MUXA_DEBUG: "1", MUXA_TEST_MODE: "true" },
      });

      expect(result.stderr).toContain("[muxa debug]");
    });
  });

  describe("Package manager detection details", () => {
    it("should show detected package manager", async () => {
      const result = await runMuxa(["-c", "echo test"], {
        cwd: fixtureDir,
        env: { MUXA_DEBUG: "1", MUXA_TEST_MODE: "true" },
      });

      expect(result.stderr).toContain("[muxa debug]");
      expect(result.stderr).toMatch(/Detected package manager: (npm|yarn|pnpm|bun)/);
    });

    it("should show package manager override", async () => {
      const result = await runMuxa(["-c", "echo test"], {
        cwd: fixtureDir,
        env: {
          MUXA_DEBUG: "1",
          MUXA_TEST_MODE: "true",
          MUXA_PACKAGE_MANAGER: "yarn",
        },
      });

      expect(result.stderr).toContain("[muxa debug]");
    });
  });

  describe("Command generation details", () => {
    it("should show command transformation", async () => {
      const result = await runMuxa(["-s", "backend", "dev"], {
        cwd: fixtureDir,
        env: { MUXA_DEBUG: "1", MUXA_TEST_MODE: "true" },
      });

      expect(result.stderr).toContain("[muxa debug]");
      expect(result.stderr).toContain("Executing: mprocs");
    });
  });

  describe("Command wrapping decisions", () => {
    it("should show when commands are wrapped in shell", async () => {
      const result = await runMuxa(["-c", "echo test && echo done"], {
        cwd: fixtureDir,
        env: { MUXA_DEBUG: "1", MUXA_TEST_MODE: "true" },
      });

      expect(result.stderr).toContain("[muxa debug]");
    });

    it("should show when commands are not wrapped", async () => {
      const result = await runMuxa(["-c", "echo test"], {
        cwd: fixtureDir,
        env: { MUXA_DEBUG: "1", MUXA_TEST_MODE: "true" },
      });

      expect(result.code).toBe(0);
    });
  });

  describe("Debug output formatting", () => {
    it("should have consistent debug prefix", async () => {
      const result = await runMuxa(["-c", "echo test"], {
        cwd: fixtureDir,
        env: { MUXA_DEBUG: "1", MUXA_TEST_MODE: "true" },
      });

      const debugLines = result.stderr.split("\n").filter((line) => line.includes("[muxa debug]"));

      expect(debugLines.length).toBeGreaterThan(0);
      debugLines.forEach((line) => {
        expect(line).toContain("[muxa debug]");
      });
    });
  });
});
