import { describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import {
  detectPackageManager,
  readPackageScripts,
  validateScript,
  getRunCommand,
  type PackageManager,
} from "@/package-manager";
import { cleanupFixture, createTempWorkspace } from "@tests/helpers/fixture-helpers";

describe("Package Manager", () => {
  describe("detectPackageManager", () => {
    it("should detect npm from package-lock.json", () => {
      const tempDir = createTempWorkspace("muxa-pm-test");
      fs.writeFileSync(path.join(tempDir, "package-lock.json"), "{}");

      const pm = detectPackageManager(tempDir);
      expect(pm.type).toBe("npm");
      expect(pm.runCommand).toBe("npm run");
      expect(pm.isFallback).toBe(false);

      cleanupFixture(tempDir);
    });

    // TODO: These tests are environment-dependent and should be run in a CI matrix
    // with different package managers installed. See ROADMAP.md

    it("should default to npm when no indicators", () => {
      const tempDir = createTempWorkspace("muxa-pm-test");

      const pm = detectPackageManager(tempDir);
      expect(pm.type).toBe("npm");
      expect(pm.isFallback).toBe(true);

      cleanupFixture(tempDir);
    });

    it("should fall back to npm when detected package manager is not available", () => {
      const tempDir = createTempWorkspace("muxa-pm-test");
      fs.writeFileSync(path.join(tempDir, "yarn.lock"), "");

      // Mock yarn not being available
      const oldPath = process.env.PATH;
      process.env.PATH = "/nonexistent";

      const pm = detectPackageManager(tempDir);

      // Should always fall back to npm when yarn is detected but not available
      expect(pm.type).toBe("npm");
      expect(pm.available).toBe(false); // npm also won't be available with PATH="/nonexistent"
      expect(pm.isFallback).toBe(true);

      // Restore PATH
      process.env.PATH = oldPath;
      cleanupFixture(tempDir);
    });

    it("should handle priority correctly (lockfile > packageManager field)", () => {
      const tempDir = createTempWorkspace("muxa-pm-test");

      // Write both a lockfile and packageManager field with different values
      fs.writeFileSync(path.join(tempDir, "bun.lockb"), "");
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify({ packageManager: "pnpm@8.0.0" }),
      );

      const pm = detectPackageManager(tempDir);
      expect(pm.type).toBe("bun"); // lockfile takes priority
      expect(pm.isFallback).toBe(false);

      cleanupFixture(tempDir);
    });

    it("should detect from packageManager field with various formats", () => {
      const tempDir = createTempWorkspace("muxa-pm-test");

      // Test valid packageManager field formats
      // Only npm and bun are typically available in test environments
      const packageManagers: Array<{ field: string; expected: PackageManager }> = [
        { field: "npm@9.0.0", expected: "npm" },
        { field: "bun@1.0.0", expected: "bun" },
      ];

      for (const { field, expected } of packageManagers) {
        fs.writeFileSync(
          path.join(tempDir, "package.json"),
          JSON.stringify({ packageManager: field }),
        );

        const pm = detectPackageManager(tempDir);
        expect(pm.type).toBe(expected);
        expect(pm.isFallback).toBe(false);
      }

      // Test package managers that will fall back to npm when not available
      const unavailableManagers: Array<{ field: string; expected: "npm" }> = [
        { field: "yarn@1.22.19", expected: "npm" },
        { field: "pnpm@8.6.0", expected: "npm" },
      ];

      for (const { field, expected } of unavailableManagers) {
        fs.writeFileSync(
          path.join(tempDir, "package.json"),
          JSON.stringify({ packageManager: field }),
        );

        const pm = detectPackageManager(tempDir);
        // If yarn/pnpm is not available, it falls back to npm
        if (pm.type === "npm" && pm.isFallback) {
          expect(pm.type).toBe(expected);
          expect(pm.isFallback).toBe(true);
        } else {
          // If they are available in the environment, they should be detected
          expect(["yarn", "pnpm"]).toContain(pm.type);
        }
      }

      cleanupFixture(tempDir);
    });

    it("should handle invalid packageManager field formats", () => {
      const tempDir = createTempWorkspace("muxa-pm-test");

      // Test invalid formats that should fall back to npm
      const invalidFormats = [
        "invalid-format",
        "npm", // missing version
        "@9.0.0", // missing name
        "unknownpm@1.0.0", // unknown package manager
      ];

      for (const field of invalidFormats) {
        fs.writeFileSync(
          path.join(tempDir, "package.json"),
          JSON.stringify({ packageManager: field }),
        );

        const pm = detectPackageManager(tempDir);
        expect(pm.type).toBe("npm");
        expect(pm.isFallback).toBe(true);
      }

      cleanupFixture(tempDir);
    });

    it("should handle malformed package.json gracefully", () => {
      const tempDir = createTempWorkspace("muxa-pm-test");

      // Write invalid JSON
      fs.writeFileSync(path.join(tempDir, "package.json"), "{ invalid json");

      const pm = detectPackageManager(tempDir);
      expect(pm.type).toBe("npm");
      expect(pm.isFallback).toBe(true);

      cleanupFixture(tempDir);
    });

    it("should log debug output when MUXA_DEBUG is set", () => {
      const tempDir = createTempWorkspace("muxa-pm-test");

      // Set up console.error spy
      const originalError = console.error;
      const errorMessages: string[] = [];
      console.error = (...args: any[]) => {
        errorMessages.push(args.join(" "));
      };

      // Test malformed JSON with debug enabled
      process.env.MUXA_DEBUG = "1";
      fs.writeFileSync(path.join(tempDir, "package.json"), "{ invalid json");
      detectPackageManager(tempDir);

      expect(errorMessages.some((msg) => msg.includes("Failed to read package.json"))).toBe(true);

      // Test package manager not available with debug enabled
      errorMessages.length = 0;
      fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify({}));
      fs.writeFileSync(path.join(tempDir, "yarn.lock"), "");

      const oldPath = process.env.PATH;
      process.env.PATH = "/nonexistent";
      detectPackageManager(tempDir);

      expect(
        errorMessages.some((msg) =>
          msg.includes("yarn detected but not available in PATH, falling back to npm"),
        ),
      ).toBe(true);

      // Restore
      process.env.PATH = oldPath;
      delete process.env.MUXA_DEBUG;
      console.error = originalError;
      cleanupFixture(tempDir);
    });
  });

  describe("readPackageScripts", () => {
    it("should read scripts from package.json", () => {
      const tempDir = createTempWorkspace("muxa-scripts-test");
      const packageJsonPath = path.join(tempDir, "package.json");

      fs.writeFileSync(
        packageJsonPath,
        JSON.stringify(
          {
            name: "test",
            scripts: {
              dev: "vite",
              build: "vite build",
              test: "vitest",
            },
          },
          null,
          2,
        ),
      );

      const { scripts, scriptsLine } = readPackageScripts(packageJsonPath);

      expect(scripts).toEqual({
        dev: "vite",
        build: "vite build",
        test: "vitest",
      });
      expect(scriptsLine).toBe(3); // Line number where "scripts" appears

      cleanupFixture(tempDir);
    });

    it("should handle missing scripts section", () => {
      const tempDir = createTempWorkspace("muxa-scripts-test");
      const packageJsonPath = path.join(tempDir, "package.json");

      fs.writeFileSync(packageJsonPath, JSON.stringify({ name: "test" }));

      const { scripts } = readPackageScripts(packageJsonPath);
      expect(scripts).toEqual({});

      cleanupFixture(tempDir);
    });

    it("should throw error for non-existent package.json", () => {
      const tempDir = createTempWorkspace("muxa-scripts-test");
      const nonExistentPath = path.join(tempDir, "non-existent", "package.json");

      expect(() => readPackageScripts(nonExistentPath)).toThrow(
        `Package.json not found at ${nonExistentPath}`,
      );

      cleanupFixture(tempDir);
    });
  });

  describe("validateScript", () => {
    it("should validate existing scripts", () => {
      const tempDir = createTempWorkspace("muxa-validate-test");
      const packageJsonPath = path.join(tempDir, "package.json");

      fs.writeFileSync(
        packageJsonPath,
        JSON.stringify(
          {
            name: "test-pkg",
            scripts: {
              dev: "vite",
              build: "vite build",
            },
          },
          null,
          2,
        ),
      );

      // Should not throw
      expect(() => validateScript("dev", tempDir, "test-pkg")).not.toThrow();

      cleanupFixture(tempDir);
    });

    it("should throw with helpful error for missing scripts", () => {
      const tempDir = createTempWorkspace("muxa-validate-test");
      const packageJsonPath = path.join(tempDir, "package.json");

      fs.writeFileSync(
        packageJsonPath,
        JSON.stringify(
          {
            name: "test-pkg",
            scripts: {
              dev: "vite",
              build: "vite build",
            },
          },
          null,
          2,
        ),
      );

      expect(() => validateScript("start", tempDir, "test-pkg")).toThrow(
        "Script 'start' not found in test-pkg",
      );

      try {
        validateScript("start", tempDir, "test-pkg");
      } catch (e) {
        expect((e as Error).message).toContain("Available scripts: build, dev");
      }

      cleanupFixture(tempDir);
    });

    it("should show helpful error when no scripts are defined", () => {
      const tempDir = createTempWorkspace("muxa-validate-test");
      const packageJsonPath = path.join(tempDir, "package.json");

      fs.writeFileSync(
        packageJsonPath,
        JSON.stringify({
          name: "test-pkg",
          // No scripts section
        }),
      );

      expect(() => validateScript("start", tempDir, "test-pkg")).toThrow(
        "Script 'start' not found in test-pkg",
      );

      try {
        validateScript("start", tempDir, "test-pkg");
      } catch (e) {
        expect((e as Error).message).toContain("No scripts defined in package.json");
      }

      cleanupFixture(tempDir);
    });
  });

  describe("getRunCommand", () => {
    it("should return correct run commands for all package managers", () => {
      expect(getRunCommand("npm")).toBe("npm run");
      expect(getRunCommand("yarn")).toBe("yarn run");
      expect(getRunCommand("pnpm")).toBe("pnpm run");
      expect(getRunCommand("bun")).toBe("bun run");
    });
  });
});
