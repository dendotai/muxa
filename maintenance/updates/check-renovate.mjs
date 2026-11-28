#!/usr/bin/env bun
// Fail when Renovate's last run missed a version pin it is meant to update.
//
//   bun maintenance/updates/check-renovate.mjs <report.json>
//
// <report.json> is the file Renovate writes with `reportType: file` (https://docs.renovatebot.com/self-hosted-configuration/#reporttype). Renovate skips a line its regex rule cannot match, and a file its ignore presets cover, and reports no error; what this compares is in maintenance/updates/README.md, "The check after each run".

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const reportPath = process.argv[2];
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

let report;
try {
  report = JSON.parse(readFileSync(reportPath, "utf8"));
} catch (err) {
  fail(`Cannot read the Renovate report at ${reportPath}: ${err.message}`);
}
// An empty object when the report shape changes (`reportType` is experimental), so every expected place reads as missing.
const packageFiles = Object.values(report.repositories ?? {})[0]?.packageFiles ?? {};
const filesOf = (manager) => new Set((packageFiles[manager] ?? []).map((f) => f.packageFile));

const problems = [];

const place = ({ file, depName }) => `${depName} in ${file}`;
const listed = new Set(
  JSON.parse(readFileSync("maintenance/updates/renovate-pins.json", "utf8")).map(place),
);
const found = new Set(
  (packageFiles.regex ?? []).flatMap((f) =>
    f.deps.map((d) => place({ file: f.packageFile, depName: d.depName })),
  ),
);
for (const p of listed)
  if (!found.has(p))
    problems.push(
      `Renovate did not find ${p}: its regex rule in renovate.json no longer matches the line.`,
    );
for (const p of found)
  if (!listed.has(p))
    problems.push(
      `Renovate found ${p}, which maintenance/updates/renovate-pins.json does not list.`,
    );

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
// Renovate leaves a file with nothing to update out of its report, so such a file is not expected there.
const hasDeps = (file) => {
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  return ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].some(
    (k) => pkg[k],
  );
};
const hasActionPins = (file) =>
  /^\s*(-\s*)?uses:|^\s*runs-on:\s*\S*\d/m.test(readFileSync(file, "utf8"));
const expected = [
  ["bun", tracked.filter((f) => /(^|\/)package\.json$/.test(f) && hasDeps(f))],
  [
    "github-actions",
    tracked.filter((f) => /^\.github\/workflows\/[^/]+\.ya?ml$/.test(f) && hasActionPins(f)),
  ],
];
for (const [manager, files] of expected) {
  const seen = filesOf(manager);
  for (const file of files)
    if (!seen.has(file))
      problems.push(
        `Renovate's ${manager} manager skipped ${file}, so nothing in it gets update PRs; an ignorePaths preset or rule likely covers it.`,
      );
}

if (problems.length) fail(problems.join("\n"));
