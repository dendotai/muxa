import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getMuxaCommand, getMuxaProcesses, runMuxaQuick } from "@tests/helpers/muxa-runner";

describe("Environment Variables", () => {
  let originalEnv: typeof process.env;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    for (const key in process.env) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  describe("FORCE_COLOR default setting", () => {
    it("should set FORCE_COLOR=1 by default", async () => {
      // Remove FORCE_COLOR if it exists
      delete process.env.FORCE_COLOR;

      const result = await runMuxaQuick(["-c", "echo $FORCE_COLOR"]);
      expect(result.stdout).toContain("FORCE_COLOR=1");
    });

    it("should preserve existing FORCE_COLOR value", async () => {
      process.env.FORCE_COLOR = "0";

      const result = await runMuxaQuick(["-c", "echo $FORCE_COLOR"]);
      expect(result.stdout).not.toContain("FORCE_COLOR=1");
      expect(result.stdout).toContain("FORCE_COLOR=0");
    });

    it("should allow FORCE_COLOR to be unset with empty value", async () => {
      process.env.FORCE_COLOR = "";

      const result = await runMuxaQuick(["-c", "echo ${FORCE_COLOR:-unset}"]);
      expect(result.stdout).toContain("FORCE_COLOR=");
    });
  });

  describe("NODE_ENV preservation", () => {
    it("should preserve NODE_ENV from parent process", async () => {
      process.env.NODE_ENV = "production";

      const result = await runMuxaQuick(["-c", "echo $NODE_ENV"]);
      expect(result.stdout).toContain("NODE_ENV=production");
    });

    it("should not set NODE_ENV if not present", async () => {
      delete process.env.NODE_ENV;

      const result = await runMuxaQuick(["-c", "echo ${NODE_ENV:-unset}"]);
      expect(result.stdout).not.toContain("NODE_ENV=");
    });
  });

  describe("Inline environment variables", () => {
    it("should handle inline environment variables in commands", async () => {
      const result = await getMuxaProcesses(["-c", "FOO=bar echo $FOO"]);
      expect(result.processes).toMatchObject([{ command: "FOO=bar echo $FOO" }]);
    });

    it("should handle multiple inline environment variables", async () => {
      const result = await getMuxaProcesses(["-c", "FOO=bar BAZ=qux echo $FOO $BAZ"]);
      expect(result.processes).toMatchObject([{ command: "FOO=bar BAZ=qux echo $FOO $BAZ" }]);
    });

    it("should handle environment variables with spaces in values", async () => {
      const result = await getMuxaProcesses(["-c", "MESSAGE='hello world' echo $MESSAGE"]);
      expect(result.processes).toMatchObject([{ command: "MESSAGE='hello world' echo $MESSAGE" }]);
    });
  });

  describe("Complex environment usage", () => {
    it("should pass through PATH variable", async () => {
      const result = await runMuxaQuick(["-c", "echo $PATH"]);
      expect(result.stdout).toContain("PATH=");
      expect(result.stdout).toContain(process.env.PATH || "");
    });

    it("should handle environment variable expansion in commands", async () => {
      process.env.TEST_VAR = "test_value";

      const result = await getMuxaProcesses(["-c", "echo prefix_${TEST_VAR}_suffix"]);
      expect(result.processes).toMatchObject([{ command: "echo prefix_${TEST_VAR}_suffix" }]);
    });

    it("should handle environment variables in npm scripts", async () => {
      process.env.CUSTOM_ENV = "custom_value";

      const result = await runMuxaQuick(["dev"]);
      expect(result.stdout).toContain("CUSTOM_ENV=custom_value");
    });

    it("should handle HOME variable", async () => {
      const result = await runMuxaQuick(["-c", "echo $HOME"]);
      expect(result.stdout).toContain("HOME=");
      expect(result.stdout).toContain(process.env.HOME || "");
    });

    it("should handle undefined environment variables", async () => {
      delete process.env.UNDEFINED_VAR;

      const result = await getMuxaProcesses(["-c", "echo ${UNDEFINED_VAR:-default}"]);
      expect(result.processes).toMatchObject([{ command: "echo ${UNDEFINED_VAR:-default}" }]);
    });
  });

  describe("Environment variable interaction with shell wrapping", () => {
    it("should properly wrap commands with environment variables", async () => {
      const result = await getMuxaCommand(["-c", "echo $USER && echo $HOME"]);
      expect(result.command).toEqual(["sh", "-c", "echo $USER && echo $HOME"]);
    });

    it("should handle escaped environment variables", async () => {
      const result = await getMuxaProcesses(["-c", "echo \\$HOME"]);
      expect(result.processes).toMatchObject([{ command: "echo \\$HOME" }]);
    });
  });

  describe("Custom environment variables", () => {
    it("should pass custom environment variables to child processes", async () => {
      process.env.MUXA_CUSTOM = "custom_value";

      const result = await runMuxaQuick(["-c", "echo $MUXA_CUSTOM"]);
      expect(result.stdout).toContain("MUXA_CUSTOM=custom_value");
    });

    it("should handle environment variables with special characters", async () => {
      process.env.SPECIAL_VAR = "value-with-dash_and_underscore";

      const result = await runMuxaQuick(["-c", "echo $SPECIAL_VAR"]);
      expect(result.stdout).toContain("SPECIAL_VAR=value-with-dash_and_underscore");
    });
  });
});
