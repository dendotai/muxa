import { describe, it, expect } from "bun:test";
import { getMuxaCommand } from "@tests/helpers/muxa-runner";

describe("Command Generation > Shell Wrapping", () => {
  it("should wrap commands with && operator", async () => {
    const result = await getMuxaCommand(["-c", "echo hello && echo world"]);
    expect(result.command).toBe("'sh -c 'echo hello && echo world''");
  });

  it("should wrap commands with || operator", async () => {
    const result = await getMuxaCommand(["-c", "echo hello || echo world"]);
    expect(result.command).toBe("'sh -c 'echo hello || echo world''");
  });

  it("should wrap commands with pipe", async () => {
    const result = await getMuxaCommand(["-c", "echo hello | grep hello"]);
    expect(result.command).toBe("'sh -c 'echo hello | grep hello''");
  });

  it("should wrap commands with environment variables", async () => {
    const result = await getMuxaCommand(["-c", "echo $HOME"]);
    expect(result.command).toBe("'sh -c 'echo $HOME''");
  });

  it("should wrap commands with glob patterns", async () => {
    const result = await getMuxaCommand(["-c", "ls *.json"]);
    expect(result.command).toBe("'sh -c 'ls *.json''");
  });

  it("should not wrap simple commands", async () => {
    const result = await getMuxaCommand(["-c", "npm run dev"]);
    expect(result.command).toBe("'npm run dev'");
  });

  describe("Semicolon operator", () => {
    it("should wrap commands with semicolon", async () => {
      const result = await getMuxaCommand(["-c", "echo hello; echo world"]);
      expect(result.command).toBe("'sh -c 'echo hello; echo world''");
    });

    it("should wrap multiple semicolon commands", async () => {
      const result = await getMuxaCommand(["-c", "cd src; npm install; npm run build"]);
      expect(result.command).toBe("'sh -c 'cd src; npm install; npm run build''");
    });
  });

  describe("Input/Output redirection", () => {
    it("should wrap commands with output redirection", async () => {
      const result = await getMuxaCommand(["-c", "echo hello > output.txt"]);
      expect(result.command).toBe("'sh -c 'echo hello > output.txt''");
    });

    it("should wrap commands with append redirection", async () => {
      const result = await getMuxaCommand(["-c", "echo world >> output.txt"]);
      expect(result.command).toBe("'sh -c 'echo world >> output.txt''");
    });

    it("should wrap commands with input redirection", async () => {
      const result = await getMuxaCommand(["-c", "wc -l < input.txt"]);
      expect(result.command).toBe("'sh -c 'wc -l < input.txt''");
    });

    it("should wrap commands with stderr redirection", async () => {
      const result = await getMuxaCommand(["-c", "npm test 2> errors.log"]);
      expect(result.command).toBe("'sh -c 'npm test 2> errors.log''");
    });

    it("should wrap commands with stderr to stdout redirection", async () => {
      const result = await getMuxaCommand(["-c", "npm test 2>&1"]);
      expect(result.command).toBe("'sh -c 'npm test 2>&1''");
    });

    it("should wrap commands with complex redirection", async () => {
      const result = await getMuxaCommand(["-c", "npm test > output.log 2>&1"]);
      expect(result.command).toBe("'sh -c 'npm test > output.log 2>&1''");
    });
  });

  describe("Advanced glob patterns", () => {
    it("should wrap commands with bracket glob patterns", async () => {
      const result = await getMuxaCommand(["-c", "ls [abc]*.js"]);
      expect(result.command).toBe("'sh -c 'ls [abc]*.js''");
    });

    it("should wrap commands with question mark glob", async () => {
      const result = await getMuxaCommand(["-c", "ls file?.txt"]);
      expect(result.command).toBe("'sh -c 'ls file?.txt''");
    });

    it("should wrap commands with brace expansion", async () => {
      const result = await getMuxaCommand(["-c", "echo {a,b,c}.txt"]);
      expect(result.command).toBe("'sh -c 'echo {a,b,c}.txt''");
    });

    it("should wrap commands with extended glob patterns", async () => {
      const result = await getMuxaCommand(["-c", "ls **/*.test.js"]);
      expect(result.command).toBe("'sh -c 'ls **/*.test.js''");
    });
  });

  describe("Subshells and command substitution", () => {
    it("should wrap commands with subshells", async () => {
      const result = await getMuxaCommand(["-c", "(cd src && npm install)"]);
      expect(result.command).toBe("'sh -c '(cd src && npm install)''");
    });

    it("should wrap commands with command substitution using backticks", async () => {
      const result = await getMuxaCommand(["-c", "echo `date`"]);
      expect(result.command).toBe("'sh -c 'echo `date`''");
    });

    it("should wrap commands with command substitution using $()", async () => {
      const result = await getMuxaCommand(["-c", "echo $(pwd)"]);
      expect(result.command).toBe("'sh -c 'echo $(pwd)''");
    });

    it("should wrap commands with nested command substitution", async () => {
      const result = await getMuxaCommand(["-c", "echo $(echo $(date))"]);
      expect(result.command).toBe("'sh -c 'echo $(echo $(date))''");
    });
  });

  describe("Special characters", () => {
    it("should wrap commands with background operator", async () => {
      const result = await getMuxaCommand(["-c", "npm start &"]);
      expect(result.command).toBe("'sh -c 'npm start &''");
    });

    it("should wrap commands with tilde expansion", async () => {
      const result = await getMuxaCommand(["-c", "cd ~/projects"]);
      expect(result.command).toBe("'sh -c 'cd ~/projects''");
    });

    it("should wrap commands with escaped characters", async () => {
      const result = await getMuxaCommand(["-c", "echo \\$HOME"]);
      expect(result.command).toBe("'sh -c 'echo \\$HOME''");
    });
  });
});
