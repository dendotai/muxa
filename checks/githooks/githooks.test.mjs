import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const HOOKS_DIR = join(ROOT, ".githooks");
const SCRIPTS = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts;

// Without `set -e`, a failing line before the last one lets the commit through. Each hook file says why it has the `unset`.
const HEADER = ["#!/bin/sh", "set -e", "unset GIT_DIR GIT_INDEX_FILE GIT_PREFIX"];

describe("git hooks", () => {
  describe("`install.mjs`", () => {
    const install = (cwd, ci) => {
      const { CI: _, ...env } = process.env;
      return spawnSync(process.execPath, [join(import.meta.dir, "install.mjs")], {
        cwd,
        env: ci ? { ...env, CI: "true" } : env,
      });
    };
    const hooksPath = (cwd) =>
      spawnSync("git", ["config", "core.hooksPath"], { cwd, encoding: "utf8" }).stdout.trim();
    const tempDirs = [];
    const tempDir = () => {
      tempDirs.push(mkdtempSync(join(tmpdir(), "githooks-")));
      return tempDirs.at(-1);
    };
    afterAll(() => {
      for (const dir of tempDirs) rmSync(dir, { recursive: true });
    });
    const tempRepo = () => {
      const dir = tempDir();
      spawnSync("git", ["init", "--quiet"], { cwd: dir });
      return dir;
    };

    test("is what the root `prepare` script runs", () => {
      expect(SCRIPTS.prepare).toBe("bun checks/githooks/install.mjs");
    });

    test("points git at .githooks", () => {
      const repo = tempRepo();
      expect(install(repo, false).status).toBe(0);
      expect(hooksPath(repo)).toBe(".githooks");
    });

    test("leaves the hooks off in CI, where a release push would run pre-push", () => {
      const repo = tempRepo();
      expect(install(repo, true).status).toBe(0);
      expect(hooksPath(repo)).toBe("");
    });

    test("passes in a folder with no git repo, so `bun install` passes there", () => {
      expect(install(tempDir(), false).status).toBe(0);
    });
  });

  // Finder puts a `.DS_Store` in a folder it opens.
  const hooks = readdirSync(HOOKS_DIR).filter((name) => !name.startsWith("."));

  for (const hook of hooks) {
    describe(hook, () => {
      const lines = readFileSync(join(HOOKS_DIR, hook), "utf8").split("\n");

      test("is executable, because git skips a hook file it cannot run", () => {
        expect(statSync(join(HOOKS_DIR, hook)).mode & 0o111).not.toBe(0);
      });

      test("has the header lines", () => {
        const code = lines.filter((line) => !line.startsWith("# "));
        expect(code.slice(0, HEADER.length)).toEqual(HEADER);
      });

      test("has the line that stops it when node_modules is missing", () => {
        expect(lines.some((line) => line.startsWith("[ -d node_modules ] || "))).toBe(true);
      });

      test("runs the root script named after it", () => {
        expect(lines.some((line) => line.startsWith(`bun run githook:${hook}`))).toBe(true);
        expect(SCRIPTS[`githook:${hook}`]).toBeString();
      });
    });
  }
});
