// Workspace discovery and resolution for muxa

import * as fs from "fs";
import * as path from "path";
import { detectPackageManager, type PackageManager } from "./package-manager";

export interface WorkspaceInfo {
  /** Package name from package.json */
  name: string;
  /** Relative path from workspace root */
  path: string;
  /** Directory name (basename of path) */
  dirName: string;
}

export interface WorkspaceConfig {
  /** All discovered workspace packages */
  packages: Map<string, WorkspaceInfo>;
  /** Root directory of the workspace */
  root: string;
  /** Type of workspace configuration found */
  type: PackageManager | null;
}

/**
 * Discover workspace packages in the current directory
 */
export function discoverWorkspaces(): WorkspaceConfig {
  const packages = new Map<string, WorkspaceInfo>();
  const root = process.cwd();

  // First detect the package manager being used
  const packageManagerInfo = detectPackageManager(root);
  const packageManager = packageManagerInfo.type;

  // Then check for workspace configuration based on package manager
  let workspaceType: PackageManager | null = null;
  let workspacePatterns: string[] = [];

  // Always check for pnpm-workspace.yaml first, regardless of detected package manager
  // This allows discovering pnpm workspace structure even when pnpm isn't installed
  // TODO: I like pnpm but this is disgusting
  const pnpmWorkspacePath = path.join(root, "pnpm-workspace.yaml");
  if (fs.existsSync(pnpmWorkspacePath)) {
    workspaceType = "pnpm";
    workspacePatterns = parsePnpmWorkspace(pnpmWorkspacePath);
  } else {
    // If no pnpm workspace config, check based on package manager
    switch (packageManager) {
      case "npm":
      case "yarn":
      case "bun":
      case "pnpm": {
        // npm, yarn, bun, and pnpm (when no pnpm-workspace.yaml) can use package.json workspaces field
        const rootPackageJsonPath = path.join(root, "package.json");
        if (fs.existsSync(rootPackageJsonPath)) {
          try {
            const rootPackageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, "utf-8"));
            workspacePatterns = getWorkspacePatternsFromPackageJson(rootPackageJson);
            if (workspacePatterns.length > 0) {
              workspaceType = packageManager;
            }
          } catch (e) {
            // Ignore invalid package.json
            if (process.env.MUXA_DEBUG) {
              console.error(`[workspace] Failed to read root package.json:`, e);
            }
          }
        }
        break;
      }
    }
  }

  // Collect packages if workspace patterns were found
  if (workspacePatterns.length > 0) {
    const workspacePackages = collectPackages(root, workspacePatterns);
    mergeMaps(packages, workspacePackages);
  }

  // Always add root package if it exists (even without workspace config)
  const rootPackageJsonPath = path.join(root, "package.json");
  if (fs.existsSync(rootPackageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(rootPackageJsonPath, "utf-8"));
      const info: WorkspaceInfo = {
        name: pkg.name || "root",
        path: ".",
        dirName: path.basename(root),
      };
      packages.set(".", info);
      if (pkg.name) {
        packages.set(pkg.name, info);
      }
    } catch (e) {
      // Ignore invalid package.json
      if (process.env.MUXA_DEBUG) {
        console.error(`[workspace] Failed to read root package.json:`, e);
      }
    }
  }

  return { packages, root, type: workspaceType };
}

/**
 * Resolve a package identifier to workspace info
 */
