import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { dekitTasksOf, processesOf, runMuxa } from "@tests/helpers/muxa-runner";
import { createMonorepoFixture, cleanupFixture } from "@tests/helpers/fixture-helpers";

describe("Shell Execution", () => {
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
          },
        },
      ],
    });
  });

  afterEach(() => {
    cleanupFixture(fixtureDir);
  });

  describe("sh -c wrapper behavior", () => {
    it("should verify sh -c works on current platform", async () => {
      const result = await runMuxa(["-c", "echo $SHELL"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).toBe(0);
      expect(dekitTasksOf(result.stdout)).toMatchObject([{ cmd: ["sh", "-c", "echo $SHELL"] }]);
    });

    it("should handle shell operators consistently", async () => {
      const operators = ["&&", "||", "|", ";", ">", "<"];

      for (const op of operators) {
        const result = await runMuxa(["-c", `echo test ${op} echo done`], {
          cwd: fixtureDir,
          env: { MUXA_TEST_MODE: "true" },
        });

        expect(result.code).toBe(0);
        expect(dekitTasksOf(result.stdout)).toMatchObject([
          { cmd: ["sh", "-c", `echo test ${op} echo done`] },
        ]);
      }
    });

    it("should preserve quotes in shell commands", async () => {
      const result = await runMuxa(["-c", `echo "hello world"`], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).toBe(0);
      expect(processesOf(result.stdout)).toMatchObject([{ command: `echo "hello world"` }]);
    });
  });

  describe("Platform shells", () => {
    describe("Linux/macOS", () => {
      const isUnix = process.platform !== "win32";
      const describeOnUnix = isUnix ? describe : describe.skip;

      describeOnUnix("Unix features", () => {
        it("should support bash-style command substitution", async () => {
          const result = await runMuxa(["-c", "echo $(date +%Y)"], {
            cwd: fixtureDir,
            env: { MUXA_TEST_MODE: "true" },
          });

          expect(result.code).toBe(0);
          expect(processesOf(result.stdout)).toMatchObject([{ command: "echo $(date +%Y)" }]);
        });

        it("should support tilde expansion", async () => {
          const result = await runMuxa(["-c", "echo ~/test"], {
            cwd: fixtureDir,
            env: { MUXA_TEST_MODE: "true" },
          });

          expect(result.code).toBe(0);
          expect(processesOf(result.stdout)).toMatchObject([{ command: "echo ~/test" }]);
        });

        it("should handle environment variable expansion", async () => {
          const result = await runMuxa(["-c", "echo $HOME"], {
            cwd: fixtureDir,
            env: { MUXA_TEST_MODE: "true" },
          });

          expect(result.code).toBe(0);
          expect(processesOf(result.stdout)).toMatchObject([{ command: "echo $HOME" }]);
        });
      });
    });

    describe("Windows", () => {
      const isWindows = process.platform === "win32";
      const describeOnWindows = isWindows ? describe : describe.skip;

      describeOnWindows("Windows features", () => {
        it("should handle Windows environment variables", async () => {
          const result = await runMuxa(["-c", "echo %USERPROFILE%"], {
            cwd: fixtureDir,
            env: { MUXA_TEST_MODE: "true" },
          });

          expect(result.code).toBe(0);
          expect(processesOf(result.stdout)).toMatchObject([{ command: "echo %USERPROFILE%" }]);
        });
      });
    });
  });

  describe("Command safety", () => {
    it("should handle commands with special characters", async () => {
      const result = await runMuxa(["-c", "echo 'test & echo gotcha'"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).toBe(0);
      // The & should be inside quotes, not treated as a shell operator
      expect(result.stdout).toContain("test & echo gotcha");
    });

    it("should handle commands with semicolons safely", async () => {
      const result = await runMuxa(["-c", "echo 'test; rm -rf /'"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).toBe(0);
      expect(processesOf(result.stdout)).toMatchObject([{ command: "echo 'test; rm -rf /'" }]);
    });
  });

  describe("Script execution", () => {
    it("should not wrap simple npm scripts in sh -c", async () => {
      const result = await runMuxa(["-s", "backend", "dev"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).toBe(0);
      expect(processesOf(result.stdout)).toMatchObject([{ command: "npm run dev" }]);
    });

    it("should handle missing sh gracefully", async () => {
      // This test would need to mock a system without sh
      // For now, just verify the command generation
      const result = await runMuxa(["dev"], { cwd: fixtureDir, env: { MUXA_TEST_MODE: "true" } });

      expect(result.code).toBe(0);
    });
  });

  describe("Cross-platform command compatibility", () => {
    it("should generate portable commands", async () => {
      const commands = ["-c", "echo test", "-c", "npm install", "-c", "node script.js"];

      const result = await runMuxa(commands, {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).toBe(0);
      expect(processesOf(result.stdout).map(({ command }) => command)).toEqual([
        "echo test",
        "npm install",
        "node script.js",
      ]);
    });

    it("should normalize command paths", async () => {
      const result = await runMuxa(["-c", "./scripts/test.sh"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).toBe(0);
      expect(processesOf(result.stdout)).toMatchObject([{ command: "./scripts/test.sh" }]);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty commands gracefully", async () => {
      const result = await runMuxa(["-c", ""], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      // Empty commands should be rejected
      expect(result.code).not.toBe(0);
    });

    it("should handle very long commands", async () => {
      const longCommand = "echo " + "a".repeat(1000);
      const result = await runMuxa(["-c", longCommand], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).toBe(0);
      expect(processesOf(result.stdout)).toMatchObject([{ command: longCommand }]);
    });

    it("should handle Unicode in commands", async () => {
      const result = await runMuxa(["-c", "echo '你好世界'"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).toBe(0);
      expect(processesOf(result.stdout)).toMatchObject([{ command: "echo '你好世界'" }]);
    });
  });
});
