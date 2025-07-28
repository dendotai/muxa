import { describe, it, expect } from "bun:test";
import { runMuxa } from "@tests/helpers/muxa-runner";

describe("Muxa CLI Integration > Environment Variables", () => {
  it("should detect MUXA_RUNNING and prevent nested execution", async () => {
    const result = await runMuxa(["-c", "echo hello"], {
      env: { MUXA_RUNNING: "1" },
    });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("Nested muxa execution detected");
  });
});
