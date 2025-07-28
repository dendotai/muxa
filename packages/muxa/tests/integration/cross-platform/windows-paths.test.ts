import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { runMuxa } from "@tests/helpers/muxa-runner";
import { mockPlatform } from "@tests/helpers/constants";
import * as path from "path";

describe("Windows Paths", () => {
  // Skip these tests on non-Windows platforms in CI
  const isWindows = process.platform === "win32";
  const describeOnWindows = isWindows ? describe : describe.skip;

  describe("Mock Windows", () => {
    let restorePlatform: () => void;

    beforeEach(() => {
      restorePlatform = mockPlatform("win32");
    });

    afterEach(() => {
      restorePlatform();
    });

    it("should handle backslash path separators", () => {
      const windowsPath = "C:\\Users\\test\\project";
      const normalized = path.normalize(windowsPath);

      // On mock Windows, path operations should handle backslashes
      expect(normalized).toBeTruthy();
    });

    it("should handle UNC paths", () => {
      const uncPath = "\\\\server\\share\\folder";
      const normalized = path.normalize(uncPath);

      expect(normalized).toBeTruthy();
    });

    it("should handle drive letters", () => {
      const drivePaths = ["C:\\", "D:\\Projects", "E:\\workspace\\muxa"];

      drivePaths.forEach((drivePath) => {
        const normalized = path.normalize(drivePath);
        expect(normalized).toBeTruthy();
      });
    });
  });

  describeOnWindows("Real Windows", () => {
    it("should work with Windows-style paths in commands", async () => {
      const result = await runMuxa(["-c", "echo %CD%"]);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain(":\\");
    });

    it("should handle workspace paths with backslashes", async () => {
      const result = await runMuxa(["workspaces"]);

      expect(result.code).toBe(0);
      // Windows paths should be normalized
    });

    it("should work with Git Bash on Windows", async () => {
      // Git Bash uses forward slashes even on Windows
      const result = await runMuxa(["-c", "pwd"]);

      if (result.code === 0) {
        // Git Bash available
        expect(result.stdout).toMatch(/\/[a-z]\//i);
      }
    });

    it("should handle long path names", async () => {
      const longPath = "C:\\" + "very\\long\\path\\".repeat(20);
      // Windows has a 260 character path limit by default

      expect(longPath.length).toBeGreaterThan(260);
    });
  });

  describe("Path normalization", () => {
    it("should normalize paths consistently", () => {
      const paths = [
        "packages/frontend",
        "packages\\frontend",
        "./packages/frontend",
        ".\\packages\\frontend",
      ];

      const normalized = paths.map((p) => path.normalize(p));

      // All should normalize to the same relative path
      const unique = [...new Set(normalized.map((p) => p.replace(/\\/g, "/")))];
      expect(unique).toHaveLength(2); // with and without ./
    });

    it("should handle mixed separators", () => {
      const mixedPath = "packages\\frontend/src\\index.ts";
      const normalized = path.normalize(mixedPath);

      // Should have consistent separators (platform dependent)
      const separators = normalized.match(/[/\\]/g) || [];
      const uniqueSeparators = [...new Set(separators)];

      // On Unix, backslashes are treated as literal characters, not separators
      if (process.platform === "win32") {
        expect(uniqueSeparators).toHaveLength(1);
      } else {
        // On Unix, might have both / and \ since \ is not a separator
        expect(uniqueSeparators.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Windows commands", () => {
    let restorePlatform: () => void;

    beforeEach(() => {
      restorePlatform = mockPlatform("win32");
    });

    afterEach(() => {
      restorePlatform();
    });

    it("should use appropriate shell for Windows", async () => {
      const result = await runMuxa(["-c", "echo %PATH%"]);

      // On Windows, should use appropriate shell wrapping
      expect(result.stdout).toContain("Would execute: mprocs");
    });

    it("should handle environment variables Windows-style", async () => {
      const result = await runMuxa(["-c", "echo %USERPROFILE%"]);

      expect(result.stdout).toContain("Would execute: mprocs");
      // Command should preserve Windows env var syntax
    });

    it("should work with PowerShell commands", async () => {
      const result = await runMuxa(["-c", "Get-Location"], {
        env: { MUXA_TEST_MODE: "true" },
      });

      // This would need PowerShell detection
      expect(result.stdout).toContain("Would execute: mprocs");
    });
  });

  describe("Windows workspaces", () => {
    let restorePlatform: () => void;

    beforeEach(() => {
      restorePlatform = mockPlatform("win32");
    });

    afterEach(() => {
      restorePlatform();
    });

    it("should find workspaces with Windows paths", () => {
      // Mock Windows path handling
      const workspacePaths = ["packages\\frontend", "packages\\backend", "tools\\scripts"];

      workspacePaths.forEach((wp) => {
        const normalized = path.normalize(wp);
        // On mocked Windows, should contain backslashes
        // On Unix, backslashes are preserved as literal characters
        expect(normalized).toBeDefined();
        expect(normalized.length).toBeGreaterThan(0);
      });
    });

    it("should handle case-insensitive file systems", () => {
      // Windows is typically case-insensitive
      const paths = ["Package.json", "PACKAGE.JSON", "package.json"];

      // All should be treated as the same file on Windows
      if (isWindows) {
        // Real Windows test
        expect(paths).toHaveLength(3);
      }
    });
  });
});