export function resolvePackage(identifier: string, config: WorkspaceConfig): WorkspaceInfo {
  const info = config.packages.get(identifier);

  if (!info) {
    // Check if it's an ambiguous directory name by looking at all packages
    const allInfos = Array.from(config.packages.values());

    // Remove duplicates before checking
    const seen = new Set<string>();
    const uniqueInfos: WorkspaceInfo[] = [];
    for (const info of allInfos) {
      const key = `${info.name}:${info.path}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueInfos.push(info);
      }
    }

    const matches = uniqueInfos.filter((value) => value.dirName === identifier);

    if (matches.length > 1) {
      const paths = matches.map((m) => `  - ${m.name} (${m.path})`).join("\n");
      throw new Error(
        `Ambiguous package identifier '${identifier}'\nFound multiple matches:\n${paths}\nPlease use the full package name or path.`,
      );
    }

    // List available packages
    const availablePackages = Array.from(new Set(uniqueInfos.map((p) => p.name))).sort();

    throw new Error(
      `Package '${identifier}' not found in workspace\nAvailable packages: ${availablePackages.join(
        ", ",
      )}`,
    );
  }

  return info;
}

/**
 * List all workspace packages in a formatted way
 */
export function formatWorkspaceList(config: WorkspaceConfig): string {
  const allInfos = Array.from(config.packages.values());
  // Remove duplicates by name+path combination
  const seen = new Set<string>();
  const uniqueInfos: WorkspaceInfo[] = [];

  for (const info of allInfos) {
    const key = `${info.name}:${info.path}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueInfos.push(info);
    }
  }

  if (uniqueInfos.length === 0) {
    return "No workspaces found in current directory";
  }

  const typeStr = config.type ? ` (using ${config.type} workspaces)` : "";
  let output = `Found ${uniqueInfos.length} workspace${uniqueInfos.length === 1 ? "" : "s"}${typeStr}:\n`;

  // Sort by path for consistent output
  uniqueInfos.sort((a, b) => a.path.localeCompare(b.path));

  // Calculate column widths
  const maxNameLength = Math.max(...uniqueInfos.map((info) => info.name.length));

  for (const info of uniqueInfos) {
    const paddedName = info.name.padEnd(maxNameLength + 2);
    output += `  ${paddedName} ${info.path}\n`;
  }

  return output.trimEnd();
}

// Helper functions

/**
 * Merges entries from source Map into target Map
 * @param target - Map to merge into (will be mutated)
 * @param source - Map to merge from
 */
function mergeMaps<K, V>(target: Map<K, V>, source: Map<K, V>): void {
  for (const [key, value] of source) {
    target.set(key, value);
  }
}

/**
 * Extract workspace patterns from package.json
 * @internal Exported for testing
 */
export function getWorkspacePatternsFromPackageJson(packageJson: {
  workspaces?: string[] | { packages?: string[] };
}): string[] {
  if (Array.isArray(packageJson.workspaces)) {
    return packageJson.workspaces;
  } else if (packageJson.workspaces?.packages) {
    return packageJson.workspaces.packages;
  }
  return [];
}

function parsePnpmWorkspace(filePath: string): string[] {
  // Simple YAML parser for pnpm-workspace.yaml
  // This is a basic implementation - could be enhanced with a proper YAML parser
  const content = fs.readFileSync(filePath, "utf-8");
  const patterns: string[] = [];

  const lines = content.split("\n");
  let inPackages = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "packages:") {
      inPackages = true;
      continue;
    }

    if (inPackages && trimmed.startsWith("-")) {
      // Extract pattern, removing quotes if present
      const pattern = trimmed
        .substring(1)
        .trim()
        .replace(/^['"]|['"]$/g, "");

      // Skip negation patterns
      if (!pattern.startsWith("!")) {
        patterns.push(pattern);
      }
    }
  }

  return patterns;
}

/**
 * Discovers packages in a workspace based on glob patterns and returns a map of all possible identifiers to packages.
 *
 * @param root - Root directory of the workspace
 * @param patterns - Glob patterns from workspace configuration (e.g., ["packages/*", "apps/*"])
 * @returns Map with multiple keys per package for flexible access (by name, path, or directory name if unambiguous)
 *
 * @example
 * // Given structure:
 * // packages/core/package.json (name: "@org/core")
 * // packages/utils/package.json (name: "@org/utils")
 *
 * const packages = collectPackages("/project", ["packages/*"]);
 * // Returns Map with entries:
 * // "@org/core" → WorkspaceInfo
 * // "@org/utils" → WorkspaceInfo
 * // "packages/core" → WorkspaceInfo
 * // "packages/utils" → WorkspaceInfo
 * // "./packages/core" → WorkspaceInfo
 * // "./packages/utils" → WorkspaceInfo
 * // "core" → WorkspaceInfo (only if no other package has dirName "core")
 * // "utils" → WorkspaceInfo (only if no other package has dirName "utils")
 */
