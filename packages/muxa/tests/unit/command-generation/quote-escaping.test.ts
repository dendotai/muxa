import { getMuxaCommand } from "@tests/helpers/muxa-runner";
import { describe, expect, it } from "bun:test";

describe("Command Generation > Quote Escaping", () => {
  describe("Single quotes", () => {
    it("should handle single quotes in commands", async () => {
      const result = await getMuxaCommand(["-c", "echo 'hello world'"]);
      // Commands with quotes are wrapped in sh -c
      expect(result.command).toContain("sh -c");
      expect(result.command).toContain("echo");
      expect(result.command).toContain("hello world");
    });

    it("should handle multiple single quotes", async () => {
      const result = await getMuxaCommand(["-c", "echo 'it\\'s working'"]);
      expect(result.command).toContain("echo");
      expect(result.command).toContain("it");
      expect(result.command).toContain("s working");
    });

    it("should handle single quotes in package names", async () => {
      const result = await getMuxaCommand(["-s", "my-package", "test's-script"]);
      if (result.error) {
        // It's okay if this fails because the package doesn't exist or workspace not configured
        expect(result.error).toMatch(
          /Package 'my-package' not found|No workspace configuration found/,
        );
      } else {
        expect(result.command).toBeTruthy();
      }
    });
  });

  describe("Double quotes", () => {
    it("should handle double quotes in commands", async () => {
      const result = await getMuxaCommand(["-c", 'echo "hello world"']);
      // Commands with quotes are wrapped in sh -c
      expect(result.command).toContain("sh -c");
      expect(result.command).toContain("echo");
      expect(result.command).toContain("hello world");
    });

    it("should handle double quotes with variables", async () => {
      const result = await getMuxaCommand(["-c", 'echo "Hello $USER"']);
      // Commands with quotes and variables are wrapped in sh -c
      expect(result.command).toContain("sh -c");
      expect(result.command).toContain("echo");
      expect(result.command).toContain("Hello");
      expect(result.command).toContain("$USER");
    });

    it("should handle escaped double quotes", async () => {
      const result = await getMuxaCommand(["-c", 'echo "Say \\"Hello\\""']);
      expect(result.command).toContain("Say");
      expect(result.command).toContain("Hello");
    });
  });

  describe("Mixed quotes", () => {
    it("should handle mixed single and double quotes", async () => {
      const result = await getMuxaCommand(["-c", `echo "it's working"`]);
      // Commands with quotes are wrapped in sh -c
      expect(result.command).toContain("sh -c");
      expect(result.command).toContain("echo");
      expect(result.command).toContain("it");
      expect(result.command).toContain("s working");
    });

    it("should handle complex mixed quotes", async () => {
      const result = await getMuxaCommand(["-c", `echo 'He said "Hello"'`]);
      expect(result.command).toContain("echo");
      expect(result.command).toContain("He said");
      expect(result.command).toContain("Hello");
    });

    it("should handle quotes with backticks", async () => {
      const result = await getMuxaCommand(["-c", "echo `date`"]);
      expect(result.command).toContain("echo");
      expect(result.command).toContain("date");
    });
  });

  describe("Escape sequences", () => {
    it("should handle newlines", async () => {
      const result = await getMuxaCommand(["-c", "echo 'line1\\nline2'"]);
      expect(result.command).toContain("echo");
      expect(result.command).toContain("line1");
      expect(result.command).toContain("line2");
    });

    it("should handle tabs", async () => {
      const result = await getMuxaCommand(["-c", "echo 'col1\\tcol2'"]);
      expect(result.command).toContain("echo");
      expect(result.command).toContain("col1");
      expect(result.command).toContain("col2");
    });
  });

  describe("Special cases", () => {
    it("should handle empty quotes", async () => {
      const result = await getMuxaCommand(["-c", "echo ''"]);
      // Commands with quotes are wrapped in sh -c
      expect(result.command).toContain("sh -c");
      expect(result.command).toContain("echo");
    });

    it("should handle quotes in tab names", async () => {
      const result = await getMuxaCommand(["-c", "echo test", "tab's name"]);
      expect(result.command).toContain("echo test");
      expect(result.command).toContain("tab's name");
    });

    it("should handle complex shell commands", async () => {
      const result = await getMuxaCommand(["-c", "grep 'pattern' file.txt | awk '{print $1}'"]);
      expect(result.command).toContain("grep");
      expect(result.command).toContain("pattern");
      expect(result.command).toContain("file.txt");
      expect(result.command).toContain("awk");
    });
  });

  describe("Quote handling in different contexts", () => {
    it("should handle quotes in script arguments", async () => {
      const result = await getMuxaCommand(["-c", "npm run test -- --grep 'some test'"]);
      expect(result.command).toContain("npm run test");
      expect(result.command).toContain("grep");
      expect(result.command).toContain("some test");
    });

    it("should handle quotes with environment variables", async () => {
      const result = await getMuxaCommand(["-c", "NODE_ENV='production' npm start"]);
      expect(result.command).toContain("NODE_ENV");
      expect(result.command).toContain("production");
    });

    it("should handle quotes in workspace commands", async () => {
      const result = await getMuxaCommand(["-w", "package", "echo 'workspace test'"]);
      if (result.error) {
        // It's okay if this fails because the package doesn't exist or workspace not configured
        expect(result.error).toMatch(
          /Package 'package' not found|No workspace configuration found/,
        );
      } else {
        expect(result.command).toContain("echo");
        expect(result.command).toContain("workspace test");
      }
    });
  });
});
