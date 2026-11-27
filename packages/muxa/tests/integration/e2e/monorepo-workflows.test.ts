import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { processesOf, runMuxa } from "@tests/helpers/muxa-runner";
import { createMonorepoFixture, cleanupFixture } from "@tests/helpers/fixture-helpers";

describe("Monorepo Workflows", () => {
  let fixtureDir: string;

  beforeEach(() => {
    fixtureDir = createMonorepoFixture({
      type: "npm",
      packages: [
        {
          path: "packages/backend",
          name: "@test/backend",
          scripts: {
            dev: "echo 'backend dev'",
            test: "echo 'backend test'",
            build: "echo 'backend build'",
            "build:prod": "echo 'backend build:prod'",
            watch: "echo 'backend watch'",
          },
        },
        {
          path: "packages/frontend",
          name: "@test/frontend",
          scripts: {
            start: "echo 'frontend start'",
            dev: "echo 'frontend dev'",
            test: "echo 'frontend test'",
            build: "echo 'frontend build'",
            "build:prod": "echo 'frontend build:prod'",
            watch: "echo 'frontend watch'",
          },
        },
        {
          path: "packages/shared",
          name: "@test/shared",
          scripts: {
            watch: "echo 'shared watch'",
            test: "echo 'shared test'",
            build: "echo 'shared build'",
          },
        },
      ],
    });
  });

  afterEach(() => {
    cleanupFixture(fixtureDir);
  });

  describe("Common workflows", () => {
    it("should generate correct command for dev servers", async () => {
      const result = await runMuxa(
        ["-s", "backend", "dev", "-s", "frontend", "start", "-s", "shared", "watch"],
        {
          cwd: fixtureDir,
          env: { MUXA_TEST_MODE: "true" },
        },
      );

      expect(result.code).toBe(0);
      const commands = processesOf(result.stdout).map(({ command }) => command);
      expect(commands).toContain("npm run dev");
      expect(commands).toContain("npm run start");
      expect(commands).toContain("npm run watch");
    });

    it("should generate correct command for tests", async () => {
      const result = await runMuxa(
        ["-s", "backend", "test", "-s", "frontend", "test", "-s", "shared", "test"],
        {
          cwd: fixtureDir,
          env: { MUXA_TEST_MODE: "true" },
        },
      );

      expect(result.code).toBe(0);
      expect(processesOf(result.stdout).map(({ command }) => command)).toContain("npm run test");
    });

    it("should generate correct command for parallel builds", async () => {
      const result = await runMuxa(
        ["-s", "shared", "build", "-s", "backend", "build", "-s", "frontend", "build"],
        {
          cwd: fixtureDir,
          env: { MUXA_TEST_MODE: "true" },
        },
      );

      expect(result.code).toBe(0);
      expect(processesOf(result.stdout).map(({ command }) => command)).toContain("npm run build");
    });
  });

  describe("Mixed commands", () => {
    it("should combine scripts and custom commands", async () => {
      const result = await runMuxa(
        [
          "-s",
          "backend",
          "dev",
          "api",
          "-s",
          "frontend",
          "start",
          "web",
          "-c",
          "docker-compose up",
          "services",
        ],
        {
          cwd: fixtureDir,
          env: { MUXA_TEST_MODE: "true" },
        },
      );

      expect(result.code).toBe(0);
      expect(processesOf(result.stdout).map(({ name }) => name)).toEqual([
        "api",
        "web",
        "services",
      ]);
      expect(processesOf(result.stdout).map(({ command }) => command)).toContain(
        "docker-compose up",
      );
    });

    it("should run workspace-specific commands", async () => {
      const result = await runMuxa(
        [
          "-w",
          "packages/backend",
          "npm run migrate",
          "migrate",
          "-w",
          "packages/frontend",
          "npm run generate",
          "codegen",
          "-c",
          "npm run lint",
          "lint",
        ],
        {
          cwd: fixtureDir,
          env: { MUXA_TEST_MODE: "true" },
        },
      );

      expect(result.code).toBe(0);
      const commands = processesOf(result.stdout).map(({ command }) => command);
      expect(processesOf(result.stdout).map(({ folder }) => folder)).toContainEqual(
        expect.stringMatching(/\/packages\/backend$/),
      );
      expect(processesOf(result.stdout).map(({ folder }) => folder)).toContainEqual(
        expect.stringMatching(/\/packages\/frontend$/),
      );
      expect(commands).toContain("npm run migrate");
      expect(commands).toContain("npm run generate");
    });
  });

  describe("Dev environment", () => {
    it("should start full stack development environment", async () => {
      const result = await runMuxa(
        [
          "-c",
          "docker-compose up -d",
          "infra",
          "-s",
          "backend",
          "dev",
          "api",
          "-s",
          "frontend",
          "dev",
          "web",
          "-c",
          "npm run proxy",
          "proxy",
        ],
        {
          cwd: fixtureDir,
          env: { MUXA_TEST_MODE: "true" },
        },
      );

      expect(result.code).toBe(0);
      const commands = processesOf(result.stdout).map(({ command }) => command);
      expect(processesOf(result.stdout).map(({ name }) => name)).toEqual([
        "infra",
        "api",
        "web",
        "proxy",
      ]);
      expect(commands).toContain("docker-compose up -d");
      expect(commands).toContain("npm run proxy");
    });

    it("should handle dependent services", async () => {
      const result = await runMuxa(
        [
          "-c",
          "npm run db:start",
          "database",
          "-c",
          "sleep 5 && npm run db:migrate",
          "migrate",
          "-s",
          "backend",
          "dev",
          "api",
        ],
        {
          cwd: fixtureDir,
          env: { MUXA_TEST_MODE: "true" },
        },
      );

      expect(result.code).toBe(0);
      expect(processesOf(result.stdout).map(({ name }) => name)).toEqual([
        "database",
        "migrate",
        "api",
      ]);
      expect(processesOf(result.stdout).map(({ command }) => command)).toContain(
        "npm run db:start",
      );
      expect(processesOf(result.stdout).map(({ command }) => command)).toContain(
        "sleep 5 && npm run db:migrate",
      );
    });
  });

  describe("CI/CD", () => {
    it("should run parallel CI checks", async () => {
      const result = await runMuxa(
        [
          "-c",
          "npm run lint",
          "lint",
          "-c",
          "npm run typecheck",
          "types",
          "-s",
          "backend",
          "test",
          "test:backend",
          "-s",
          "frontend",
          "test",
          "test:frontend",
        ],
        {
          cwd: fixtureDir,
          env: { MUXA_TEST_MODE: "true" },
        },
      );

      expect(result.code).toBe(0);
      const commands = processesOf(result.stdout).map(({ command }) => command);
      expect(processesOf(result.stdout).map(({ name }) => name)).toEqual([
        "lint",
        "types",
        "test:backend",
        "test:frontend",
      ]);
      expect(commands).toContain("npm run lint");
      expect(commands).toContain("npm run typecheck");
    });

    it("should build and test in parallel", async () => {
      const result = await runMuxa(
        [
          "-s",
          "shared",
          "build",
          "build:shared",
          "-s",
          "backend",
          "build",
          "build:backend",
          "-s",
          "frontend",
          "build",
          "build:frontend",
          "-c",
          "npm run test:e2e",
          "test:e2e",
        ],
        {
          cwd: fixtureDir,
          env: { MUXA_TEST_MODE: "true" },
        },
      );

      expect(result.code).toBe(0);
      expect(processesOf(result.stdout).map(({ name }) => name)).toEqual([
        "build:shared",
        "build:backend",
        "build:frontend",
        "test:e2e",
      ]);
      expect(processesOf(result.stdout).map(({ command }) => command)).toContain(
        "npm run test:e2e",
      );
    });
  });

  describe("Watch mode", () => {
    it("should run multiple watchers", async () => {
      const result = await runMuxa(
        [
          "-s",
          "shared",
          "watch",
          "watch:shared",
          "-s",
          "backend",
          "dev",
          "watch:backend",
          "-s",
          "frontend",
          "dev",
          "watch:frontend",
          "-c",
          "npm run test -- --watch",
          "watch:tests",
        ],
        {
          cwd: fixtureDir,
          env: { MUXA_TEST_MODE: "true" },
        },
      );

      expect(result.code).toBe(0);
      expect(processesOf(result.stdout).map(({ name }) => name)).toEqual([
        "watch:shared",
        "watch:backend",
        "watch:frontend",
        "watch:tests",
      ]);
      expect(processesOf(result.stdout).map(({ command }) => command)).toContain(
        "npm run test -- --watch",
      );
    });
  });

  describe("Deployment", () => {
    it("should run deployment commands", async () => {
      const result = await runMuxa(
        [
          "-s",
          "shared",
          "build",
          "build:shared",
          "-s",
          "backend",
          "build:prod",
          "build:backend",
          "-s",
          "frontend",
          "build:prod",
          "build:frontend",
          "-c",
          "npm run deploy",
          "deploy",
        ],
        {
          cwd: fixtureDir,
          env: { MUXA_TEST_MODE: "true" },
        },
      );

      expect(result.code).toBe(0);
      const commands = processesOf(result.stdout).map(({ command }) => command);
      expect(processesOf(result.stdout).map(({ name }) => name)).toEqual([
        "build:shared",
        "build:backend",
        "build:frontend",
        "deploy",
      ]);
      expect(commands).toContain("npm run build:prod");
      expect(commands).toContain("npm run deploy");
    });
  });

  describe("Package managers", () => {
    it("should work with npm workspaces", async () => {
      const result = await runMuxa(["-s", "backend", "dev", "-s", "frontend", "start"], {
        cwd: fixtureDir,
        env: { MUXA_TEST_MODE: "true" },
      });

      expect(result.code).toBe(0);
      const commands = processesOf(result.stdout).map(({ command }) => command);
      expect(commands).toContain("npm run dev");
      expect(commands).toContain("npm run start");
    });
  });
});
