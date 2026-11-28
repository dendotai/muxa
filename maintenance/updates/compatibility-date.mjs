#!/usr/bin/env bun
// Write the date of the workerd version in bun.lock into `compatibility_date` in apps/docs/wrangler.jsonc (`1.20260625.1` → `2026-06-25`).
//
//   bun maintenance/updates/compatibility-date.mjs
//
// Renovate runs it in every update PR that bumps `wrangler` or `@cloudflare/vite-plugin` (renovate.json), so prod runs the date the PR's checks ran: local `wrangler` falls back to the newest date its runtime supports, which a hand-set date can trail or pass.

import { readFileSync, writeFileSync } from "node:fs";

const configPath = "apps/docs/wrangler.jsonc";
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const { packages } = Bun.JSONC.parse(readFileSync("bun.lock", "utf8"));
// Each entry's first element is `<name>@<version>`; the entry's key is not the name for a nested copy (`parent/name`).
const versions = [
  ...new Set(
    Object.values(packages)
      .map(([id]) => id)
      .filter((id) => id.startsWith("workerd@"))
      .map((id) => id.slice("workerd@".length)),
  ),
];
if (versions.length !== 1)
  fail(
    versions.length
      ? `bun.lock resolves workerd ${versions.join(" and ")}: wrangler and @cloudflare/vite-plugin pin different runtimes, so no one date fits. Bump both to versions that pin the same workerd.`
      : "bun.lock resolves no workerd, so there is no runtime date to write.",
  );

const dateParts = versions[0].match(/^\d+\.(\d{4})(\d{2})(\d{2})\.\d+$/);
if (!dateParts)
  fail(`workerd ${versions[0]} is not in the form 1.YYYYMMDD.N, so it names no date.`);
const date = `${dateParts[1]}-${dateParts[2]}-${dateParts[3]}`;

// A text edit, not a JSON round trip, so the file's comments and layout stay.
const config = readFileSync(configPath, "utf8");
const datePattern = /("compatibility_date"\s*:\s*")[^"]*(")/;
if (!datePattern.test(config))
  fail(`${configPath} has no "compatibility_date": "<date>" line to rewrite.`);
const updated = config.replace(datePattern, `$1${date}$2`);
if (updated !== config) {
  writeFileSync(configPath, updated);
  console.log(
    `${configPath}: compatibility_date is now ${date}, the date of workerd ${versions[0]}.`,
  );
}
