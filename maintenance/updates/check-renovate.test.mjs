import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const pins = [
  { file: "packages/api/e2e/CONVEX_LOCAL_BACKEND_VERSION", depName: "convex-local-backend" },
  { file: ".github/workflows/deploy.yml", depName: "semantic-release" },
];

const files = {
  "package.json": JSON.stringify({ devDependencies: { typescript: "5.9.3" } }),
  "bun.lock": "{}",
  "packages/api/package.json": JSON.stringify({ dependencies: { convex: "1.0.0" } }),
  "packages/api/e2e/CONVEX_LOCAL_BACKEND_VERSION": "precompiled-2026-10-10-bb95347\n",
  ".github/workflows/deploy.yml":
    "jobs:\n  deploy:\n    runs-on: ubuntu-24.04\n    steps:\n      - run: bunx semantic-release@25.0.9\n",
};

// The report shape Renovate writes with `reportType: file`: per repository, the package files each manager found.
function report(packageFiles) {
  return {
    problems: [],
    repositories: { "acme/acme-com": { problems: [], branches: [], packageFiles } },
  };
}

const found = {
  bun: [
    { packageFile: "package.json", deps: [] },
    { packageFile: "packages/api/package.json", deps: [] },
  ],
  "github-actions": [{ packageFile: ".github/workflows/deploy.yml", deps: [] }],
  regex: [
    {
      packageFile: "packages/api/e2e/CONVEX_LOCAL_BACKEND_VERSION",
      deps: [{ depName: "convex-local-backend" }],
    },
    { packageFile: ".github/workflows/deploy.yml", deps: [{ depName: "semantic-release" }] },
  ],
};

function check({
  tree = files,
  list = pins,
  packageFiles = found,
  reportFile = report(packageFiles),
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "check-renovate-test-"));
  for (const [path, content] of Object.entries(tree)) {
    mkdirSync(join(dir, dirname(path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  mkdirSync(join(dir, "maintenance/updates"), { recursive: true });
  writeFileSync(join(dir, "maintenance/updates/renovate-pins.json"), JSON.stringify(list));
  copyFileSync(
    join(import.meta.dir, "check-renovate.mjs"),
    join(dir, "maintenance/updates/check-renovate.mjs"),
  );
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["add", "."], { cwd: dir });
  const reportPath = join(dir, "renovate-report.json");
  if (reportFile) writeFileSync(reportPath, JSON.stringify(reportFile));
  const run = spawnSync("bun", ["maintenance/updates/check-renovate.mjs", reportPath], {
    cwd: dir,
    encoding: "utf8",
  });
  rmSync(dir, { recursive: true });
  return { status: run.status, output: run.stdout + run.stderr };
}

describe("check-renovate", () => {
  test("passes silently when Renovate found every listed place and every package file", () => {
    expect(check()).toEqual({ status: 0, output: "" });
  });

  test("fails, naming the place, when Renovate did not find a listed version pin", () => {
    const result = check({ packageFiles: { ...found, regex: found.regex.slice(0, 1) } });
    expect(result.status).toBe(1);
    expect(result.output).toContain("semantic-release in .github/workflows/deploy.yml");
  });

  test("fails, naming the place, when Renovate found a version pin the list misses", () => {
    const result = check({ list: pins.slice(0, 1) });
    expect(result.status).toBe(1);
    expect(result.output).toContain("semantic-release in .github/workflows/deploy.yml");
  });

  test("fails, naming the file, when Renovate skipped a package.json or a workflow", () => {
    const result = check({
      packageFiles: { ...found, bun: found.bun.slice(0, 1), "github-actions": [] },
    });
    expect(result.status).toBe(1);
    expect(result.output).toContain("packages/api/package.json");
    expect(result.output).toContain(".github/workflows/deploy.yml");
  });

  test("passes when the only files Renovate skipped hold nothing for it to update", () => {
    const tree = {
      ...files,
      "packages/empty/package.json": JSON.stringify({ name: "empty" }),
      ".github/workflows/hello.yml":
        "jobs:\n  hello:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n",
    };
    expect(check({ tree })).toEqual({ status: 0, output: "" });
  });

  test("fails, naming the path, when the report file is missing", () => {
    const result = check({ reportFile: null });
    expect(result.status).toBe(1);
    expect(result.output).toContain("renovate-report.json");
  });
});

// The regex rules in renovate.json, applied to the repo's own files, find exactly the places in renovate-pins.json, so a change that moves a line or adds a rule fails here before a Renovate run.
test("renovate-pins.json lists every place the regex rules in renovate.json match", () => {
  const root = join(import.meta.dir, "../..");
  const { customManagers } = JSON.parse(readFileSync(join(root, "renovate.json"), "utf8"));
  const tracked = spawnSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .stdout.split("\n")
    .filter(Boolean);
  const matched = new Set();
  for (const rule of customManagers.filter((m) => m.customType === "regex")) {
    const patterns = rule.managerFilePatterns.map((p) => new RegExp(p.slice(1, -1)));
    for (const file of tracked.filter((f) => patterns.some((p) => p.test(f)))) {
      const content = readFileSync(join(root, file), "utf8");
      if (rule.matchStrings.some((s) => new RegExp(s, "g").test(content))) {
        matched.add(`${rule.depNameTemplate} in ${file}`);
      }
    }
  }
  const listed = JSON.parse(
    readFileSync(join(root, "maintenance/updates/renovate-pins.json"), "utf8"),
  );
  expect([...matched].sort()).toEqual(listed.map((p) => `${p.depName} in ${p.file}`).sort());
});
