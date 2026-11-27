/**
 * The steps of `.github/workflows/update-dekit-canary.yml`, one command each. The first publish of
 * a new package name runs from a maintainer's machine with `pack` and `publish` (ADR 0009), then
 * `npm trust github <package> --file update-dekit-canary.yml --repo dendotai/muxa --allow-publish`
 * (npm 11.15 or later) lets the workflow publish it.
 *
 *   status                       pinned and newest canary; GITHUB_OUTPUT: pinned_commit, version, commit, changed
 *   pack --commit <sha> --out <dir>   download, check against SHA256SUMS, write the five packages
 *   publish --dir <dir>          npm publish each package not yet on npm
 *   pin --version <version>      move the five optionalDependencies of packages/muxa/package.json
 *   stable-check                 open the issue to move back to stable dekit, once
 *   report-failure --run-url <url>   open or comment on the issue for a failed run
 */
import { spawnSync } from "child_process";
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import {
  type CanaryPlatform,
  type MuxaManifest,
  CANARY_PLATFORMS,
  FAILED_RUN_ISSUE_TITLE,
  STABLE_ISSUE_TITLE_PREFIX,
  canaryVersion,
  commitOfVersion,
  failedRunIssue,
  parseSha256Sums,
  pinnedVersion,
  platformPackageJson,
  stableContainsPin,
  stableReleaseIssue,
  withPinnedVersion,
} from "./dekit-canary";

const DEKIT_REPO = "pvolok/dekit";
const MUXA_MANIFEST = path.join(import.meta.dir, "..", "package.json");

function run(command: string, args: string[], options: { cwd?: string; input?: string } = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    input: options.input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "inherit"],
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status}`);
  }
  return result.stdout;
}

class NotFoundError extends Error {}

function ghJson<T>(endpoint: string): T {
  const result = spawnSync("gh", ["api", endpoint], { encoding: "utf8" });
  if (result.status !== 0) {
    const message = `gh api ${endpoint}: ${result.stderr.trim()}`;
    throw result.stderr.includes("(HTTP 404)") ? new NotFoundError(message) : new Error(message);
  }
  return JSON.parse(result.stdout) as T;
}

type Release = { tag_name: string; html_url: string; published_at: string };

/** dekit deletes and creates `canary` again on every push to master, so a read can land in between */
function canaryRelease(): Release & { commit: string } {
  for (let attempt = 1; ; attempt++) {
    try {
      const release = ghJson<Release>(`repos/${DEKIT_REPO}/releases/tags/canary`);
      const ref = ghJson<{ object: { sha: string } }>(`repos/${DEKIT_REPO}/git/ref/tags/canary`);
      return { ...release, commit: ref.object.sha };
    } catch (error) {
      if (!(error instanceof NotFoundError) || attempt === 3) throw error;
      Bun.sleepSync(60_000);
    }
  }
}

function readManifest(): MuxaManifest {
  return JSON.parse(fs.readFileSync(MUXA_MANIFEST, "utf8")) as MuxaManifest;
}

function packageDir(packsDir: string, target: CanaryPlatform) {
  return path.join(packsDir, target.packageName.replace("/", "__"));
}

/** Read past npm's client and its `.npmrc`, whose placeholder token can turn a read into a 401 */
async function isOnNpm(packageName: string, version: string): Promise<boolean> {
  const response = await fetch(`https://registry.npmjs.org/${packageName}/${version}`, {
    headers: { "cache-control": "no-cache" },
  });
  if (response.status === 404) return false;
  if (!response.ok)
    throw new Error(`npm registry answered ${response.status} for ${packageName}@${version}`);
  return true;
}

function setOutput(values: { [key: string]: string }) {
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  console.log(lines.join("\n"));
  if (process.env.GITHUB_OUTPUT)
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
}

function requiredOption(args: string[], name: string): string {
  const value = args[args.indexOf(name) + 1];
  if (!args.includes(name) || !value) throw new Error(`missing ${name}`);
  return value;
}

function status() {
  const pinned = pinnedVersion(readManifest());
  const canary = canaryRelease();
  setOutput({
    pinned_commit: commitOfVersion(pinned),
    version: canaryVersion(canary.published_at, canary.commit),
    commit: canary.commit,
    changed: String(!canary.commit.startsWith(commitOfVersion(pinned))),
  });
}

