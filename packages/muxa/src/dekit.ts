import { createRequire } from "module";
import * as path from "path";

type Resolver = (from: string) => (id: string) => string;

const nodeResolver: Resolver = (from) => createRequire(from).resolve;

/**
 * Path of the dekit binary for this machine. `@dekit/cli` exposes no binary path, so this finds
 * the platform package its launcher uses. The search starts from `@dekit/cli`, because a strict
 * install (pnpm with `hoist=false`) puts the platform package where only `@dekit/cli` can see it.
 */
export function dekitBinaryPath(
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch,
  resolver: Resolver = nodeResolver,
): string {
  const cliPackageJson = resolver(import.meta.url)("@dekit/cli/package.json");
  const platformPackage = `@dekit/dekit-${platform}-${arch}`;
  let platformPackageJson: string;
  try {
    platformPackageJson = resolver(cliPackageJson)(`${platformPackage}/package.json`);
  } catch {
    throw new Error(`dekit has no binary for ${platform} ${arch} (missing ${platformPackage})`);
  }
  const binName = platform === "win32" ? "dekit.exe" : "dekit";
  return path.join(path.dirname(platformPackageJson), "bin", binName);
}
