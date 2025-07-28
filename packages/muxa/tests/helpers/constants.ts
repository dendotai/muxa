import * as path from "path";

// Path to the built muxa executable
export const muxaPath = path.join(__dirname, "..", "..", "dist", "index.js");

// Path to test fixtures
export const fixturesPath = path.join(__dirname, "..", "fixtures");

// Default timeouts for test runs - kept short since we're only testing command generation
export const DEFAULT_TIMEOUT = 1000;
export const QUICK_TIMEOUT = 500;
export const FIXTURE_TIMEOUT = 1000;

// Test environment variables - ALWAYS use test mode to avoid running mprocs
export const TEST_ENV = {
  MUXA_TEST_MODE: "true",
};

// Platform mocking
export function mockPlatform(platform: NodeJS.Platform): () => void {
  const original = process.platform;
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true,
  });
  return () => {
    Object.defineProperty(process, "platform", {
      value: original,
      configurable: true,
    });
  };
}

// Environment mocking
export function withEnv(
  env: Record<string, string>,
  fn: () => void | Promise<void>,
): void | Promise<void> {
  const original = { ...process.env };
  Object.assign(process.env, env);

  const cleanup = () => {
    for (const key in process.env) {
      if (!(key in original)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, original);
  };

  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.finally(cleanup);
    }
    cleanup();
    return result;
  } catch (error) {
    cleanup();
    throw error;
  }
}
