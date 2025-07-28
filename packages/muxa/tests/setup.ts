// Test setup file for muxa tests
// This file is run before all tests to set up the test environment

import { beforeAll, afterAll } from "bun:test";

// Set up test environment
beforeAll(() => {
  // Ensure FORCE_COLOR is not set during tests unless explicitly testing it
  delete process.env.FORCE_COLOR;

  // Set NODE_ENV to test
  process.env.NODE_ENV = "test";

  // Disable actual mprocs execution during tests
  process.env.MUXA_TEST_MODE = "true";
});

// Clean up after all tests
afterAll(() => {
  // Reset environment
  delete process.env.MUXA_TEST_MODE;
  delete process.env.NODE_ENV;
});

// Global test timeout
export const globalTimeout = 30000; // 30 seconds for CI environments
