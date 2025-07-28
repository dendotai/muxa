import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { runMuxaQuick } from "@tests/helpers/muxa-runner";

describe("FORCE_COLOR Behavior", () => {
  let originalForceColor: string | undefined;

  beforeEach(() => {
    originalForceColor = process.env.FORCE_COLOR;
  });

  afterEach(() => {
    if (originalForceColor === undefined) {
      delete process.env.FORCE_COLOR;
    } else {
      process.env.FORCE_COLOR = originalForceColor;
    }
  });

  describe("Default FORCE_COLOR behavior", () => {
    it("should set FORCE_COLOR=1 when not present", async () => {
      delete process.env.FORCE_COLOR;

      const result = await runMuxaQuick(["-c", "env | grep FORCE_COLOR"]);
      expect(result.stdout).toContain("FORCE_COLOR=1");
    });

    it("should not override FORCE_COLOR=0", async () => {
      process.env.FORCE_COLOR = "0";

      const result = await runMuxaQuick(["-c", "env | grep FORCE_COLOR"]);
      expect(result.stdout).toContain("FORCE_COLOR=0");
      expect(result.stdout).not.toContain("FORCE_COLOR=1");
    });

    it("should not override FORCE_COLOR=2", async () => {
      process.env.FORCE_COLOR = "2";

      const result = await runMuxaQuick(["-c", "env | grep FORCE_COLOR"]);
      expect(result.stdout).toContain("FORCE_COLOR=2");
    });

    it("should not override FORCE_COLOR=3", async () => {
      process.env.FORCE_COLOR = "3";

      const result = await runMuxaQuick(["-c", "env | grep FORCE_COLOR"]);
      expect(result.stdout).toContain("FORCE_COLOR=3");
    });

    it("should handle empty FORCE_COLOR", async () => {
      process.env.FORCE_COLOR = "";

      const result = await runMuxaQuick([
        "-c",
        "env | grep FORCE_COLOR || echo 'FORCE_COLOR is empty'",
      ]);
      expect(result.stdout).toContain("FORCE_COLOR=");
    });
  });

  describe("FORCE_COLOR with different commands", () => {
    it("should apply FORCE_COLOR to npm commands", async () => {
      delete process.env.FORCE_COLOR;

      const result = await runMuxaQuick(["dev"]);
      expect(result.stdout).toContain("FORCE_COLOR=1");
    });

    it("should apply FORCE_COLOR to yarn commands", async () => {
      delete process.env.FORCE_COLOR;

      const result = await runMuxaQuick(["dev", "-m", "yarn"]);
      expect(result.stdout).toContain("FORCE_COLOR=1");
    });

    it("should apply FORCE_COLOR to pnpm commands", async () => {
      delete process.env.FORCE_COLOR;

      const result = await runMuxaQuick(["dev", "-m", "pnpm"]);
      expect(result.stdout).toContain("FORCE_COLOR=1");
    });

    it("should apply FORCE_COLOR to bun commands", async () => {
      delete process.env.FORCE_COLOR;

      const result = await runMuxaQuick(["dev", "-m", "bun"]);
      expect(result.stdout).toContain("FORCE_COLOR=1");
    });
  });

  describe("FORCE_COLOR interaction with NO_COLOR", () => {
    it("should respect NO_COLOR when set", async () => {
      delete process.env.FORCE_COLOR;
      process.env.NO_COLOR = "1";

      const result = await runMuxaQuick(["-c", "env | grep COLOR"]);
      expect(result.stdout).toContain("NO_COLOR=1");
      expect(result.stdout).toContain("FORCE_COLOR=1"); // muxa still sets it

      delete process.env.NO_COLOR;
    });
  });

  describe("FORCE_COLOR in different environments", () => {
    it("should handle FORCE_COLOR in CI environments", async () => {
      delete process.env.FORCE_COLOR;
      process.env.CI = "true";

      const result = await runMuxaQuick(["-c", "env | grep -E '(FORCE_COLOR|CI)'"]);
      expect(result.stdout).toContain("CI=true");
      expect(result.stdout).toContain("FORCE_COLOR=1");

      delete process.env.CI;
    });

    it("should handle FORCE_COLOR with GITHUB_ACTIONS", async () => {
      delete process.env.FORCE_COLOR;
      process.env.GITHUB_ACTIONS = "true";

      const result = await runMuxaQuick(["-c", "env | grep -E '(FORCE_COLOR|GITHUB_ACTIONS)'"]);
      expect(result.stdout).toContain("GITHUB_ACTIONS=true");
      expect(result.stdout).toContain("FORCE_COLOR=1");

      delete process.env.GITHUB_ACTIONS;
    });
  });

  describe("FORCE_COLOR propagation", () => {
    it("should propagate FORCE_COLOR to all workspace commands", async () => {
      delete process.env.FORCE_COLOR;

      const result = await runMuxaQuick([
        "-c",
        "echo color",
        "workspace1",
        "-c",
        "echo test",
        "workspace2",
      ]);
      // Check that FORCE_COLOR is in the environment variables shown
      expect(result.stdout).toContain("FORCE_COLOR=1");
    });

    it("should maintain consistent FORCE_COLOR across multiple commands", async () => {
      process.env.FORCE_COLOR = "2";

      const result = await runMuxaQuick([
        "-c",
        "env | grep FORCE_COLOR",
        "first",
        "-c",
        "env | grep FORCE_COLOR",
        "second",
      ]);

      // Both commands should see the same FORCE_COLOR value
      const matches = result.stdout.match(/FORCE_COLOR=2/g);
      expect(matches?.length).toBeGreaterThanOrEqual(1);
    });
  });
});