function pack(commit: string, outDir: string) {
  fs.mkdirSync(outDir, { recursive: true });
  const downloads = fs.mkdtempSync(path.join(outDir, ".downloads-"));
  run("gh", [
    "release",
    "download",
    "canary",
    "--repo",
    DEKIT_REPO,
    "--dir",
    downloads,
    "--pattern",
    "SHA256SUMS",
    ...CANARY_PLATFORMS.flatMap((p) => ["--pattern", p.asset]),
  ]);
  const canary = canaryRelease();
  if (canary.commit !== commit) {
    throw new Error(`dekit's canary moved to ${canary.commit} during the download of ${commit}`);
  }
  const version = canaryVersion(canary.published_at, commit);
  const sums = parseSha256Sums(fs.readFileSync(path.join(downloads, "SHA256SUMS"), "utf8"));

  for (const target of CANARY_PLATFORMS) {
    const archive = path.join(downloads, target.asset);
    const actual = createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
    if (sums.get(target.asset) !== actual) {
      throw new Error(`${target.asset} does not match SHA256SUMS`);
    }
    const dir = packageDir(outDir, target);
    const bin = path.join(dir, "bin");
    fs.mkdirSync(bin, { recursive: true });
    if (target.asset.endsWith(".zip")) run("unzip", ["-o", "-q", archive, "-d", dir]);
    else run("tar", ["-xzf", archive, "-C", dir]);
    fs.renameSync(path.join(dir, target.binName), path.join(bin, target.binName));
    fs.writeFileSync(
      path.join(dir, "package.json"),
      `${JSON.stringify(platformPackageJson(target, version, commit), null, 2)}\n`,
    );
    console.log(`${target.packageName}@${version}: ${dir}`);
  }
  fs.rmSync(downloads, { recursive: true });
}

async function publish(packsDir: string) {
  const published: string[] = [];
  for (const target of CANARY_PLATFORMS) {
    const dir = packageDir(packsDir, target);
    const { version } = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as {
      version: string;
    };
    if (await isOnNpm(target.packageName, version)) {
      console.log(`${target.packageName}@${version} is already on npm`);
      continue;
    }
    // A prerelease needs a dist-tag; `canary` keeps `latest` on the first version only.
    // Inherited stdio lets a first publish by hand answer npm's 2FA prompt.
    const result = spawnSync("npm", ["publish", "--access", "public", "--tag", "canary"], {
      cwd: dir,
      stdio: "inherit",
    });
    if (result.status !== 0) {
      throw new Error(`npm publish of ${target.packageName} exited with ${result.status}`);
    }
    published.push(`${target.packageName}@${version}`);
  }
  // The `bun install` after this step fails on a version the registry does not serve yet, which can take minutes
  for (const spec of published) {
    const at = spec.lastIndexOf("@");
    for (let attempt = 1; !(await isOnNpm(spec.slice(0, at), spec.slice(at + 1))); attempt++) {
      if (attempt === 30) throw new Error(`npm does not serve ${spec} after 10 minutes`);
      Bun.sleepSync(20_000);
    }
  }
}

function pin(version: string) {
  commitOfVersion(version);
  const manifest = withPinnedVersion(readManifest(), version);
  fs.writeFileSync(MUXA_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
}

function findOpenIssue(titlePrefix: string) {
  const open = JSON.parse(
    run("gh", [
      "issue",
      "list",
      "--state",
      "open",
      "--search",
      `in:title "${titlePrefix}"`,
      "--json",
      "number,title",
    ]),
  ) as { number: number; title: string }[];
  return open.find((issue) => issue.title.startsWith(titlePrefix));
}

function stableCheck() {
  const commit = commitOfVersion(pinnedVersion(readManifest()));
  const stable = ghJson<Release>(`repos/${DEKIT_REPO}/releases/latest`);
  const compare = ghJson<{ status: string }>(
    `repos/${DEKIT_REPO}/compare/${stable.tag_name}...${commit}`,
  );
  if (!stableContainsPin(compare.status)) {
    console.log(`dekit ${stable.tag_name} does not contain ${commit} (${compare.status})`);
    return;
  }
  const existing = findOpenIssue(STABLE_ISSUE_TITLE_PREFIX);
  if (existing) {
    console.log(`#${existing.number} is open: ${existing.title}`);
    return;
  }
  const issue = stableReleaseIssue({
    stableVersion: stable.tag_name.replace(/^v/, ""),
    releaseUrl: stable.html_url,
    commit,
  });
  run("gh", ["issue", "create", "--title", issue.title, "--label", "p0", "--body-file", "-"], {
    input: issue.body,
  });
}

function reportFailure(runUrl: string) {
  const issue = failedRunIssue(runUrl);
  const existing = findOpenIssue(FAILED_RUN_ISSUE_TITLE);
  if (existing) {
    run("gh", ["issue", "comment", String(existing.number), "--body", `Failed again: ${runUrl}`]);
    return;
  }
  run("gh", ["issue", "create", "--title", issue.title, "--body-file", "-"], { input: issue.body });
}

const [command, ...args] = process.argv.slice(2);
switch (command) {
  case "status":
    status();
    break;
  case "pack":
    pack(requiredOption(args, "--commit"), path.resolve(requiredOption(args, "--out")));
    break;
  case "publish":
    await publish(path.resolve(requiredOption(args, "--dir")));
    break;
  case "pin":
    pin(requiredOption(args, "--version"));
    break;
  case "stable-check":
    stableCheck();
    break;
  case "report-failure":
    reportFailure(requiredOption(args, "--run-url"));
    break;
  default:
    console.error(`unknown command: ${command ?? "(none)"}`);
    process.exit(2);
}
