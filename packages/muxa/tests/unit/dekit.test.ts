import { describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { dekitBinaryPath } from "@/dekit";

function fakeResolve(packages: Record<string, string>) {
  return (id: string) => {
    const dir = packages[id.replace(/\/package\.json$/, "")];
    if (!dir) throw new Error(`Cannot find module '${id}'`);
    return path.join(dir, "package.json");
  };
}

describe("dekitBinaryPath", () => {
  it("finds the installed binary for this machine", () => {
    const binary = dekitBinaryPath();
    expect(fs.statSync(binary).mode & 0o111).not.toBe(0);
  });

  it("resolves the canary package of the platform", () => {
    const resolve = fakeResolve({
      "@den-ai/dekit-canary-linux-arm64": "/store/@den-ai/dekit-canary-linux-arm64",
    });
    expect(dekitBinaryPath("linux", "arm64", () => resolve)).toBe(
      "/store/@den-ai/dekit-canary-linux-arm64/bin/dekit",
    );
  });

  it("names the Windows binary dekit.exe", () => {
    const resolve = fakeResolve({
      "@den-ai/dekit-canary-win32-x64": "/store/@den-ai/dekit-canary-win32-x64",
    });
    expect(dekitBinaryPath("win32", "x64", () => resolve)).toBe(
      path.join("/store/@den-ai/dekit-canary-win32-x64", "bin", "dekit.exe"),
    );
  });

  it("names the missing package when dekit ships no binary for the machine", () => {
    const resolve = fakeResolve({});
    expect(() => dekitBinaryPath("freebsd", "x64", () => resolve)).toThrow(
      "dekit has no binary for freebsd x64 (missing @den-ai/dekit-canary-freebsd-x64)",
    );
  });
});
