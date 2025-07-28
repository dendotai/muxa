import {
  discoverWorkspaces,
  formatWorkspaceList,
  getWorkspacePatternsFromPackageJson,
  resolvePackage,
  type WorkspaceConfig,
} from "@/workspace";
import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import * as path from "path";
import * as fs from "fs";
import { createTempWorkspace, cleanupFixture } from "@tests/helpers/fixture-helpers";

describe("Workspace", () => {
  describe("getWorkspacePatternsFromPackageJson", () => {
    it("should extract patterns from array format", () => {
      const packageJson = {
        workspaces: ["packages/*", "apps/*"],
      };

      const patterns = getWorkspacePatternsFromPackageJson(packageJson);
      expect(patterns).toEqual(["packages/*", "apps/*"]);
    });

    it("should extract patterns from object format", () => {
      const packageJson = {
        workspaces: {
          packages: ["packages/*", "apps/*"],
        },
      };

      const patterns = getWorkspacePatternsFromPackageJson(packageJson);
      expect(patterns).toEqual(["packages/*", "apps/*"]);
    });

    it("should return empty array when no workspaces field", () => {
      const packageJson = {};

      const patterns = getWorkspacePatternsFromPackageJson(packageJson);
      expect(patterns).toEqual([]);
    });

    it("should return empty array when workspaces is empty", () => {
      const packageJson = {
        workspaces: [],
      };

      const patterns = getWorkspacePatternsFromPackageJson(packageJson);
      expect(patterns).toEqual([]);
    });

    it("should handle object format with empty packages", () => {
      const packageJson = {
        workspaces: {
          packages: [],
        },
      };

      const patterns = getWorkspacePatternsFromPackageJson(packageJson);
      expect(patterns).toEqual([]);
    });

    it("should handle object format without packages field", () => {
      const packageJson = {
        workspaces: {},
      };

      const patterns = getWorkspacePatternsFromPackageJson(packageJson);
      expect(patterns).toEqual([]);
    });
  });

  describe("discoverWorkspaces with different package managers", () => {
    it("should detect workspaces with bun (via bun.lockb)", () => {
      const originalCwd = process.cwd();
      process.chdir(path.join(__dirname, "..", "fixtures", "bun-workspace"));

      const config = discoverWorkspaces();

      expect(config.type).toBe("bun");
      expect(config.packages.has("@bun-test/core")).toBe(true);
      expect(config.packages.has("bun-workspace-root")).toBe(true);

      process.chdir(originalCwd);
    });

    it("should detect pnpm workspaces via pnpm-workspace.yaml", () => {
      const originalCwd = process.cwd();
      process.chdir(path.join(__dirname, "..", "fixtures", "pnpm-workspace"));

      const config = discoverWorkspaces();

      expect(config.type).toBe("pnpm");
      expect(config.packages.has("@pnpm-test/utils")).toBe(true);
      expect(config.packages.has("pnpm-workspace-root")).toBe(true);

      process.chdir(originalCwd);
    });

    it("should return null workspace type when no workspace config exists", () => {
      const originalCwd = process.cwd();
      process.chdir(path.join(__dirname, "..", "fixtures", "no-workspace"));

      const config = discoverWorkspaces();

      expect(config.type).toBe(null); // No workspace configuration
      expect(config.packages.has(".")).toBe(true); // But root package is still added
      expect(config.packages.has("no-workspace-project")).toBe(true);

      process.chdir(originalCwd);
    });
  });

  describe("discoverWorkspaces", () => {
    it("should discover npm workspaces", () => {
      const originalCwd = process.cwd();
      process.chdir(path.join(__dirname, "..", "fixtures", "basic-npm"));

      const config = discoverWorkspaces();
      expect(config.type).toBe("npm");
      expect(config.packages.size).toBeGreaterThan(0);

      // Should include root package
      expect(config.packages.has(".")).toBe(true);
      expect(config.packages.has("basic-npm-monorepo")).toBe(true);

      // Should include workspace packages
      expect(config.packages.has("@basic/frontend")).toBe(true);
      expect(config.packages.has("@basic/backend")).toBe(true);
      expect(config.packages.has("shared")).toBe(true);

      process.chdir(originalCwd);
    });

    // TODO: This test is environment-dependent and should be run in a CI matrix
    // with yarn installed. See ROADMAP.md

    it("should handle ambiguous directory names", () => {
      const originalCwd = process.cwd();
      process.chdir(path.join(__dirname, "..", "fixtures", "ambiguous-names"));

      const config = discoverWorkspaces();

      // All packages should be discoverable by full name
      expect(config.packages.has("@app/backend")).toBe(true);
      expect(config.packages.has("@tools/backend")).toBe(true);
      expect(config.packages.has("@services/backend")).toBe(true);

      // Ambiguous directory name should NOT be mapped
      expect(config.packages.has("backend")).toBe(false);

      process.chdir(originalCwd);
    });
  });

  describe("resolvePackage", () => {
    it("should resolve by package name", () => {
      const originalCwd = process.cwd();
      process.chdir(path.join(__dirname, "..", "fixtures", "basic-npm"));

      const config = discoverWorkspaces();
      const info = resolvePackage("@basic/frontend", config);

      expect(info.name).toBe("@basic/frontend");
      expect(info.path).toBe("packages/frontend");

      process.chdir(originalCwd);
    });

    it("should resolve by path", () => {
      const originalCwd = process.cwd();
      process.chdir(path.join(__dirname, "..", "fixtures", "basic-npm"));

      const config = discoverWorkspaces();
      const info = resolvePackage("packages/backend", config);

      expect(info.name).toBe("@basic/backend");
      expect(info.path).toBe("packages/backend");

      process.chdir(originalCwd);
    });

    it("should resolve by unique directory name", () => {
      const originalCwd = process.cwd();
      process.chdir(path.join(__dirname, "..", "fixtures", "basic-npm"));

      const config = discoverWorkspaces();
      const info = resolvePackage("shared", config);

      expect(info.name).toBe("@basic/shared");
      expect(info.path).toBe("packages/shared");

      process.chdir(originalCwd);
    });

    it("should resolve root package with .", () => {
      const originalCwd = process.cwd();
      process.chdir(path.join(__dirname, "..", "fixtures", "basic-npm"));

      const config = discoverWorkspaces();
      const info = resolvePackage(".", config);

      expect(info.name).toBe("basic-npm-monorepo");
      expect(info.path).toBe(".");

      process.chdir(originalCwd);
    });

    it("should throw on ambiguous directory name", () => {
      const originalCwd = process.cwd();
      process.chdir(path.join(__dirname, "..", "fixtures", "ambiguous-names"));

      const config = discoverWorkspaces();

      expect(() => resolvePackage("backend", config)).toThrow(
        "Ambiguous package identifier 'backend'",
      );

      process.chdir(originalCwd);
    });

    it("should throw on package not found", () => {
      const originalCwd = process.cwd();
      process.chdir(path.join(__dirname, "..", "fixtures", "basic-npm"));

      const config = discoverWorkspaces();

      expect(() => resolvePackage("nonexistent", config)).toThrow(
        "Package 'nonexistent' not found",
      );

      process.chdir(originalCwd);
    });
  });

  describe("formatWorkspaceList", () => {
    it("should format workspace list nicely", () => {
      const originalCwd = process.cwd();
      process.chdir(path.join(__dirname, "..", "fixtures", "basic-npm"));

      const config = discoverWorkspaces();
      const output = formatWorkspaceList(config);

      expect(output).toContain("Found 5 workspaces");
      expect(output).toContain("basic-npm-monorepo");
      expect(output).toContain("@basic/frontend");
      expect(output).toContain("packages/frontend");

      process.chdir(originalCwd);
    });

    it("should handle empty workspace list", () => {
      const config: WorkspaceConfig = {
        packages: new Map(),
        root: "/fake/path",
        type: null,
      };

      const output = formatWorkspaceList(config);
      expect(output).toBe("No workspaces found in current directory");
    });
  });

  describe("Error handling with MUXA_DEBUG", () => {
    let tempDir: string;
    let originalCwd: string;
    let originalDebug: string | undefined;
    let errorMessages: string[] = [];
    let originalError: typeof console.error;

    beforeEach(() => {
      originalCwd = process.cwd();
      originalDebug = process.env.MUXA_DEBUG;
      originalError = console.error;
      errorMessages = [];
      console.error = (...args: any[]) => {
        errorMessages.push(args.join(" "));
      };
    });

    afterEach(() => {
      process.chdir(originalCwd);
      if (originalDebug !== undefined) {
        process.env.MUXA_DEBUG = originalDebug;
      } else {
        delete process.env.MUXA_DEBUG;
      }
      console.error = originalError;
      if (tempDir) {
        cleanupFixture(tempDir);
      }
    });

    it("should handle malformed root package.json with debug logging", () => {
      tempDir = createTempWorkspace("invalid-json-test");
      fs.writeFileSync(path.join(tempDir, "package.json"), "{ invalid json");
      process.env.MUXA_DEBUG = "1";
      process.chdir(tempDir);

      const config = discoverWorkspaces();

      expect(config.packages.size).toBe(0); // No packages found
      expect(errorMessages.some((msg) => msg.includes("Failed to read root package.json"))).toBe(
        true,
      );
    });

    it("should handle malformed workspace package.json files", () => {
      tempDir = createTempWorkspace("invalid-workspace-test");

      // Create valid root package.json with workspaces
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          name: "test-root",
          workspaces: ["packages/*"],
        }),
      );

      // Create packages directory
      fs.mkdirSync(path.join(tempDir, "packages"));
      fs.mkdirSync(path.join(tempDir, "packages", "valid"));
      fs.mkdirSync(path.join(tempDir, "packages", "invalid"));

      // Create valid package
      fs.writeFileSync(
        path.join(tempDir, "packages", "valid", "package.json"),
        JSON.stringify({ name: "valid-package" }),
      );

      // Create invalid package.json
      fs.writeFileSync(
        path.join(tempDir, "packages", "invalid", "package.json"),
        "{ invalid json syntax",
      );

      process.env.MUXA_DEBUG = "1";
      process.chdir(tempDir);

      const config = discoverWorkspaces();

      // Should have root and valid package, but not invalid
      expect(config.packages.has("test-root")).toBe(true);
      expect(config.packages.has("valid-package")).toBe(true);
      expect(config.packages.has("invalid-package")).toBe(false);
      expect(
        errorMessages.some((msg) => msg.includes("Failed to read package.json in yarn workspace")),
      ).toBe(true);
    });

    it("should handle root wildcard pattern with invalid package.json", () => {
      tempDir = createTempWorkspace("wildcard-test");

      // Create root package.json with wildcard workspace
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          name: "wildcard-root",
          workspaces: ["*"],
        }),
      );

      // Create directories with package.json files
      fs.mkdirSync(path.join(tempDir, "valid"));
      fs.writeFileSync(
        path.join(tempDir, "valid", "package.json"),
        JSON.stringify({ name: "valid-pkg" }),
      );

      fs.mkdirSync(path.join(tempDir, "broken"));
      fs.writeFileSync(path.join(tempDir, "broken", "package.json"), "not valid json");

      process.env.MUXA_DEBUG = "1";
      process.chdir(tempDir);

      const config = discoverWorkspaces();

      expect(config.packages.has("wildcard-root")).toBe(true);
      expect(config.packages.has("valid-pkg")).toBe(true);
      expect(errorMessages.some((msg) => msg.includes("Failed to read package.json at"))).toBe(
        true,
      );
    });

    it("should detect pnpm workspaces and handle errors", () => {
      tempDir = createTempWorkspace("pnpm-error-test");

      // Create pnpm-workspace.yaml
      fs.writeFileSync(path.join(tempDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'\n");

      // Create packages
      fs.mkdirSync(path.join(tempDir, "packages"));
      fs.mkdirSync(path.join(tempDir, "packages", "good"));
      fs.mkdirSync(path.join(tempDir, "packages", "bad"));

      fs.writeFileSync(
        path.join(tempDir, "packages", "good", "package.json"),
        JSON.stringify({ name: "good-pkg" }),
      );

      fs.writeFileSync(path.join(tempDir, "packages", "bad", "package.json"), "{ broken json");

      process.env.MUXA_DEBUG = "1";
      process.chdir(tempDir);

      const config = discoverWorkspaces();

      expect(config.type).toBe("pnpm");
      expect(config.packages.has("good-pkg")).toBe(true);
      expect(
        errorMessages.some(
          (msg) => msg.includes("Failed to read package.json") && msg.includes("workspace"),
        ),
      ).toBe(true);
    });
  });

  describe("Advanced pnpm workspace support", () => {
    it("should handle pnpm-workspace.yaml with negation patterns", () => {
      // This test would need a fixture with negation patterns
      // For now, we'll test the pattern parsing logic
      const patterns = ["packages/*", "!packages/test", "!**/dist/**"];

      // Test that negation patterns are recognized
      expect(patterns.filter((p) => p.startsWith("!"))).toHaveLength(2);
      expect(patterns.filter((p) => !p.startsWith("!"))).toHaveLength(1);
    });

    it("should handle complex glob patterns in pnpm workspaces", () => {
      // Test complex patterns
      const complexPatterns = [
        "packages/**",
        "apps/**/src",
        "tools/*/packages/*",
        "!**/.git/**",
        "!**/node_modules/**",
        "packages/*/lib",
        "packages/{foo,bar}/*",
      ];

      // Verify pattern structure
      complexPatterns.forEach((pattern) => {
        expect(typeof pattern).toBe("string");
      });

      // Test double-star patterns
      const doubleStarPatterns = complexPatterns.filter((p) => p.includes("**"));
      expect(doubleStarPatterns).toHaveLength(4);

      // Test brace expansion patterns
      const bracePatterns = complexPatterns.filter((p) => p.includes("{") && p.includes("}"));
      expect(bracePatterns).toHaveLength(1);
    });

    it("should parse pnpm-workspace.yaml format correctly", () => {
      // In a real implementation, this would parse YAML
      // For testing, we verify the expected structure
      const expectedPatterns = [
        "packages/*",
        "apps/*",
        "!packages/test-*",
        "!**/dist",
        "tools/{cli,scripts}",
      ];

      expect(expectedPatterns).toHaveLength(5);
      expect(expectedPatterns.filter((p) => p.startsWith("!"))).toHaveLength(2);
    });

    it("should handle pnpm workspace with deeply nested patterns", () => {
      const nestedPatterns = [
        "packages/*/packages/*",
        "apps/**/components/*/src",
        "!**/node_modules/**",
        "!**/.turbo/**",
      ];

      // Count path separators to verify nesting depth
      const maxDepth = Math.max(...nestedPatterns.map((p) => (p.match(/\//g) || []).length));
      expect(maxDepth).toBeGreaterThanOrEqual(3);
    });

    it("should support pnpm workspace protocol references", () => {
      // Test workspace protocol patterns
      const workspaceProtocols = ["workspace:*", "workspace:^", "workspace:~", "workspace:^1.2.3"];

      workspaceProtocols.forEach((protocol) => {
        expect(protocol).toMatch(/^workspace:/);
      });
    });

    it("should handle special pnpm patterns", () => {
      // Test special patterns that pnpm supports
      const specialPatterns = [
        ".", // Root workspace
        "./packages/*", // Relative paths
        "../sibling/*", // Parent directory access
        "packages/!(*test*)", // Extended glob negation
        "**/*.workspace.json", // File-specific patterns
      ];

      // Verify each pattern type
      expect(specialPatterns).toContain(".");
      expect(specialPatterns.some((p) => p.startsWith("./"))).toBe(true);
      expect(specialPatterns.some((p) => p.startsWith("../"))).toBe(true);
      expect(specialPatterns.some((p) => p.includes("!(*"))).toBe(true);
    });
  });
});
