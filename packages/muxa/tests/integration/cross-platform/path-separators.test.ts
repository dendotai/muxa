import { describe, it, expect } from "bun:test";
import * as path from "path";

describe("Path Separators", () => {
  describe("Normalization", () => {
    it("should normalize forward slashes", () => {
      const paths = [
        "packages/frontend/src",
        "./packages/frontend/src",
        "packages/frontend/src/",
        "packages//frontend//src",
      ];

      const normalized = paths.map((p) => path.normalize(p));

      // Check consistency
      normalized.forEach((p) => {
        expect(p).not.toContain("//");
        // path.normalize may or may not remove trailing slashes
        // depending on platform and path
      });
    });

    it("should normalize backslashes", () => {
      const paths = [
        "packages\\frontend\\src",
        ".\\packages\\frontend\\src",
        "packages\\frontend\\src\\",
        "packages\\\\frontend\\\\src",
      ];

      const normalized = paths.map((p) => path.normalize(p));

      // Check consistency
      normalized.forEach((p) => {
        if (process.platform === "win32") {
          // On Windows, should not have double backslashes
          expect(p).not.toContain("\\\\");
        } else {
          // On Unix, backslashes are treated as regular characters
          // not as path separators
          expect(p).toBeDefined();
        }
      });
    });

    it("should handle mixed separators", () => {
      const mixed = ["packages\\frontend/src", "packages/backend\\lib", "./tools\\scripts/build"];

      const normalized = mixed.map((p) => path.normalize(p));

      normalized.forEach((p) => {
        // Should have consistent separators after normalization
        const hasForward = p.includes("/");
        const hasBackward = p.includes("\\");

        if (process.platform === "win32") {
          // Windows uses backslashes
          expect(hasBackward).toBe(true);
          expect(hasForward).toBe(false);
        } else {
          // Unix keeps backslashes as literal characters
          expect(hasForward || hasBackward).toBe(true);
        }
      });
    });
  });

  describe("Platform paths", () => {
    describe("Unix paths", () => {
      const isUnix = process.platform !== "win32";
      const itOnUnix = isUnix ? it : it.skip;

      itOnUnix("should use forward slashes on Unix", () => {
        const testPath = path.join("packages", "frontend", "src");
        expect(testPath).toContain("/");
        expect(testPath).not.toContain("\\");
      });

      itOnUnix("should preserve single dots", () => {
        const testPath = path.normalize("./packages/frontend");
        expect(testPath).toBe("packages/frontend");
      });

      itOnUnix("should resolve double dots", () => {
        const testPath = path.normalize("packages/../src");
        expect(testPath).toBe("src");
      });
    });

    describe("Windows paths", () => {
      const isWindows = process.platform === "win32";
      const itOnWindows = isWindows ? it : it.skip;

      itOnWindows("should use backslashes on Windows", () => {
        const testPath = path.join("packages", "frontend", "src");
        expect(testPath).toContain("\\");
        expect(testPath).not.toContain("/");
      });

      itOnWindows("should handle drive letters", () => {
        const testPath = path.normalize("C:\\Users\\test");
        expect(testPath).toStartWith("C:\\");
      });

      itOnWindows("should handle UNC paths", () => {
        const testPath = path.normalize("\\\\server\\share\\file");
        expect(testPath).toStartWith("\\\\");
      });
    });
  });

  describe("Path comparison", () => {
    it("should handle trailing separators", () => {
      const path1 = "packages/frontend";
      const path2 = "packages/frontend/";

      // Normalize both paths for comparison
      const norm1 = path.normalize(path1);
      const norm2 = path.normalize(path2);

      // They should be functionally equivalent
      expect(path.resolve(norm1)).toBe(path.resolve(norm2));
    });

    it("should handle relative vs absolute paths", () => {
      const relative = "./packages/frontend";
      const resolved = path.resolve(relative);

      expect(path.isAbsolute(relative)).toBe(false);
      expect(path.isAbsolute(resolved)).toBe(true);
    });

    it("should handle parent directory references", () => {
      const pathWithParent = "packages/frontend/../backend";
      const normalized = path.normalize(pathWithParent);

      expect(normalized).toBe(path.join("packages", "backend"));
    });
  });

  describe("Workspace path handling", () => {
    it("should handle nested workspace paths", () => {
      const workspacePaths = ["packages/frontend", "packages/backend", "tools/scripts", "apps/web"];

      const normalized = workspacePaths.map((p) => path.normalize(p));

      // All should be normalized consistently
      normalized.forEach((p, i) => {
        const original = workspacePaths[i];
        if (original) {
          const parts = original.split("/");
          expect(p).toBe(path.join(...parts));
        }
      });
    });

    it("should handle workspace paths with dots", () => {
      const workspacePaths = [
        "./packages/frontend",
        "../monorepo/packages/backend",
        "packages/./shared",
        "packages/../packages/utils",
      ];

      const normalized = workspacePaths.map((p) => path.normalize(p));

      expect(normalized[0]).toBe("packages/frontend");
      expect(normalized[1]).toContain("monorepo");
      expect(normalized[2]).toBe("packages/shared");
      expect(normalized[3]).toBe("packages/utils");
    });
  });
});
