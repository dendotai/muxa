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
  });
});
