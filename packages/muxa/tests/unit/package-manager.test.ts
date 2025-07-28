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
