import { describe, it, expect } from "bun:test";
import { getMuxaProcesses } from "@tests/helpers/muxa-runner";

describe("Command Generation > Basic Commands", () => {
  it("should generate simple basic commands", async () => {
    const result = await getMuxaProcesses(["echo hello", "echo world"]);
    expect(result.processes).toMatchObject([
      { name: "echo hello", command: "echo hello", folder: process.cwd() },
      { name: "echo world", command: "echo world", folder: process.cwd() },
    ]);
  });

  it("should generate advanced commands with -c", async () => {
    const result = await getMuxaProcesses(["-c", "echo hello", "-c", "echo world"]);
    expect(result.processes).toMatchObject([
      { name: "echo hello", command: "echo hello" },
      { name: "echo world", command: "echo world" },
    ]);
  });

  it("should generate commands with names", async () => {
    const result = await getMuxaProcesses(["-c", "echo hello", "api", "-c", "echo world", "web"]);
    expect(result.processes).toMatchObject([
      { name: "api", command: "echo hello" },
      { name: "web", command: "echo world" },
    ]);
  });
});
