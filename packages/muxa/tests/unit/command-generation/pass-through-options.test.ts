import { describe, it, expect } from "bun:test";
import { getMuxaCommand } from "@tests/helpers/muxa-runner";

describe("Command Generation > Pass-through Options", () => {
  it("should pass through mprocs options", async () => {
    const result = await getMuxaCommand(["--hide-help", "-c", "echo hello"]);
    expect(result.command).toBe("'--hide-help' 'echo hello'");
  });

  it("should pass through multiple mprocs options", async () => {
    const result = await getMuxaCommand(["--hide-help", "--force-start", "-c", "echo hello"]);
    expect(result.command).toBe("'--hide-help' '--force-start' 'echo hello'");
  });
});