function collectPackages(root: string, patterns: string[]): Map<string, WorkspaceInfo> {
  const packages = new Map<string, WorkspaceInfo>();
  const allPackageInfos: WorkspaceInfo[] = [];

  for (const pattern of patterns) {
    if (pattern === "*") {
      // Handle root level wildcard
      const entries = fs.readdirSync(root);

      for (const entry of entries) {
        const pkgPath = path.join(root, entry);
        const pkgJsonPath = path.join(pkgPath, "package.json");

        if (fs.existsSync(pkgJsonPath) && fs.statSync(pkgPath).isDirectory()) {
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
            if (pkg.name) {
              const info: WorkspaceInfo = {
                name: pkg.name,
                path: entry,
                dirName: entry,
              };
              allPackageInfos.push(info);
            }
          } catch (e) {
            // Skip invalid package.json files
            if (process.env.MUXA_DEBUG) {
              console.error(`[workspace] Failed to read package.json at ${pkgJsonPath}:`, e);
            }
          }
        }
      }
    } else if (pattern.endsWith("/*")) {
      // Simple directory listing
      const baseDir = pattern.slice(0, -2);
      const basePath = path.join(root, baseDir);

      if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
        const entries = fs.readdirSync(basePath);

        for (const entry of entries) {
          const pkgPath = path.join(basePath, entry);
          const pkgJsonPath = path.join(pkgPath, "package.json");

          if (fs.existsSync(pkgJsonPath)) {
            try {
              const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
              if (pkg.name) {
                const info: WorkspaceInfo = {
                  name: pkg.name,
                  path: path.relative(root, pkgPath),
                  dirName: entry,
                };
                allPackageInfos.push(info);
              }
            } catch (e) {
              // Skip invalid package.json files
              if (process.env.MUXA_DEBUG) {
                console.error(`[workspace] Failed to read package.json in yarn workspace:`, e);
              }
            }
          }
        }
      }
    } else {
      // Direct path pattern
      const pkgPath = path.join(root, pattern);
      const pkgJsonPath = path.join(pkgPath, "package.json");

      if (fs.existsSync(pkgJsonPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
          if (pkg.name) {
            const info: WorkspaceInfo = {
              name: pkg.name,
              path: path.relative(root, pkgPath),
              dirName: path.basename(pkgPath),
            };
            allPackageInfos.push(info);
          }
        } catch (e) {
          // Skip invalid package.json files
          if (process.env.MUXA_DEBUG) {
            console.error(`[workspace] Failed to read package.json in pnpm workspace:`, e);
          }
        }
      }
    }
  }

  // Now map all packages, checking for conflicts
  const dirNameConflicts = new Map<string, WorkspaceInfo[]>();

  for (const info of allPackageInfos) {
    // Always map by package name (should be unique)
    packages.set(info.name, info);

    // Always map by path (should be unique)
    packages.set(info.path, info);
    packages.set(`./${info.path}`, info);

    // Track directory name conflicts
    if (!dirNameConflicts.has(info.dirName)) {
      dirNameConflicts.set(info.dirName, []);
    }
    dirNameConflicts.get(info.dirName)!.push(info);
  }

  // Only map by directory name if it's unambiguous
  for (const [dirName, infos] of dirNameConflicts.entries()) {
    if (infos.length === 1) {
      const info = infos[0];
      if (info) {
        packages.set(dirName, info);
      }
    }
  }

  return packages;
}
