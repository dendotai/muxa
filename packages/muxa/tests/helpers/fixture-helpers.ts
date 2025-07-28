import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface PackageExtras {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

// Create a temporary workspace directory
export function createTempWorkspace(prefix = "muxa-test"): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  return tempDir;
}

// Create a package.json file in a directory
export function createPackageJson(
  rootDir: string,
  relativePath: string,
  name: string,
  extras?: PackageExtras,
): void {
  const packageDir = path.join(rootDir, relativePath);
  fs.mkdirSync(packageDir, { recursive: true });

  const packageJson = {
    name,
    version: "1.0.0",
    ...extras,
  };

  fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify(packageJson, null, 2));
}

// Create a pnpm-workspace.yaml file
export function createPnpmWorkspace(rootDir: string, packages: string[]): void {
  const content = `packages:\n${packages.map((p) => `  - '${p}'`).join("\n")}\n`;
  fs.writeFileSync(path.join(rootDir, "pnpm-workspace.yaml"), content);
}

// Create a yarn workspaces configuration in package.json
export function createYarnWorkspace(rootDir: string, packages: string[]): void {
  const packageJson = {
    name: "monorepo",
    version: "1.0.0",
    private: true,
    workspaces: packages,
  };

  fs.writeFileSync(path.join(rootDir, "package.json"), JSON.stringify(packageJson, null, 2));
}

// Create an npm workspaces configuration in package.json
export function createNpmWorkspace(rootDir: string, packages: string[]): void {
  const packageJson = {
    name: "monorepo",
    version: "1.0.0",
    workspaces: packages,
  };

  fs.writeFileSync(path.join(rootDir, "package.json"), JSON.stringify(packageJson, null, 2));
}

// Safely clean up a fixture directory
export function cleanupFixture(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Create a basic monorepo structure
export interface MonorepoConfig {
  type: "npm" | "yarn" | "pnpm" | "bun";
  packages: Array<{
    path: string;
    name: string;
    scripts?: Record<string, string>;
  }>;
}

export function createMonorepoFixture(config: MonorepoConfig): string {
  const tempDir = createTempWorkspace();

  // Create root package.json or pnpm-workspace.yaml
  const packagePaths = config.packages.map((p) => p.path);

  switch (config.type) {
    case "npm":
      createNpmWorkspace(tempDir, packagePaths);
      break;
    case "yarn":
      createYarnWorkspace(tempDir, packagePaths);
      // Create empty yarn.lock
      fs.writeFileSync(path.join(tempDir, "yarn.lock"), "");
      break;
    case "pnpm":
      createPnpmWorkspace(tempDir, packagePaths);
      // Create empty pnpm-lock.yaml
      fs.writeFileSync(path.join(tempDir, "pnpm-lock.yaml"), "lockfileVersion: '6.0'");
      break;
    case "bun":
      createNpmWorkspace(tempDir, packagePaths); // Bun uses npm-style workspaces
      // Create empty bun.lockb (binary file, just create empty)
      fs.writeFileSync(path.join(tempDir, "bun.lockb"), "");
      break;
  }

  // Create individual packages
  for (const pkg of config.packages) {
    createPackageJson(tempDir, pkg.path, pkg.name, { scripts: pkg.scripts });
  }

  return tempDir;
}
