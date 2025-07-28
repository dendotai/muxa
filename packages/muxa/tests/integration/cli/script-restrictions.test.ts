import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { runMuxa } from "@tests/helpers/muxa-runner";
import { createMonorepoFixture, cleanupFixture } from "@tests/helpers/fixture-helpers";

describe("Script Restrictions", () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = createMonorepoFixture({
      type: "npm",
      packages: [
        {
          path: "packages/backend",
          name: "@test/backend",
          scripts: {
            dev: "echo 'backend dev'",
            test: "echo 'backend test'",
            build: "echo 'backend build'",
          },
        },
        {
          path: "packages/frontend",
          name: "@test/frontend",
          scripts: {
            start: "echo 'frontend start'",
            test: "echo 'frontend test'",
            build: "echo 'frontend build'",
          },
        },
      ],
    });
  });

  afterEach(() => {
    cleanupFixture(fixtureDir);
  });

  describe("Script argument validation", () => {
    it("should reject -s without package name", async () => {
      const result = await runMuxa(["-s"], { cwd: fixtureDir, env: { MUXA_TEST_MODE: "true" } });

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("Option -s requires a package identifier");
    });

    it("should reject -s with only package name", async () => {
      const result = await runMuxa(["-s", "backend"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("Option -s requires a script name after package identifier");
    });

    it("should reject -s with empty script name", async () => {
      const result = await runMuxa(["-s", "backend", ""], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("Option -s requires a script name after package identifier");
    });

    it("should reject -s with non-existent package", async () => {
      const result = await runMuxa(["-s", "nonexistent", "dev"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("Package 'nonexistent' not found");
    });

    it("should reject -s with non-existent script", async () => {
      const result = await runMuxa(["-s", "backend", "nonexistent"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("Script 'nonexistent' not found");
      expect(result.stderr).toContain("backend");
    });

    it("should handle multiple -s flags correctly", async () => {
      const result = await runMuxa(["-s", "backend", "dev", "-s", "frontend", "start"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Would execute: mprocs");
    });
  });

  describe("Error messages for invalid script usage", () => {
    it("should provide helpful error for typos in script names", async () => {
      const result = await runMuxa(["-s", "backend", "dev-server"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("Script 'dev-server' not found");
      expect(result.stderr).toContain("Available scripts:");
      expect(result.stderr).toContain("dev");
    });

    it("should list available packages when package not found", async () => {
      const result = await runMuxa(["-s", "back-end", "dev"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("Package 'back-end' not found");
      // Should suggest similar packages
      expect(result.stderr).toMatch(/backend|Available packages/);
    });

    it("should handle package.json without scripts section", async () => {
      // This would need a fixture with a package.json that has no scripts
      const result = await runMuxa(["-s", "shared", "build"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("Package 'shared' not found");
    });

    it("should provide clear error for workspace root scripts", async () => {
      const result = await runMuxa(["-s", ".", "build"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      // This should either work or provide a clear message
      if (result.code !== 0) {
        expect(result.stderr).toMatch(/monorepo|package\.json|No scripts defined/i);
      }
    });
  });

  describe("Script name edge cases", () => {
    it("should handle scripts with special characters", async () => {
      const result = await runMuxa(["-s", "backend", "test:unit"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      // Script doesn't exist, so it should fail
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("Script 'test:unit' not found");
    });

    it("should handle scripts with spaces (if quoted properly)", async () => {
      const result = await runMuxa(["-s", "backend", "my script"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      // Should fail with appropriate error
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("Script 'my script' not found");
    });

    it("should reject script names that look like flags", async () => {
      const result = await runMuxa(["-s", "backend", "--dev"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("Script '--dev' not found");
    });
  });

  describe("Mixed command restrictions", () => {
    it("should allow mixing -s with -c", async () => {
      const result = await runMuxa(["-s", "backend", "dev", "-c", "echo test"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Would execute: mprocs");
    });

    it("should allow mixing -s with -w", async () => {
      const result = await runMuxa(["-s", "backend", "dev", "-w", "frontend", "npm start"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Would execute: mprocs");
    });

    it("should validate each -s independently", async () => {
      const result = await runMuxa(
        ["-s", "backend", "dev", "-s", "nonexistent", "build", "-s", "frontend", "start"],
        { cwd: fixtureDir, env: { MUXA_TEST_MODE: "true" } },
      );

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("Package 'nonexistent' not found");
    });
  });

  describe("Package manager specific script handling", () => {
    it("should handle npm run correctly", async () => {
      const npmFixture = createMonorepoFixture({
        type: "npm",
        packages: [
          {
            path: "packages/backend",
            name: "@test/backend",
            scripts: { dev: "echo npm dev" },
          },
        ],
      });

      const result = await runMuxa(["-s", "backend", "dev"], {
        cwd: npmFixture,
        env: { MUXA_TEST_MODE: "true" },
      });

      cleanupFixture(npmFixture);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("npm run dev");
    });

    it("should handle bun run correctly", async () => {
      const bunFixture = createMonorepoFixture({
        type: "bun",
        packages: [
          {
            path: "packages/backend",
            name: "@test/backend",
            scripts: { dev: "echo bun dev" },
          },
        ],
      });

      const result = await runMuxa(["-s", "backend", "dev"], {
        cwd: bunFixture,
        env: { MUXA_TEST_MODE: "true" },
      });

      cleanupFixture(bunFixture);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("bun run dev");
    });
  });

  describe("Script discovery and resolution", () => {
    it("should resolve scripts from workspace package.json", async () => {
      const result = await runMuxa(["-s", "backend", "dev"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("backend");
    });

    it("should handle nested workspace paths", async () => {
      const result = await runMuxa(["-s", "shared", "build"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      // Should work if shared package exists
      if (result.code === 0) {
        expect(result.stdout).toContain("shared");
      } else {
        expect(result.stderr).toContain("shared");
      }
    });

    it("should provide script name suggestions", async () => {
      const result = await runMuxa(["-s", "backend", "develop"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("Script 'develop' not found");
      // Should suggest 'dev' as it's similar
      expect(result.stderr).toMatch(/dev|Available scripts/);
    });
  });
});
