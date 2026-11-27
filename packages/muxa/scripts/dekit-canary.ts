/** The dekit canary build that muxa republishes in its own npm packages (ADR 0009) */

export type CanaryPlatform = {
  os: "darwin" | "linux" | "win32";
  cpu: "arm64" | "x64";
  /** The archive of dekit's `canary` GitHub release that holds this build */
  asset: string;
  binName: "dekit" | "dekit.exe";
  packageName: string;
};

function platform(os: CanaryPlatform["os"], cpu: CanaryPlatform["cpu"], asset: string) {
  return {
    os,
    cpu,
    asset,
    binName: os === "win32" ? "dekit.exe" : "dekit",
    packageName: `@den-ai/dekit-canary-${os}-${cpu}`,
  } satisfies CanaryPlatform;
}

export const CANARY_PLATFORMS: CanaryPlatform[] = [
  platform("darwin", "arm64", "dekit-aarch64-apple-darwin.tar.gz"),
  platform("darwin", "x64", "dekit-x86_64-apple-darwin.tar.gz"),
  platform("linux", "arm64", "dekit-aarch64-unknown-linux-musl.tar.gz"),
  platform("linux", "x64", "dekit-x86_64-unknown-linux-musl.tar.gz"),
  platform("win32", "x64", "dekit-x86_64-pc-windows-msvc.zip"),
];

const VERSION_PATTERN = /^0\.0\.0-canary\.\d{8}\.g([0-9a-f]{7})$/;

/** The `g` keeps a commit of digits only from reading as a number, which semver forbids with a leading zero */
export function canaryVersion(publishedAt: string, commit: string): string {
  const date = publishedAt.slice(0, 10).replaceAll("-", "");
  return `0.0.0-canary.${date}.g${commit.slice(0, 7)}`;
}

export function commitOfVersion(version: string): string {
  const match = VERSION_PATTERN.exec(version);
  if (!match?.[1]) throw new Error(`not a dekit canary version: ${version}`);
  return match[1];
}

export function parseSha256Sums(text: string): Map<string, string> {
  const sums = new Map<string, string>();
  for (const line of text.split("\n")) {
    const [hash, file] = line.trim().split(/\s+/);
    if (hash && file) sums.set(file, hash);
  }
  return sums;
}

export function platformPackageJson(target: CanaryPlatform, version: string, commit: string) {
  return {
    name: target.packageName,
    version,
    description: `dekit canary build of commit ${commit} (https://github.com/pvolok/dekit), for ${target.os} ${target.cpu}, republished for @den-ai/muxa`,
    license: "MIT",
    repository: { type: "git", url: "git+https://github.com/dendotai/muxa.git" },
    os: [target.os],
    cpu: [target.cpu],
    files: [`bin/${target.binName}`, "LICENSE"],
  };
}

export type MuxaManifest = { optionalDependencies?: { [name: string]: string } };

export function pinnedVersion(manifest: MuxaManifest): string {
  const versions = CANARY_PLATFORMS.map(({ packageName }) => {
    const version = manifest.optionalDependencies?.[packageName];
    if (!version) throw new Error(`${packageName} is not in optionalDependencies`);
    return version;
  });
  if (new Set(versions).size > 1) {
    throw new Error(
      `dekit canary packages are pinned at different versions: ${versions.join(", ")}`,
    );
  }
  return versions[0]!;
}

export function withPinnedVersion<T extends MuxaManifest>(manifest: T, version: string): T {
  const optionalDependencies = { ...manifest.optionalDependencies };
  for (const { packageName } of CANARY_PLATFORMS) optionalDependencies[packageName] = version;
  return { ...manifest, optionalDependencies };
}

/** `status` of GitHub's compare of `<stable tag>...<pinned commit>` */
export function stableContainsPin(compareStatus: string): boolean {
  return compareStatus === "behind" || compareStatus === "identical";
}

export const STABLE_ISSUE_TITLE_PREFIX = "Move back to stable dekit";

export function stableReleaseIssue(input: {
  stableVersion: string;
  releaseUrl: string;
  commit: string;
}): { title: string; body: string } {
  const { stableVersion, releaseUrl, commit } = input;
  return {
    title: `${STABLE_ISSUE_TITLE_PREFIX} ${stableVersion}`,
    body: `dekit ${stableVersion} (${releaseUrl}) contains commit ${commit}, the canary that muxa ships today in the \`@den-ai/dekit-canary-*\` packages; muxa's tests passed on that canary.

## What to check

- The dekit changelog between the canary and ${stableVersion}, for anything removed or renamed that muxa still calls.
- muxa's tests on \`@dekit/cli\` ${stableVersion}.

## The move

- Add \`@dekit/cli\` ${stableVersion} back to \`packages/muxa/package.json\`.
- Remove the five \`@den-ai/dekit-canary-*\` packages from \`optionalDependencies\`.
- Point \`dekitBinaryPath\` in \`packages/muxa/src/dekit.ts\` back to \`@dekit/dekit-*\`.
- Delete \`.github/workflows/update-dekit-canary.yml\` and \`packages/muxa/scripts/\`.
- Deprecate the \`@den-ai/dekit-canary-*\` packages on npm.

The weekly dekit canary job opened this issue, and it opens no second one while this one is open.
`,
  };
}

export const FAILED_RUN_ISSUE_TITLE = "Fix: the weekly dekit canary update failed";

export function failedRunIssue(runUrl: string): { title: string; body: string } {
  return {
    title: FAILED_RUN_ISSUE_TITLE,
    body: `A run of \`.github/workflows/update-dekit-canary.yml\` failed: ${runUrl}

## What to check

- The failed step's log in that run.
- Whether dekit's \`canary\` release still has the five archives and \`SHA256SUMS\` (https://github.com/pvolok/dekit/releases/tag/canary).
- Whether npm still trusts the workflow for each \`@den-ai/dekit-canary-*\` package.

Start the workflow again from the Actions tab once the cause is fixed. While this issue is open, a later failed run adds a comment here instead of a new issue.
`,
  };
}
