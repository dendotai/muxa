import { describe, expect, it } from "bun:test";
import {
  CANARY_PLATFORMS,
  canaryVersion,
  commitOfVersion,
  failedRunIssue,
  parseSha256Sums,
  pinnedVersion,
  platformPackageJson,
  stableContainsPin,
  stableReleaseIssue,
  withPinnedVersion,
} from "../../scripts/dekit-canary";

const VERSION = "0.0.0-canary.20261125.g7d56bc2";

function muxaManifest(versions: string[]) {
  return {
    name: "@den-ai/muxa",
    optionalDependencies: Object.fromEntries(
      CANARY_PLATFORMS.map((platform, i) => [platform.packageName, versions[i] ?? VERSION]),
    ),
  };
}

describe("canaryVersion", () => {
  it("joins the release date and the short commit", () => {
    expect(canaryVersion("2026-11-25T11:19:01Z", "7d56bc2aca45b107193f735579681ab4c4af3b03")).toBe(
      VERSION,
    );
  });

  it("keeps a commit of digits only a valid semver identifier", () => {
    expect(canaryVersion("2026-01-02T00:00:00Z", "0123456789abcdef")).toBe(
      "0.0.0-canary.20260102.g0123456",
    );
  });
});

describe("commitOfVersion", () => {
  it("reads the short commit back from a version", () => {
    expect(commitOfVersion(VERSION)).toBe("7d56bc2");
  });

  it("rejects a version that is not a canary version", () => {
    expect(() => commitOfVersion("0.10.3")).toThrow("not a dekit canary version: 0.10.3");
  });
});

describe("parseSha256Sums", () => {
  it("maps each file to its checksum", () => {
    const sums = parseSha256Sums("aaa1  dekit-a.tar.gz\nbbb2  dekit-b.zip\n");
    expect(sums.get("dekit-a.tar.gz")).toBe("aaa1");
    expect(sums.get("dekit-b.zip")).toBe("bbb2");
  });
});

describe("CANARY_PLATFORMS", () => {
  it("covers the five builds of dekit's canary", () => {
    expect(CANARY_PLATFORMS.map((p) => `${p.os}-${p.cpu} ${p.asset}`)).toEqual([
      "darwin-arm64 dekit-aarch64-apple-darwin.tar.gz",
      "darwin-x64 dekit-x86_64-apple-darwin.tar.gz",
      "linux-arm64 dekit-aarch64-unknown-linux-musl.tar.gz",
      "linux-x64 dekit-x86_64-unknown-linux-musl.tar.gz",
      "win32-x64 dekit-x86_64-pc-windows-msvc.zip",
    ]);
  });
});

describe("platformPackageJson", () => {
  it("limits the package to its platform and names dekit's commit", () => {
    const win = CANARY_PLATFORMS.find((p) => p.os === "win32")!;
    const manifest = platformPackageJson(win, VERSION, "7d56bc2aca45b107193f735579681ab4c4af3b03");
    expect(manifest).toMatchObject({
      name: "@den-ai/dekit-canary-win32-x64",
      version: VERSION,
      license: "MIT",
      os: ["win32"],
      cpu: ["x64"],
      files: ["bin/dekit.exe", "LICENSE"],
    });
    expect(manifest.description).toContain("7d56bc2aca45b107193f735579681ab4c4af3b03");
  });
});

describe("pinnedVersion", () => {
  it("reads the one version of the five packages", () => {
    expect(pinnedVersion(muxaManifest([VERSION]))).toBe(VERSION);
  });

  it("rejects packages pinned at different versions", () => {
    expect(() => pinnedVersion(muxaManifest([VERSION, "0.0.0-canary.20261101.gabcdef0"]))).toThrow(
      "dekit canary packages are pinned at different versions",
    );
  });

  it("rejects a manifest that misses a package", () => {
    expect(() => pinnedVersion({ optionalDependencies: {} })).toThrow(
      "@den-ai/dekit-canary-darwin-arm64 is not in optionalDependencies",
    );
  });
});

describe("withPinnedVersion", () => {
  it("moves every package to the new version and keeps other keys", () => {
    const next = "0.0.0-canary.20261202.gabcdef0";
    const moved = withPinnedVersion(muxaManifest([VERSION]), next);
    expect(pinnedVersion(moved)).toBe(next);
    expect(moved.name).toBe("@den-ai/muxa");
  });
});

describe("stableContainsPin", () => {
  it("is true when the pin is behind or at the stable tag", () => {
    expect(stableContainsPin("behind")).toBe(true);
    expect(stableContainsPin("identical")).toBe(true);
  });

  it("is false when the pin has commits the stable tag lacks", () => {
    expect(stableContainsPin("ahead")).toBe(false);
    expect(stableContainsPin("diverged")).toBe(false);
  });
});

describe("stableReleaseIssue", () => {
  const issue = stableReleaseIssue({
    stableVersion: "0.11.0",
    releaseUrl: "https://github.com/pvolok/dekit/releases/tag/v0.11.0",
    commit: "7d56bc2",
  });

  it("names the stable version in the title", () => {
    expect(issue.title).toBe("Move back to stable dekit 0.11.0");
  });

  it("gives the steps of the move and says who opened it", () => {
    expect(issue.body).toContain("https://github.com/pvolok/dekit/releases/tag/v0.11.0");
    expect(issue.body).toContain("`@dekit/cli` 0.11.0");
    expect(issue.body).toContain("`.github/workflows/update-dekit-canary.yml`");
    expect(issue.body.trim().split("\n").at(-1)).toBe(
      "The weekly dekit canary job opened this issue, and it opens no second one while this one is open.",
    );
  });
});

describe("failedRunIssue", () => {
  it("links the run", () => {
    const issue = failedRunIssue("https://github.com/o/r/actions/runs/1");
    expect(issue.title).toBe("Fix: the weekly dekit canary update failed");
    expect(issue.body).toContain("https://github.com/o/r/actions/runs/1");
  });
});
