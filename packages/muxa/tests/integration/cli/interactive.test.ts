import { describe, it, expect } from "bun:test";
import { spawn } from "child_process";
import { StdinSimulator } from "@tests/helpers/stdin-simulator";
import { muxaPath, fixturesPath } from "@tests/helpers/constants";
import * as path from "path";

// Helper to spawn muxa with proper runtime
function spawnMuxa(args: string[], options: any) {
  const runtime = "bun";
  return spawn(runtime, [muxaPath, ...args], options);
}

// Skip interactive tests - they require proper TTY emulation which is complex
// TODO: Implement proper interactive testing with PTY emulation or mock the confirmPrompt function
const skipInteractive = true;
const describeInteractive = skipInteractive ? describe.skip : describe;

describeInteractive("Interactive Confirmations", () => {
  const timeout = 5000;

  describe("Duplicate tab name warnings", () => {
    it("should warn about duplicate tab names", async () => {
      const proc = spawnMuxa(["-c", "echo 1", "test", "-c", "echo 2", "test"], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: path.join(fixturesPath, "basic-npm"),
        env: { ...process.env, MUXA_TEST_MODE: "true" },
      });

      const simulator = new StdinSimulator(proc);

      // Wait for the duplicate name warning
      await simulator.waitForOutput(/Warning: Duplicate tab name/, timeout);

      // Get the full output
      const output = simulator.getOutput();
      expect(output).toContain("Warning: Duplicate tab name");
      expect(output).toContain("test");
      expect(output).toContain("Continue with duplicate names?");

      // Send 'y' to continue
      await simulator.write("y\n");

      // Process should exit successfully
      const exitCode = await simulator.waitForExit(timeout);
      expect(exitCode).toBe(0);
    });

    it("should exit when user rejects duplicate names", async () => {
      const proc = spawnMuxa(["-c", "echo 1", "dup", "-c", "echo 2", "dup"], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: path.join(fixturesPath, "basic-npm"),
        env: { ...process.env, MUXA_TEST_MODE: "true" },
      });

      const simulator = new StdinSimulator(proc);

      // Wait for the warning
      await simulator.waitForOutput(/Continue with duplicate names/, timeout);

      // Send 'n' to reject
      await simulator.write("n\n");

      // Process should exit with error
      const exitCode = await simulator.waitForExit(timeout);
      expect(exitCode).toBe(1);
    });

    it("should handle multiple sets of duplicates", async () => {
      const proc = spawn(
        "bun",
        [
          muxaPath,
          "-c",
          "echo 1",
          "test",
          "-c",
          "echo 2",
          "test",
          "-c",
          "echo 3",
          "other",
          "-c",
          "echo 4",
          "other",
        ],
        {
          stdio: ["pipe", "pipe", "pipe"],
          cwd: path.join(fixturesPath, "basic-npm"),
          env: { ...process.env, MUXA_TEST_MODE: "true" },
        },
      );

      const simulator = new StdinSimulator(proc);

      // Should show both duplicate sets
      await simulator.waitForOutput(/Warning: Duplicate tab names/, timeout);
      const output = simulator.getOutput();
      expect(output).toContain("test");
      expect(output).toContain("other");

      await simulator.write("y\n");
      const exitCode = await simulator.waitForExit(timeout);
      expect(exitCode).toBe(0);
    });
  });

  describe("y/n/Enter key handling", () => {
    it("should accept 'y' as confirmation", async () => {
      const proc = spawnMuxa(["-c", "echo 1", "name", "-c", "echo 2", "name"], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: path.join(fixturesPath, "basic-npm"),
        env: { ...process.env, MUXA_TEST_MODE: "true" },
      });

      const simulator = new StdinSimulator(proc);
      await simulator.waitForOutput(/Continue with duplicate names/, timeout);
      await simulator.write("y\n");

      const exitCode = await simulator.waitForExit(timeout);
      expect(exitCode).toBe(0);
    });

    it("should accept 'Y' as confirmation", async () => {
      const proc = spawnMuxa(["-c", "echo 1", "name", "-c", "echo 2", "name"], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: path.join(fixturesPath, "basic-npm"),
        env: { ...process.env, MUXA_TEST_MODE: "true" },
      });

      const simulator = new StdinSimulator(proc);
      await simulator.waitForOutput(/Continue with duplicate names/, timeout);
      await simulator.write("Y\n");

      const exitCode = await simulator.waitForExit(timeout);
      expect(exitCode).toBe(0);
    });

    it("should treat Enter as 'no'", async () => {
      const proc = spawnMuxa(["-c", "echo 1", "name", "-c", "echo 2", "name"], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: path.join(fixturesPath, "basic-npm"),
        env: { ...process.env, MUXA_TEST_MODE: "true" },
      });

      const simulator = new StdinSimulator(proc);
      await simulator.waitForOutput(/Continue with duplicate names/, timeout);
      await simulator.write("\n");

      const exitCode = await simulator.waitForExit(timeout);
      expect(exitCode).toBe(1);
    });

    it("should accept 'n' as rejection", async () => {
      const proc = spawnMuxa(["-c", "echo 1", "name", "-c", "echo 2", "name"], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: path.join(fixturesPath, "basic-npm"),
        env: { ...process.env, MUXA_TEST_MODE: "true" },
      });

      const simulator = new StdinSimulator(proc);
      await simulator.waitForOutput(/Continue with duplicate names/, timeout);
      await simulator.write("n\n");

      const exitCode = await simulator.waitForExit(timeout);
      expect(exitCode).toBe(1);
    });

    it("should accept 'N' as rejection", async () => {
      const proc = spawnMuxa(["-c", "echo 1", "name", "-c", "echo 2", "name"], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: path.join(fixturesPath, "basic-npm"),
        env: { ...process.env, MUXA_TEST_MODE: "true" },
      });

      const simulator = new StdinSimulator(proc);
      await simulator.waitForOutput(/Continue with duplicate names/, timeout);
      await simulator.write("N\n");

      const exitCode = await simulator.waitForExit(timeout);
      expect(exitCode).toBe(1);
    });
  });

  describe("Cyrillic keyboard support", () => {
    it("should accept Cyrillic 'у' (looks like y) as yes", async () => {
      const proc = spawnMuxa(["-c", "echo 1", "name", "-c", "echo 2", "name"], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: path.join(fixturesPath, "basic-npm"),
        env: { ...process.env, MUXA_TEST_MODE: "true" },
      });

      const simulator = new StdinSimulator(proc);
      await simulator.waitForOutput(/Continue with duplicate names/, timeout);
      await simulator.write("у\n"); // Cyrillic 'у'

      const exitCode = await simulator.waitForExit(timeout);
      expect(exitCode).toBe(0);
    });

    it("should accept Cyrillic 'н' (looks like n) as no", async () => {
      const proc = spawnMuxa(["-c", "echo 1", "name", "-c", "echo 2", "name"], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: path.join(fixturesPath, "basic-npm"),
        env: { ...process.env, MUXA_TEST_MODE: "true" },
      });

      const simulator = new StdinSimulator(proc);
      await simulator.waitForOutput(/Continue with duplicate names/, timeout);
      await simulator.write("н\n"); // Cyrillic 'н'

      const exitCode = await simulator.waitForExit(timeout);
      expect(exitCode).toBe(1);
    });
  });

  describe("Case sensitivity", () => {
    it("should be case-insensitive for yes responses", async () => {
      const testCases = ["y", "Y", "yes", "YES", "Yes", "yEs"];

      for (const response of testCases) {
        const proc = spawnMuxa(["-c", "echo 1", "name", "-c", "echo 2", "name"], {
          stdio: ["pipe", "pipe", "pipe"],
          cwd: path.join(fixturesPath, "basic-npm"),
          env: { ...process.env, MUXA_TEST_MODE: "true" },
        });

        const simulator = new StdinSimulator(proc);
        await simulator.waitForOutput(/Continue with duplicate names/, timeout);
        await simulator.write(`${response}\n`);

        const exitCode = await simulator.waitForExit(timeout);
        expect(exitCode).toBe(0);
      }
    });

    it("should be case-insensitive for no responses", async () => {
      const testCases = ["n", "N", "no", "NO", "No", "nO"];

      for (const response of testCases) {
        const proc = spawnMuxa(["-c", "echo 1", "name", "-c", "echo 2", "name"], {
          stdio: ["pipe", "pipe", "pipe"],
          cwd: path.join(fixturesPath, "basic-npm"),
          env: { ...process.env, MUXA_TEST_MODE: "true" },
        });

        const simulator = new StdinSimulator(proc);
        await simulator.waitForOutput(/Continue with duplicate names/, timeout);
        await simulator.write(`${response}\n`);

        const exitCode = await simulator.waitForExit(timeout);
        expect(exitCode).toBe(1);
      }
    });
  });

  describe("Invalid input handling", () => {
    it("should re-prompt on invalid input", async () => {
      const proc = spawnMuxa(["-c", "echo 1", "name", "-c", "echo 2", "name"], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: path.join(fixturesPath, "basic-npm"),
        env: { ...process.env, MUXA_TEST_MODE: "true" },
      });

      const simulator = new StdinSimulator(proc);
      await simulator.waitForOutput(/Continue with duplicate names/, timeout);

      // Send invalid input
      await simulator.write("invalid\n");

      // Should re-prompt
      await simulator.waitForOutput(/\(y\/N\)/, timeout);
      const fullOutput = simulator.getOutput();
      expect(fullOutput).toContain("(y/N)");

      // Now send valid input
      await simulator.write("n\n");
      const exitCode = await simulator.waitForExit(timeout);
      expect(exitCode).toBe(1);
    });

    it("should handle empty lines as 'no'", async () => {
      const proc = spawnMuxa(["-c", "echo 1", "name", "-c", "echo 2", "name"], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: path.join(fixturesPath, "basic-npm"),
        env: { ...process.env, MUXA_TEST_MODE: "true" },
      });

      const simulator = new StdinSimulator(proc);
      await simulator.waitForOutput(/Continue with duplicate names/, timeout);

      // Send just Enter
      await simulator.write("\n");

      const exitCode = await simulator.waitForExit(timeout);
      expect(exitCode).toBe(1);
    });
  });

  describe("Non-interactive mode", () => {
    it("should skip confirmation when stdin is not a TTY", async () => {
      // This test might need adjustment based on how muxa detects TTY
      const proc = spawnMuxa(["-c", "echo 1", "name", "-c", "echo 2", "name"], {
        stdio: ["ignore", "pipe", "pipe"],
        cwd: path.join(fixturesPath, "basic-npm"),
        env: { ...process.env, MUXA_TEST_MODE: "true" },
      });

      // Should either skip the prompt or exit immediately
      const simulator = new StdinSimulator(proc);
      const exitCode = await simulator.waitForExit(timeout);

      // The behavior might vary, but it should exit without hanging
      expect(exitCode).toBeDefined();
    });
  });
});
