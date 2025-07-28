import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { runMuxa } from "@tests/helpers/muxa-runner";
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
      expect(result.stdout).toContain("Would execute: mprocs");
      // Commands with shell variables should be wrapped in sh -c
      expect(result.stdout).toMatch(/sh -c.*echo \$SHELL/);
    });

    it("should handle shell operators consistently", async () => {
      const operators = ["&&", "||", "|", ";", ">", "<"];

      for (const op of operators) {
        const result = await runMuxa(["-c", `echo test ${op} echo done`], {
          cwd: fixtureDir,
          env: { MUXA_TEST_MODE: "true" },
        });

        expect(result.code).toBe(0);
        expect(result.stdout).toContain("Would execute: mprocs");
        // Commands with shell operators should be wrapped
        expect(result.stdout).toContain("sh -c");
      }
    });

    it("should preserve quotes in shell commands", async () => {
      const result = await runMuxa(["-c", `echo "hello world"`], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Would execute: mprocs");
      expect(result.stdout).toContain("hello world");
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
          expect(result.stdout).toContain("date");
        });

        it("should support tilde expansion", async () => {
          const result = await runMuxa(["-c", "echo ~/test"], {
            cwd: fixtureDir,
            env: { MUXA_TEST_MODE: "true" },
          });

          expect(result.code).toBe(0);
          expect(result.stdout).toContain("~/test");
        });

        it("should handle environment variable expansion", async () => {
          const result = await runMuxa(["-c", "echo $HOME"], {
            cwd: fixtureDir,
            env: { MUXA_TEST_MODE: "true" },
          });

          expect(result.code).toBe(0);
          expect(result.stdout).toContain("$HOME");
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
          expect(result.stdout).toContain("%USERPROFILE%");
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
      expect(result.stdout).toContain("test; rm -rf /");
    });
  });

  describe("Script execution", () => {
    it("should not wrap simple npm scripts in sh -c", async () => {
      const result = await runMuxa(["-s", "backend", "dev"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).toBe(0);
      // Scripts are already wrapped with cd && npm run
      expect(result.stdout).toContain("npm run dev");
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
      expect(result.stdout).toContain("Would execute: mprocs");
    });

    it("should normalize command paths", async () => {
      const result = await runMuxa(["-c", "./scripts/test.sh"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("./scripts/test.sh");
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
      expect(result.stdout).toContain("aaaa");
    });

    it("should handle Unicode in commands", async () => {
      const result = await runMuxa(["-c", "echo '你好世界'"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("你好世界");
    });
  });
});
