import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { withEnv } from "@tests/helpers/constants";

describe("withEnv Helper", () => {
  let originalEnv: typeof process.env;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Double-check that environment is properly restored
    for (const key in process.env) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  describe("Basic functionality", () => {
    it("should set environment variables for sync functions", () => {
      const testKey = "TEST_SYNC_VAR";
      const testValue = "sync_value";
      let valueInFunction: string | undefined;

      withEnv({ [testKey]: testValue }, () => {
        valueInFunction = process.env[testKey];
      });

      expect(valueInFunction).toBe(testValue);
      expect(process.env[testKey]).toBeUndefined();
    });

    it("should set environment variables for async functions", async () => {
      const testKey = "TEST_ASYNC_VAR";
      const testValue = "async_value";
      let valueInFunction: string | undefined;

      await withEnv({ [testKey]: testValue }, async () => {
        valueInFunction = process.env[testKey];
        // Add a small delay to ensure async behavior
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(valueInFunction).toBe(testValue);
      expect(process.env[testKey]).toBeUndefined();
    });

    it("should restore original environment after sync execution", () => {
      const existingKey = "EXISTING_VAR";
      const originalValue = "original";
      const tempValue = "temporary";

      process.env[existingKey] = originalValue;

      withEnv({ [existingKey]: tempValue }, () => {
        expect(process.env[existingKey]).toBe(tempValue);
      });

      expect(process.env[existingKey]).toBe(originalValue);
    });

    it("should restore original environment after async execution", async () => {
      const existingKey = "EXISTING_ASYNC_VAR";
      const originalValue = "original_async";
      const tempValue = "temporary_async";

      process.env[existingKey] = originalValue;

      await withEnv({ [existingKey]: tempValue }, async () => {
        expect(process.env[existingKey]).toBe(tempValue);
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(process.env[existingKey]).toBe(originalValue);
    });
  });

  describe("Multiple environment variables", () => {
    it("should set multiple environment variables at once", () => {
      const vars = {
        VAR1: "value1",
        VAR2: "value2",
        VAR3: "value3",
      };

      withEnv(vars, () => {
        expect(process.env.VAR1).toBe("value1");
        expect(process.env.VAR2).toBe("value2");
        expect(process.env.VAR3).toBe("value3");
      });

      expect(process.env.VAR1).toBeUndefined();
      expect(process.env.VAR2).toBeUndefined();
      expect(process.env.VAR3).toBeUndefined();
    });

    it("should restore all original values correctly", () => {
      // Set up some existing variables
      process.env.KEEP1 = "keep1";
      process.env.KEEP2 = "keep2";
      process.env.OVERRIDE = "original";

      withEnv(
        {
          OVERRIDE: "new",
          NEW1: "new1",
          NEW2: "new2",
        },
        () => {
          expect(process.env.KEEP1).toBe("keep1");
          expect(process.env.KEEP2).toBe("keep2");
          expect(process.env.OVERRIDE).toBe("new");
          expect(process.env.NEW1).toBe("new1");
          expect(process.env.NEW2).toBe("new2");
        },
      );

      expect(process.env.KEEP1).toBe("keep1");
      expect(process.env.KEEP2).toBe("keep2");
      expect(process.env.OVERRIDE).toBe("original");
      expect(process.env.NEW1).toBeUndefined();
      expect(process.env.NEW2).toBeUndefined();
    });
  });

  describe("Edge cases", () => {
    it("should handle setting existing environment variables", () => {
      const key = "EXISTING_TO_OVERRIDE";
      process.env[key] = "original";

      withEnv({ [key]: "temporary" }, () => {
        expect(process.env[key]).toBe("temporary");
      });

      expect(process.env[key]).toBe("original");
    });

    it("should handle setting new environment variables", () => {
      const key = "BRAND_NEW_VAR";
      expect(process.env[key]).toBeUndefined();

      withEnv({ [key]: "new_value" }, () => {
        expect(process.env[key]).toBe("new_value");
      });

      expect(process.env[key]).toBeUndefined();
    });

    it("should delete variables that didn't exist before", () => {
      const key = "TEMP_ONLY_VAR";

      withEnv({ [key]: "temp" }, () => {
        expect(process.env[key]).toBe("temp");
      });

      expect(process.env[key]).toBeUndefined();
      expect(key in process.env).toBe(false);
    });

    it("should preserve variables that existed before", () => {
      const preserved = "PRESERVED_VAR";
      const notTouched = "NOT_TOUCHED_VAR";

      process.env[preserved] = "keep_me";
      process.env[notTouched] = "dont_touch";

      withEnv({ [preserved]: "temp_change" }, () => {
        expect(process.env[preserved]).toBe("temp_change");
        expect(process.env[notTouched]).toBe("dont_touch");
      });

      expect(process.env[preserved]).toBe("keep_me");
      expect(process.env[notTouched]).toBe("dont_touch");
    });

    it("should handle empty string values", () => {
      const key = "EMPTY_STRING_VAR";

      withEnv({ [key]: "" }, () => {
        expect(process.env[key]).toBe("");
      });

      expect(process.env[key]).toBeUndefined();
    });

    it("should handle environment variables with special characters", () => {
      const vars = {
        "VAR_WITH-DASH": "dash-value",
        VAR_WITH_UNDERSCORE: "underscore_value",
        VAR123: "numeric",
      };

      withEnv(vars, () => {
        expect(process.env["VAR_WITH-DASH"]).toBe("dash-value");
        expect(process.env["VAR_WITH_UNDERSCORE"]).toBe("underscore_value");
        expect(process.env["VAR123"]).toBe("numeric");
      });

      expect(process.env["VAR_WITH-DASH"]).toBeUndefined();
      expect(process.env["VAR_WITH_UNDERSCORE"]).toBeUndefined();
      expect(process.env["VAR123"]).toBeUndefined();
    });
  });

  describe("Error handling", () => {
    it("should clean up on sync function errors", () => {
      const key = "ERROR_SYNC_VAR";
      const errorMessage = "Sync error";

      expect(() => {
        withEnv({ [key]: "error_value" }, () => {
          expect(process.env[key]).toBe("error_value");
          throw new Error(errorMessage);
        });
      }).toThrow(errorMessage);

      expect(process.env[key]).toBeUndefined();
    });

    it("should clean up on async function errors", async () => {
      const key = "ERROR_ASYNC_VAR";
      const errorMessage = "Async error";

      await expect(
        withEnv({ [key]: "error_value" }, async () => {
          expect(process.env[key]).toBe("error_value");
          await new Promise((resolve) => setTimeout(resolve, 10));
          throw new Error(errorMessage);
        }),
      ).rejects.toThrow(errorMessage);

      expect(process.env[key]).toBeUndefined();
    });

    it("should propagate errors correctly", () => {
      const customError = new TypeError("Custom type error");

      expect(() => {
        withEnv({ TEMP: "value" }, () => {
          throw customError;
        });
      }).toThrow(TypeError);
    });

    it("should clean up even with early async rejection", async () => {
      const key = "EARLY_REJECT_VAR";

      await expect(
        withEnv({ [key]: "reject_value" }, async () => {
          // Immediate rejection
          throw new Error("Early rejection");
        }),
      ).rejects.toThrow("Early rejection");

      expect(process.env[key]).toBeUndefined();
    });
  });

  describe("Complex scenarios", () => {
    it("should handle nested withEnv calls", () => {
      const outer = "OUTER_VAR";
      const inner = "INNER_VAR";
      const both = "BOTH_VAR";

      withEnv({ [outer]: "outer", [both]: "outer_both" }, () => {
        expect(process.env[outer]).toBe("outer");
        expect(process.env[both]).toBe("outer_both");

        withEnv({ [inner]: "inner", [both]: "inner_both" }, () => {
          expect(process.env[outer]).toBe("outer");
          expect(process.env[inner]).toBe("inner");
          expect(process.env[both]).toBe("inner_both");
        });

        expect(process.env[outer]).toBe("outer");
        expect(process.env[inner]).toBeUndefined();
        expect(process.env[both]).toBe("outer_both");
      });

      expect(process.env[outer]).toBeUndefined();
      expect(process.env[inner]).toBeUndefined();
      expect(process.env[both]).toBeUndefined();
    });

    it("should handle concurrent async operations", async () => {
      const results: string[] = [];

      const promise1 = withEnv({ CONCURRENT: "value1" }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        results.push(process.env.CONCURRENT!);
      });

      const promise2 = withEnv({ CONCURRENT: "value2" }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push(process.env.CONCURRENT!);
      });

      await Promise.all([promise1, promise2]);

      // Both should have their own values
      expect(results).toContain("value1");
      expect(results).toContain("value2");
      expect(process.env.CONCURRENT).toBeUndefined();
    });

    it("should execute the function and complete", () => {
      let executed = false;
      withEnv({ TEMP: "value" }, () => {
        executed = true;
      });

      expect(executed).toBe(true);
    });

    it("should execute the async function and complete", async () => {
      let executed = false;
      await withEnv({ TEMP: "value" }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        executed = true;
      });

      expect(executed).toBe(true);
    });

    it("should handle undefined values in environment object", () => {
      // When undefined is passed, it doesn't set the variable at all
      const vars = { UNDEF_VAR: undefined as unknown as string };

      withEnv(vars, () => {
        // The variable won't be set because Object.assign skips undefined values
        expect(process.env.UNDEF_VAR).toBeUndefined();
      });

      expect(process.env.UNDEF_VAR).toBeUndefined();
    });
  });
});
