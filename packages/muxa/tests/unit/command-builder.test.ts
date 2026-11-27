import { describe, it, expect, afterEach, beforeEach } from "bun:test";
import { buildCommands } from "@/command-builder";
import type { ParseResult, ParsedCommand } from "@/parser";
import { discoverWorkspaces } from "@/workspace";
import { detectPackageManager, type PackageManager } from "@/package-manager";
import { createMonorepoFixture, cleanupFixture } from "@tests/helpers/fixture-helpers";
import { fixturesPath } from "@tests/helpers/constants";
import * as path from "node:path";
import * as fs from "node:fs";

describe("buildCommands", () => {
  let tempDir: string | null = null;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (tempDir) {
      cleanupFixture(tempDir);
      tempDir = null;
    }
  });

  describe("using real fixtures", () => {
    it("should work with npm workspace fixture", () => {
      process.chdir(path.join(fixturesPath, "basic-npm"));
      const workspace = discoverWorkspaces();
      const packageManager = detectPackageManager(process.cwd());

      const parsed: ParseResult = {
        mode: "advanced",
        commands: [{ type: "script", command: "", target: "@basic/backend", script: "dev" }],
      };

      const result = buildCommands(parsed, workspace, packageManager);

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe("backend:dev");
      expect(result[0]!.needsShell).toBe(false);
      expect(result[0]!.command).toBe("npm run dev");
      expect(result[0]!.folder).toEndWith("/packages/backend");
    });

    it("should work with scoped packages", () => {
      process.chdir(path.join(fixturesPath, "scoped-packages"));
      const workspace = discoverWorkspaces();
      const packageManager = detectPackageManager(process.cwd());

      const parsed: ParseResult = {
        mode: "advanced",
        commands: [{ type: "script", command: "", target: "@company/auth", script: "build" }],
      };

      const result = buildCommands(parsed, workspace, packageManager);

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe("auth:build");
      expect(result[0]!.folder).toEndWith("/libs/auth");
    });
  });

  describe("command type", () => {
    it("should transform simple commands", () => {
      tempDir = createMonorepoFixture({
        type: "npm",
        packages: [],
      });
      process.chdir(tempDir);
      const workspace = discoverWorkspaces();
      const packageManager = detectPackageManager(tempDir);

      const parsed: ParseResult = {
        mode: "advanced",
        commands: [{ type: "command", command: "echo hello", name: "test" }],
      };

      const result = buildCommands(parsed, workspace, packageManager);

      expect(result).toHaveLength(1);
      expect(result[0]!).toEqual({
        command: "echo hello",
        name: "test",
        needsShell: false,
      });
    });

    it("should detect shell operators and set needsShell", () => {
      tempDir = createMonorepoFixture({
        type: "npm",
        packages: [],
      });
      process.chdir(tempDir);
      const workspace = discoverWorkspaces();
      const packageManager = detectPackageManager(tempDir);

      const shellCommands = [
        "echo hello && echo world",
        "echo hello || echo world",
        "echo hello | grep world",
        "echo hello; echo world",
        "echo hello > output.txt",
        "echo hello < input.txt",
        "ls *.txt",
        "echo $HOME",
      ];

      for (const cmd of shellCommands) {
        const parsed: ParseResult = {
          mode: "advanced",
          commands: [{ type: "command", command: cmd }],
        };

        const result = buildCommands(parsed, workspace, packageManager);
        expect(result[0]!.needsShell).toBe(true);
      }
    });
  });

  describe("script type", () => {
    it("should transform script commands", () => {
      tempDir = createMonorepoFixture({
        type: "npm",
        packages: [{ path: "packages/api", name: "@test/api", scripts: { dev: "node index.js" } }],
      });
      process.chdir(tempDir);
      const workspace = discoverWorkspaces();
      const packageManager = detectPackageManager(tempDir);

      const parsed: ParseResult = {
        mode: "advanced",
        commands: [{ type: "script", command: "", target: "api", script: "dev", name: "api:dev" }],
      };

      const result = buildCommands(parsed, workspace, packageManager);

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe("api:dev");
      expect(result[0]!.needsShell).toBe(false);
      expect(result[0]!.command).toBe("npm run dev");
      expect(result[0]!.folder).toEndWith("/packages/api");
    });

    it("should handle root package scripts with '.'", () => {
      tempDir = createMonorepoFixture({
        type: "npm",
        packages: [],
      });
      // Add a build script to the root package.json
      const rootPkgJson = JSON.parse(fs.readFileSync(path.join(tempDir, "package.json"), "utf8"));
      rootPkgJson.scripts = { build: "echo building" };
      fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify(rootPkgJson, null, 2));

      process.chdir(tempDir);
      const workspace = discoverWorkspaces();
      const packageManager = detectPackageManager(tempDir);

      const parsed: ParseResult = {
        mode: "advanced",
        commands: [{ type: "script", command: "", target: ".", script: "build" }],
      };

      const result = buildCommands(parsed, workspace, packageManager);
      expect(result[0]!.name).toBe(".:build");
      expect(result[0]!.command).toBe("npm run build");
      expect(result[0]!.folder).toBe(workspace.root);
    });

    it("should throw error for invalid script", () => {
      tempDir = createMonorepoFixture({
        type: "npm",
        packages: [{ path: "packages/api", name: "@test/api", scripts: { dev: "node index.js" } }],
      });
      process.chdir(tempDir);
      const workspace = discoverWorkspaces();
      const packageManager = detectPackageManager(tempDir);

      const parsed: ParseResult = {
        mode: "advanced",
        commands: [{ type: "script", command: "", target: "api", script: "nonexistent" }],
      };

      expect(() => buildCommands(parsed, workspace, packageManager)).toThrow(
        "Script 'nonexistent' not found",
      );
    });

    it("should throw error for missing target", () => {
      tempDir = createMonorepoFixture({
        type: "npm",
        packages: [{ path: "packages/test", name: "test" }],
      });
      process.chdir(tempDir);
      const workspace = discoverWorkspaces();
      const packageManager = detectPackageManager(tempDir);

      const parsed: ParseResult = {
        mode: "advanced",
        commands: [{ type: "script", command: "", script: "dev" } as ParsedCommand],
      };

      expect(() => buildCommands(parsed, workspace, packageManager)).toThrow(
        "Script command missing target or script name",
      );
    });
  });

  describe("workspace type", () => {
    it("should transform workspace commands", () => {
      tempDir = createMonorepoFixture({
        type: "yarn",
        packages: [{ path: "packages/web", name: "@test/web" }],
      });
      process.chdir(tempDir);
      const workspace = discoverWorkspaces();
      const packageManager = detectPackageManager(tempDir);

      const parsed: ParseResult = {
        mode: "advanced",
        commands: [{ type: "workspace", target: "web", command: "ls -la", name: "list" }],
      };

      const result = buildCommands(parsed, workspace, packageManager);

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe("list");
      expect(result[0]!.needsShell).toBe(false);
      expect(result[0]!.command).toBe("ls -la");
      expect(result[0]!.folder).toEndWith("/packages/web");
    });

    it("should use directory name as default name", () => {
      tempDir = createMonorepoFixture({
        type: "pnpm",
        packages: [{ path: "apps/mobile", name: "mobile-app" }],
      });
      process.chdir(tempDir);
      const workspace = discoverWorkspaces();
      const packageManager = detectPackageManager(tempDir);

      const parsed: ParseResult = {
        mode: "advanced",
        commands: [{ type: "workspace", target: "mobile", command: "pwd" }],
      };

      const result = buildCommands(parsed, workspace, packageManager);
      expect(result[0]!.name).toBe("mobile");
    });

    it("should throw error for missing target", () => {
      tempDir = createMonorepoFixture({
        type: "npm",
        packages: [{ path: "packages/test", name: "test-pkg" }],
      });
      process.chdir(tempDir);
      const workspace = discoverWorkspaces();
      const packageManager = detectPackageManager(tempDir);

      const parsed: ParseResult = {
        mode: "advanced",
        commands: [{ type: "workspace", command: "ls", target: "" } as ParsedCommand],
      };

      expect(() => buildCommands(parsed, workspace, packageManager)).toThrow(
        "Workspace command missing target",
      );
    });
  });

  describe("workspace validation", () => {
    it("should throw error when workspace is required but not configured", () => {
      tempDir = createMonorepoFixture({
        type: "npm",
        packages: [],
      });
      // Remove workspace config to simulate non-workspace project
      fs.unlinkSync(path.join(tempDir, "package.json"));

      process.chdir(tempDir);
      const workspace = discoverWorkspaces();
      const packageManager = detectPackageManager(tempDir);

      const parsed: ParseResult = {
        mode: "advanced",
        commands: [{ type: "script", command: "", target: "api", script: "dev" }],
      };

      expect(() => buildCommands(parsed, workspace, packageManager)).toThrow(
        "No workspace configuration found",
      );
    });

    it("should work with different package managers", () => {
      const packageManagers: Array<PackageManager> = ["npm", "yarn", "pnpm", "bun"];

      for (const pm of packageManagers) {
        const testDir = createMonorepoFixture({
          type: pm,
          packages: [
            { path: "packages/test", name: "@test/package", scripts: { start: "node ." } },
          ],
        });

        process.chdir(testDir);
        const workspace = discoverWorkspaces();
        const packageManager = detectPackageManager(testDir);

        const parsed: ParseResult = {
          mode: "advanced",
          commands: [{ type: "script", command: "", target: "test", script: "start" }],
        };

        const result = buildCommands(parsed, workspace, packageManager);
        expect(result[0]!.command).toContain(packageManager.runCommand);
        expect(result[0]!.command).toContain("start");

        process.chdir(originalCwd);
        cleanupFixture(testDir);
      }
    });
  });

  describe("multiple commands", () => {
    it("should transform multiple mixed commands", () => {
      tempDir = createMonorepoFixture({
        type: "npm",
        packages: [
          { path: "apps/api", name: "api", scripts: { dev: "nodemon" } },
          { path: "apps/web", name: "web" },
        ],
      });
      process.chdir(tempDir);
      const workspace = discoverWorkspaces();
      const packageManager = detectPackageManager(tempDir);

      const parsed: ParseResult = {
        mode: "advanced",
        commands: [
          { type: "command", command: "echo start", name: "startup" },
          { type: "script", command: "", target: "api", script: "dev" },
          { type: "workspace", target: "web", command: "npm install" },
        ],
      };

      const result = buildCommands(parsed, workspace, packageManager);

      expect(result).toHaveLength(3);
      expect(result[0]!.name).toBe("startup");
      expect(result[1]!.name).toBe("api:dev");
      expect(result[2]!.name).toBe("web");
    });
  });
});
