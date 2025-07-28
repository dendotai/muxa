import { describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { detectPackageManager, readPackageScripts, validateScript } from "@/package-manager";
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

    it("should detect yarn from yarn.lock", () => {
      const tempDir = createTempWorkspace("muxa-pm-test");
      fs.writeFileSync(path.join(tempDir, "yarn.lock"), "");

      // Set test mode to prevent fallback to npm
      const oldTestMode = process.env.MUXA_TEST_MODE;
      process.env.MUXA_TEST_MODE = "true";

      const pm = detectPackageManager(tempDir);
      expect(pm.type).toBe("yarn");
      expect(pm.runCommand).toBe("yarn run");
      expect(pm.isFallback).toBe(false);

      // Restore env
      if (oldTestMode) {
        process.env.MUXA_TEST_MODE = oldTestMode;
      } else {
        delete process.env.MUXA_TEST_MODE;
      }

      cleanupFixture(tempDir);
    });

    it("should detect pnpm from pnpm-lock.yaml", () => {
      const tempDir = createTempWorkspace("muxa-pm-test");
      fs.writeFileSync(path.join(tempDir, "pnpm-lock.yaml"), "");

      const pm = detectPackageManager(tempDir);
      expect(pm.type).toBe("pnpm");
      expect(pm.runCommand).toBe("pnpm run");
      expect(pm.isFallback).toBe(false);

      cleanupFixture(tempDir);
    });

    it("should detect bun from bun.lockb", () => {
      const tempDir = createTempWorkspace("muxa-pm-test");
      fs.writeFileSync(path.join(tempDir, "bun.lockb"), "");

      const pm = detectPackageManager(tempDir);
      expect(pm.type).toBe("bun");
      expect(pm.runCommand).toBe("bun run");
      expect(pm.isFallback).toBe(false);

      cleanupFixture(tempDir);
    });

    it("should detect from packageManager field", () => {
      const tempDir = createTempWorkspace("muxa-pm-test");
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify({ packageManager: "pnpm@8.0.0" }),
      );

      const pm = detectPackageManager(tempDir);
      expect(pm.type).toBe("pnpm");
      expect(pm.isFallback).toBe(false);

      cleanupFixture(tempDir);
    });

    it("should default to npm when no indicators", () => {
      const tempDir = createTempWorkspace("muxa-pm-test");

      const pm = detectPackageManager(tempDir);
      expect(pm.type).toBe("npm");
      expect(pm.isFallback).toBe(true);

      cleanupFixture(tempDir);
    });

    it("should mark as fallback when package manager not available", () => {
      const tempDir = createTempWorkspace("muxa-pm-test");
      fs.writeFileSync(path.join(tempDir, "yarn.lock"), "");

      // Mock yarn not being available
      const oldPath = process.env.PATH;
      process.env.PATH = "/nonexistent";

      const pm = detectPackageManager(tempDir);
      expect(pm.type).toBe("npm");
      expect(pm.isFallback).toBe(true);
      expect(pm.available).toBe(false); // npm won't be available with PATH="/nonexistent"

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
  });
});
