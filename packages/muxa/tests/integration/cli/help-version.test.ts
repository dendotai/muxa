import { describe, it, expect } from "bun:test";
import { runMuxa } from "@tests/helpers/muxa-runner";

describe("Muxa CLI Integration > Help and Version", () => {
  it("should show help when no arguments provided", async () => {
    const result = await runMuxa([]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("muxa");
    expect(result.stdout).toContain("Run multiple processes with monorepo awareness");
    expect(result.stdout).toContain("Usage:");
  });

  it("should show help with --help", async () => {
    const result = await runMuxa(["--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("-c, --command");
    expect(result.stdout).toContain("-s, --script");
    expect(result.stdout).toContain("-w, --workspace");
  });

  it("should show help with -h", async () => {
    const result = await runMuxa(["-h"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage:");
  });

  it("should show version", async () => {
    const result = await runMuxa(["--version"]);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("should show version with -V", async () => {
    const result = await runMuxa(["-V"]);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
