import { describe, it, expect } from "bun:test";
import { spawn } from "child_process";
import { StdinSimulator } from "@tests/helpers/stdin-simulator";
import { muxaPath, muxaRuntime, fixturesPath } from "@tests/helpers/constants";
import { runInTerminal } from "@tests/helpers/terminal-runner";
import * as path from "path";

const cwd = path.join(fixturesPath, "basic-npm");
const duplicateArgs = ["-c", "echo 1", "name", "-c", "echo 2", "name"];

// A terminal sends each key as the user presses it, so the prompt answers on the first y or n
function promptInTerminal(args: string[] = duplicateArgs) {
  return runInTerminal(args, { cwd, env: { MUXA_TEST_MODE: "true" } });
}

// A pipe sends whole lines, so the prompt reads words and asks again on anything else
function promptOverPipe(args: string[] = duplicateArgs) {
  const proc = spawn(muxaRuntime, [muxaPath, ...args], {
    stdio: ["pipe", "pipe", "pipe"],
    cwd,
    env: { ...process.env, MUXA_TEST_MODE: "true" },
  });
  return new StdinSimulator(proc);
}

describe("Duplicate process names in a terminal", () => {
  it("warns about the duplicate name and starts on y", async () => {
    const run = promptInTerminal(["-c", "echo 1", "test", "-c", "echo 2", "test"]);
    await run.waitFor(/Continue with duplicate names\? \(y\/N\)/);
    expect(run.output()).toContain("Warning: Duplicate tab name detected: test");

    run.type("y");
    expect(await run.exited()).toBe(0);
    expect(run.output()).toContain("Would execute: dekit mprocs");
  });

  it("lists every duplicated name", async () => {
    const run = promptInTerminal([
      ...["-c", "echo 1", "test", "-c", "echo 2", "test"],
      ...["-c", "echo 3", "other", "-c", "echo 4", "other"],
    ]);
    await run.waitFor(/Continue with duplicate names/);
    expect(run.output()).toContain("Warning: Duplicate tab names detected: test, other");

    run.type("y");
    expect(await run.exited()).toBe(0);
  });

  for (const key of ["y", "Y", "у", "У"]) {
    it(`starts on ${JSON.stringify(key)}`, async () => {
      const run = promptInTerminal();
      await run.waitFor(/Continue with duplicate names/);
      run.type(key);
      expect(await run.exited()).toBe(0);
    });
  }

  const stopKeys: [label: string, key: string][] = [
    ["n", "n"],
    ["N", "N"],
    ["Cyrillic н", "н"],
    ["Enter", "\r"],
    ["Ctrl+C", "\x03"],
  ];
  for (const [label, key] of stopKeys) {
    it(`stops on ${label}`, async () => {
      const run = promptInTerminal();
      await run.waitFor(/Continue with duplicate names/);
      run.type(key);
      expect(await run.exited()).toBe(1);
      expect(run.output()).not.toContain("Would execute");
    });
  }

  it("ignores other keys until y or n", async () => {
    const run = promptInTerminal();
    await run.waitFor(/Continue with duplicate names/);
    run.type("x");
    await Bun.sleep(100);
    run.type("y");
    expect(await run.exited()).toBe(0);
  });
});

describe("Duplicate process names over a pipe", () => {
  const timeout = 5000;

  for (const answer of ["y", "yes", "YES", "yEs", "у"]) {
    it(`starts on the line ${JSON.stringify(answer)}`, async () => {
      const simulator = promptOverPipe();
      await simulator.waitForOutput(/Continue with duplicate names/, timeout);
      await simulator.write(`${answer}\n`);
      expect(await simulator.waitForExit(timeout)).toBe(0);
    });
  }

  for (const answer of ["n", "no", "NO", "nO", "н", ""]) {
    it(`stops on the line ${JSON.stringify(answer)}`, async () => {
      const simulator = promptOverPipe();
      await simulator.waitForOutput(/Continue with duplicate names/, timeout);
      await simulator.write(`${answer}\n`);
      expect(await simulator.waitForExit(timeout)).toBe(1);
    });
  }

  it("asks again after a line that is not y or n", async () => {
    const simulator = promptOverPipe();
    await simulator.waitForOutput(/Continue with duplicate names/, timeout);
    await simulator.write("invalid\n");
    await simulator.waitForOutput(/Please enter y or n \(y\/N\)/, timeout);
    await simulator.write("n\n");
    expect(await simulator.waitForExit(timeout)).toBe(1);
  });
});
