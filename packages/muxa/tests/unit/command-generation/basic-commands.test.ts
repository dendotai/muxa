import { describe, it, expect } from "bun:test";
import { getMuxaCommand } from "@tests/helpers/muxa-runner";

describe("Command Generation > Basic Commands", () => {
  it("should generate simple basic commands", async () => {
    const result = await getMuxaCommand(["echo hello", "echo world"]);
    expect(result.command).toBe("'echo hello' 'echo world'");
  });

  it("should generate advanced commands with -c", async () => {
    const result = await getMuxaCommand(["-c", "echo hello", "-c", "echo world"]);
    expect(result.command).toBe("'echo hello' 'echo world'");
  });

  it("should generate commands with names", async () => {
    const result = await getMuxaCommand(["-c", "echo hello", "api", "-c", "echo world", "web"]);
    expect(result.command).toBe("'--names' 'api,web' 'echo hello' 'echo world'");
  });
});
