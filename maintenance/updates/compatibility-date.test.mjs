import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A bun.lock in the text format bun writes: JSONC with trailing commas, each package as `[id, registry, info, integrity]`.
function lock(packages) {
  const lines = Object.entries(packages).map(
    ([key, id]) => `    "${key}": ["${id}", "", {}, "sha512-x"],\n`,
  );
  return `{\n  "lockfileVersion": 1,\n  "packages": {\n${lines.join("")}  },\n}\n`;
}

const wrangler = (date) =>
  `{\n  "name": "acme-com",\n  // the runtime date\n  "compatibility_date": "${date}",\n  "compatibility_flags": ["nodejs_compat"],\n}\n`;

function run({ packages, config }) {
  const dir = mkdtempSync(join(tmpdir(), "compatibility-date-test-"));
  try {
    writeFileSync(join(dir, "bun.lock"), lock(packages));
    mkdirSync(join(dir, "apps/docs"), { recursive: true });
    writeFileSync(join(dir, "apps/docs/wrangler.jsonc"), config);
    mkdirSync(join(dir, "maintenance/updates"), { recursive: true });
    copyFileSync(
      join(import.meta.dir, "compatibility-date.mjs"),
      join(dir, "maintenance/updates/compatibility-date.mjs"),
    );
    const result = spawnSync("bun", ["maintenance/updates/compatibility-date.mjs"], {
      cwd: dir,
      encoding: "utf8",
    });
    const written = readFileSync(join(dir, "apps/docs/wrangler.jsonc"), "utf8");
    return { status: result.status, output: result.stdout + result.stderr, written };
  } finally {
    rmSync(dir, { recursive: true });
  }
}

describe("compatibility-date", () => {
  test("writes the date of the installed workerd into wrangler.jsonc and changes nothing else", () => {
    const result = run({
      packages: { workerd: "workerd@1.20260625.1", wrangler: "wrangler@4.40.0" },
      config: wrangler("2026-05-01"),
    });
    expect(result.status).toBe(0);
    expect(result.written).toBe(wrangler("2026-06-25"));
  });

  test("reads workerd when bun.lock holds it only as a nested copy", () => {
    const result = run({
      packages: { "miniflare/workerd": "workerd@1.20260625.1" },
      config: wrangler("2026-05-01"),
    });
    expect(result.status).toBe(0);
    expect(result.written).toBe(wrangler("2026-06-25"));
  });

  test("leaves the file as it is when the date already matches, so a second run in the same PR is a no-op", () => {
    const result = run({
      packages: { workerd: "workerd@1.20260625.1" },
      config: wrangler("2026-06-25"),
    });
    expect(result).toEqual({ status: 0, output: "", written: wrangler("2026-06-25") });
  });

  test("fails, naming both versions, when bun.lock resolves two workerd versions", () => {
    const result = run({
      packages: { workerd: "workerd@1.20260625.1", "miniflare/workerd": "workerd@1.20260430.1" },
      config: wrangler("2026-05-01"),
    });
    expect(result.status).toBe(1);
    expect(result.output).toContain("1.20260625.1");
    expect(result.output).toContain("1.20260430.1");
    expect(result.written).toBe(wrangler("2026-05-01"));
  });

  test("fails when bun.lock resolves no workerd", () => {
    const result = run({
      packages: { wrangler: "wrangler@4.40.0" },
      config: wrangler("2026-05-01"),
    });
    expect(result.status).toBe(1);
    expect(result.output).toContain("workerd");
  });

  test("fails when wrangler.jsonc has no compatibility_date line to rewrite", () => {
    const config = `{\n  "name": "acme-com",\n}\n`;
    const result = run({ packages: { workerd: "workerd@1.20260625.1" }, config });
    expect(result.status).toBe(1);
    expect(result.output).toContain("compatibility_date");
    expect(result.written).toBe(config);
  });
});

// Renovate refuses a task command that no `allowedCommands` pattern matches, so the rule in renovate.json and the list in the workflow must change together.
test("renovate.json runs the script on every update of wrangler and @cloudflare/vite-plugin, and the renovate workflow allows the command", () => {
  const root = join(import.meta.dir, "../..");
  const { packageRules } = JSON.parse(readFileSync(join(root, "renovate.json"), "utf8"));
  const rule = packageRules.find((r) =>
    r.postUpgradeTasks?.commands?.includes("bun maintenance/updates/compatibility-date.mjs"),
  );
  expect(rule.matchPackageNames).toEqual(["wrangler", "@cloudflare/vite-plugin"]);
  expect(rule.matchUpdateTypes).toBeUndefined();
  const workflow = Bun.YAML.parse(
    readFileSync(join(root, ".github/workflows/renovate.yml"), "utf8"),
  );
  const step = workflow.jobs.renovate.steps.find((s) =>
    s.uses?.startsWith("renovatebot/github-action@"),
  );
  const allowed = JSON.parse(step.env.RENOVATE_ALLOWED_COMMANDS).map((p) => new RegExp(p));
  for (const command of rule.postUpgradeTasks.commands)
    expect(allowed.some((p) => p.test(command))).toBe(true);
});
