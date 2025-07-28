import { describe, it, expect } from "bun:test";
import { parseArguments, ParseError } from "@/parser";

describe("Parser", () => {
  describe("parseArguments", () => {
    it("should parse basic commands", () => {
      const result = parseArguments(["cmd1", "cmd2"]);
      expect(result.mode).toBe("basic");
      expect(result.commands).toEqual([
        { command: "cmd1", type: "command" },
        { command: "cmd2", type: "command" },
      ]);
    });

    it("should parse -c flag commands", () => {
      const result = parseArguments(["-c", "cmd1", "-c", "cmd2"]);
      expect(result.mode).toBe("advanced");
      expect(result.commands).toEqual([
        { command: "cmd1", type: "command" },
        { command: "cmd2", type: "command" },
      ]);
    });

    it("should parse -c with optional names", () => {
      const result = parseArguments(["-c", "cmd1", "api", "-c", "cmd2", "web"]);
      expect(result.mode).toBe("advanced");
      expect(result.commands).toEqual([
        { command: "cmd1", type: "command", name: "api" },
        { command: "cmd2", type: "command", name: "web" },
      ]);
    });

    it("should parse -w workspace commands", () => {
      const result = parseArguments(["-w", "backend", "npm run dev"]);
      expect(result.mode).toBe("advanced");
      expect(result.commands).toEqual([
        { command: "npm run dev", target: "backend", type: "workspace" },
      ]);
    });

    it("should parse -w with optional name", () => {
      const result = parseArguments(["-w", "backend", "npm run dev", "api"]);
      expect(result.mode).toBe("advanced");
      expect(result.commands).toEqual([
        { command: "npm run dev", target: "backend", type: "workspace", name: "api" },
      ]);
    });

    it("should parse -s script commands", () => {
      const result = parseArguments(["-s", "backend", "dev"]);
      expect(result.mode).toBe("advanced");
      expect(result.commands).toEqual([
        { command: "", target: "backend", script: "dev", type: "script" },
      ]);
    });

    it("should parse -s with optional name", () => {
      const result = parseArguments(["-s", "backend", "dev", "api"]);
      expect(result.mode).toBe("advanced");
      expect(result.commands).toEqual([
        { command: "", target: "backend", script: "dev", type: "script", name: "api" },
      ]);
    });

    it("should parse mixed flags", () => {
      const result = parseArguments([
        "-s",
        "backend",
        "dev",
        "api",
        "-w",
        "mobile",
        "npx expo start",
        "expo",
        "-c",
        "docker-compose up",
        "db",
      ]);
      expect(result.mode).toBe("advanced");
      expect(result.commands).toHaveLength(3);
      expect(result.commands[0]?.type).toBe("script");
      expect(result.commands[1]?.type).toBe("workspace");
      expect(result.commands[2]?.type).toBe("command");
    });

    it("should parse mprocs pass-through options", () => {
      const result = parseArguments(["--hide-help", "-c", "cmd1"]);
      expect(result.mprocsArgs).toEqual(["--hide-help"]);
    });

    it("should parse special commands", () => {
      expect(parseArguments(["--help"]).help).toBe(true);
      expect(parseArguments(["-h"]).help).toBe(true);
      expect(parseArguments(["--version"]).version).toBe(true);
      expect(parseArguments(["-V"]).version).toBe(true);
      expect(parseArguments(["workspaces"]).workspaces).toBe(true);
      expect(parseArguments(["ws"]).workspaces).toBe(true);
    });

    it("should parse migration commands", () => {
      expect(parseArguments(["check"]).migrate).toBe(true);
      expect(parseArguments(["check"]).dryRun).toBe(true);

      expect(parseArguments(["migrate"]).migrate).toBe(true);
      expect(parseArguments(["migrate"]).dryRun).toBeFalsy();

      expect(parseArguments(["migrate", "--dry-run"]).dryRun).toBe(true);
      expect(parseArguments(["migrate", "--yes"]).yes).toBe(true);
    });

    it("should throw on mixing basic and advanced", () => {
      expect(() => parseArguments(["cmd1", "-c", "cmd2"])).toThrow(ParseError);
      expect(() => parseArguments(["cmd1", "-c", "cmd2"])).toThrow(
        "Cannot mix basic and advanced arguments",
      );
    });

    it("should throw on missing required arguments", () => {
      expect(() => parseArguments(["-c"])).toThrow("Option -c requires a command");
      expect(() => parseArguments(["-w"])).toThrow("Option -w requires a package identifier");
      expect(() => parseArguments(["-w", "backend"])).toThrow(
        "Option -w requires a command after package identifier",
      );
      expect(() => parseArguments(["-s"])).toThrow("Option -s requires a package identifier");
      expect(() => parseArguments(["-s", "backend"])).toThrow(
        "Option -s requires a script name after package identifier",
      );
    });

    it("should handle null or empty arguments", () => {
      // Test null/empty in argv array
      const result = parseArguments(["", "cmd1", "", "cmd2"]);
      expect(result.mode).toBe("basic");
      expect(result.commands).toEqual([
        { command: "cmd1", type: "command" },
        { command: "cmd2", type: "command" },
      ]);
    });

    it("should throw on null command with -c flag", () => {
      // Create an array with null by type assertion
      const argvWithNull = ["-c", null as any];
      expect(() => parseArguments(argvWithNull)).toThrow("Option -c requires a command");
    });

    it("should throw on null package with -s flag", () => {
      // Create an array with null by type assertion
      const argvWithNull = ["-s", null as any];
      expect(() => parseArguments(argvWithNull)).toThrow("Option -s requires a package identifier");

      const argvWithNullScript = ["-s", "backend", null as any];
      expect(() => parseArguments(argvWithNullScript)).toThrow(
        "Option -s requires a script name after package identifier",
      );
    });

    it("should throw on null package with -w flag", () => {
      // Create an array with null by type assertion
      const argvWithNull = ["-w", null as any];
      expect(() => parseArguments(argvWithNull)).toThrow("Option -w requires a package identifier");

      const argvWithNullCommand = ["-w", "backend", null as any];
      expect(() => parseArguments(argvWithNullCommand)).toThrow(
        "Option -w requires a command after package identifier",
      );
    });

    it("should allow non-flag arguments in basic mode", () => {
      // In basic mode, any non-flag argument is treated as a command
      const result = parseArguments(["cmd1", "cmd2", "cmd3"]);
      expect(result.mode).toBe("basic");
      expect(result.commands).toHaveLength(3);
    });

    it("should handle all flag variations", () => {
      // Test long forms
      const result1 = parseArguments(["--command", "cmd1"]);
      expect(result1.commands[0]?.type).toBe("command");

      const result2 = parseArguments(["--script", "backend", "dev"]);
      expect(result2.commands[0]?.type).toBe("script");

      const result3 = parseArguments(["--workspace", "backend", "npm test"]);
      expect(result3.commands[0]?.type).toBe("workspace");
    });

    it("should throw on mixing modes with all flag types", () => {
      // Test mixing with -s flag
      expect(() => parseArguments(["cmd1", "-s", "backend", "dev"])).toThrow(
        "Cannot mix basic and advanced arguments",
      );

      // Test mixing with -w flag
      expect(() => parseArguments(["cmd1", "-w", "backend", "npm test"])).toThrow(
        "Cannot mix basic and advanced arguments",
      );
    });

    it("should pass through unknown flags to mprocs", () => {
      // Test that unknown flags are passed through to mprocs
      const result = parseArguments(["-c", "cmd1", "--unknown-flag"]);
      expect(result.mprocsArgs).toContain("--unknown-flag");

      // Test with multiple unknown flags (--ctl takes a value)
      const result2 = parseArguments(["--hide-help", "--ctl", "-c", "cmd1"]);
      expect(result2.mprocsArgs).toContain("--hide-help");
      expect(result2.mprocsArgs).toContain("--ctl");
    });
  });
});
