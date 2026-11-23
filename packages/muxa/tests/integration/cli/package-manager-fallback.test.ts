import { describe, it, expect, afterEach } from "bun:test";
import * as path from "path";
import { runMuxa } from "@tests/helpers/muxa-runner";
import { muxaRuntime } from "@tests/helpers/constants";
import { createMonorepoFixture, cleanupFixture } from "@tests/helpers/fixture-helpers";

describe("Package manager fallback", () => {
  let fixtureDir: string | undefined;

  afterEach(() => {
    if (fixtureDir) cleanupFixture(fixtureDir);
  });

  it("warns without MUXA_DEBUG when the lockfile's manager is not in PATH", async () => {
    fixtureDir = createMonorepoFixture({
      type: "pnpm",
      packages: [{ path: "packages/web", name: "@test/web", scripts: { dev: "echo dev" } }],
    });
    const runtimePath = Bun.which(muxaRuntime);
    if (!runtimePath) throw new Error(`${muxaRuntime} not found`);

    const result = await runMuxa(["-s", "web", "dev"], {
      cwd: fixtureDir,
      // Only the runtime's folder, so pnpm and `which` are not found
      env: { PATH: path.dirname(runtimePath), MUXA_DEBUG: "" },
    });

    expect(result.stderr).toContain("pnpm is not in PATH, so muxa runs scripts with npm");
    expect(result.stdout).toContain("npm run dev");
  });
});
