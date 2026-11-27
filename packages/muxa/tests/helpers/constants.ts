import * as path from "path";

// Path to the built muxa executable
export const muxaPath = path.join(__dirname, "..", "..", "dist", "index.js");

// Runtime that starts muxa: node in CI, where it is preinstalled, bun locally
export const muxaRuntime = process.env.CI ? "node" : "bun";

// Path to test fixtures
export const fixturesPath = path.join(__dirname, "..", "fixtures");

// Only stops a muxa that hangs; below the 5000 ms that bun gives a test
export const DEFAULT_TIMEOUT = 4000;
export const QUICK_TIMEOUT = 4000;
export const FIXTURE_TIMEOUT = 4000;

// A Latin layout for a prompt in a pseudo-terminal (macOS only), so a run does not depend on the layout in use
export const LATIN_KEYBOARD_LAYOUT = "com.apple.keylayout.ABC";

// Test environment variables - ALWAYS use test mode, which starts no dekit
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
