import { createRequire } from "module";
import * as path from "path";

type Resolver = (from: string) => (id: string) => string;

const nodeResolver: Resolver = (from) => createRequire(from).resolve;

/**
 * Path of the dekit binary for this machine, from the `@den-ai/dekit-canary-*` package that npm
 * installed for it (ADR 0009). muxa lists those packages itself, so a strict install (pnpm with
 * `hoist=false`) puts them where muxa can see them.
 */
export function dekitBinaryPath(
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch,
  resolver: Resolver = nodeResolver,
): string {
  const platformPackage = `@den-ai/dekit-canary-${platform}-${arch}`;
  let platformPackageJson: string;
  try {
    platformPackageJson = resolver(import.meta.url)(`${platformPackage}/package.json`);
  } catch {
    throw new Error(`dekit has no binary for ${platform} ${arch} (missing ${platformPackage})`);
  }
  const binName = platform === "win32" ? "dekit.exe" : "dekit";
  return path.join(path.dirname(platformPackageJson), "bin", binName);
}
