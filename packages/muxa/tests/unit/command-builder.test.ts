import { describe, it, expect, afterEach, beforeEach } from "bun:test";
import { buildCommands, buildMprocsArgs } from "@/command-builder";
import type { ParseResult, ParsedCommand } from "@/parser";
import { discoverWorkspaces } from "@/workspace";
import { detectPackageManager } from "@/package-manager";
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
        mprocsArgs: [],
      };

      const result = buildCommands(parsed, workspace, packageManager);

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe("backend:dev");
      expect(result[0]!.needsShell).toBe(true);
      expect(result[0]!.command).toContain("cd");
      expect(result[0]!.command).toContain("backend");
      expect(result[0]!.command).toContain("npm run dev");
    });

    it("should work with scoped packages", () => {
      process.chdir(path.join(fixturesPath, "scoped-packages"));
      const workspace = discoverWorkspaces();
      const packageManager = detectPackageManager(process.cwd());

      const parsed: ParseResult = {
        mode: "advanced",
        commands: [{ type: "script", command: "", target: "@company/auth", script: "build" }],
        mprocsArgs: [],
      };

      const result = buildCommands(parsed, workspace, packageManager);

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe("auth:build");
      expect(result[0]!.command).toContain("libs/auth");
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
        mprocsArgs: [],
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
          mprocsArgs: [],
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
        mprocsArgs: [],
      };

      const result = buildCommands(parsed, workspace, packageManager);

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe("api:dev");
      expect(result[0]!.needsShell).toBe(true);
      expect(result[0]!.command).toContain("cd");
      expect(result[0]!.command).toContain("packages/api");
      expect(result[0]!.command).toContain("npm run dev");
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
        mprocsArgs: [],
      };

      const result = buildCommands(parsed, workspace, packageManager);
      expect(result[0]!.name).toBe(".:build");
      expect(result[0]!.command).toContain("cd");
      expect(result[0]!.command).toContain("npm run build");
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
        mprocsArgs: [],
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
        mprocsArgs: [],
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
        mprocsArgs: [],
      };

      const result = buildCommands(parsed, workspace, packageManager);

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe("list");
      expect(result[0]!.needsShell).toBe(true);
      expect(result[0]!.command).toContain("cd");
      expect(result[0]!.command).toContain("packages/web");
      expect(result[0]!.command).toContain("ls -la");
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
        mprocsArgs: [],
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
        mprocsArgs: [],
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
        mprocsArgs: [],
      };

      expect(() => buildCommands(parsed, workspace, packageManager)).toThrow(
        "No workspace configuration found",
      );
    });

    it("should work with different package managers", () => {
      const packageManagers: Array<"npm" | "yarn" | "pnpm" | "bun"> = [
        "npm",
        "yarn",
        "pnpm",
        "bun",
      ];

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
          mprocsArgs: [],
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
        mprocsArgs: [],
      };

      const result = buildCommands(parsed, workspace, packageManager);

      expect(result).toHaveLength(3);
      expect(result[0]!.name).toBe("startup");
      expect(result[1]!.name).toBe("api:dev");
      expect(result[2]!.name).toBe("web");
    });
  });
});

describe("buildMprocsArgs", () => {
  it("should build args for simple commands", () => {
    const commands = [{ command: "echo hello", name: "test", needsShell: false }];
    const parsed: ParseResult = {
      mode: "advanced",
      commands: [],
      mprocsArgs: [],
    };

    const args = buildMprocsArgs(commands, parsed);

    expect(args).toContain("--names");
    expect(args).toContain("test");
    expect(args).toContain("echo hello");
  });

  it("should wrap shell commands", () => {
    const commands = [{ command: "echo hello && echo world", name: "test", needsShell: true }];
    const parsed: ParseResult = {
      mode: "advanced",
      commands: [],
      mprocsArgs: [],
    };

    const args = buildMprocsArgs(commands, parsed);

    expect(args.some((arg) => arg.startsWith("sh -c"))).toBe(true);
    expect(args.some((arg) => arg.includes("echo hello && echo world"))).toBe(true);
  });

  it("should pass through mprocs args", () => {
    const commands = [{ command: "echo hello", name: "test", needsShell: false }];
    const parsed: ParseResult = {
      mode: "advanced",
      commands: [],
      mprocsArgs: ["--hide-help", "--ctl", "c"],
    };

    const args = buildMprocsArgs(commands, parsed);

    expect(args).toContain("--hide-help");
    expect(args).toContain("--ctl");
    expect(args).toContain("c");
  });

  it("should handle multiple commands with names", () => {
    const commands = [
      { command: "echo one", name: "first", needsShell: false },
      { command: "echo two", name: "second", needsShell: false },
    ];
    const parsed: ParseResult = {
      mode: "advanced",
      commands: [],
      mprocsArgs: [],
    };

    const args = buildMprocsArgs(commands, parsed);

    expect(args).toContain("--names");
    expect(args).toContain("first,second");
    expect(args).toContain("echo one");
    expect(args).toContain("echo two");
  });

  it("should not add names in basic mode", () => {
    const commands = [{ command: "echo hello", name: "test", needsShell: false }];
    const parsed: ParseResult = {
      mode: "basic",
      commands: [],
      mprocsArgs: [],
    };

    const args = buildMprocsArgs(commands, parsed);

    expect(args).not.toContain("--names");
    expect(args).toContain("echo hello");
  });

  it("should skip empty names", () => {
    const commands = [
      { command: "echo one", name: "", needsShell: false },
      { command: "echo two", name: "second", needsShell: false },
    ];
    const parsed: ParseResult = {
      mode: "advanced",
      commands: [],
      mprocsArgs: [],
    };

    const args = buildMprocsArgs(commands, parsed);

    expect(args).toContain("--names");
    expect(args).toContain("second");
    expect(args).not.toContain(",second");
  });

  it("should handle special characters in shell commands", () => {
    const commands = [{ command: "echo 'hello world'", name: "test", needsShell: true }];
    const parsed: ParseResult = {
      mode: "advanced",
      commands: [],
      mprocsArgs: [],
    };

    const args = buildMprocsArgs(commands, parsed);

    const shellCmd = args.find((arg) => arg.startsWith("sh -c"));
    expect(shellCmd).toBeDefined();
    // The shell command should contain the echo command, even if escaped
    expect(shellCmd).toContain("echo");
    expect(shellCmd).toContain("hello world");
  });
});
