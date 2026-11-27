import { describe, it, expect } from "bun:test";
import { spawn } from "child_process";
import { StdinSimulator } from "@tests/helpers/stdin-simulator";
import { muxaPath, muxaRuntime, fixturesPath } from "@tests/helpers/constants";
import { processesOf } from "@tests/helpers/muxa-runner";
import { runInTerminal } from "@tests/helpers/terminal-runner";
import * as path from "path";

const cwd = path.join(fixturesPath, "basic-npm");
const duplicateArgs = ["-c", "echo 1", "name", "-c", "echo 2", "name"];

// A terminal sends each key as the user presses it, so the prompt answers on the first y or n
// The keyboard layout is pinned (macOS only), so a run does not depend on the layout in use
function promptInTerminal(args: string[] = duplicateArgs, layout = "com.apple.keylayout.ABC") {
  return runInTerminal(args, {
    cwd,
    env: { MUXA_TEST_MODE: "true", MUXA_TEST_KEYBOARD_LAYOUT: layout },
  });
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
    expect(processesOf(run.output())).not.toEqual([]);
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

  for (const key of ["y", "Y"]) {
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
    ["Enter", "\r"],
    ["Ctrl+C", "\x03"],
  ];
  for (const [label, key] of stopKeys) {
    it(`stops on ${label}`, async () => {
      const run = promptInTerminal();
      await run.waitFor(/Continue with duplicate names/);
      run.type(key);
      expect(await run.exited()).toBe(1);
      expect(processesOf(run.output())).toEqual([]);
    });
  }

  it("ignores other keys until y or n", async () => {
    const run = promptInTerminal();
    await run.waitFor(/Continue with duplicate names/);
    run.type("x");
    await Bun.sleep(100);
    run.type("y");
    expect(await run.exited()).toBe(0);
    expect(run.output()).not.toContain("Latin layout");
  });

  it("reads keys typed together one at a time", async () => {
    const run = promptInTerminal();
    await run.waitFor(/Continue with duplicate names/);
    run.type("xy");
    expect(await run.exited()).toBe(0);
  });

  it("asks for a Latin layout once on a letter it cannot read, and waits", async () => {
    const run = promptInTerminal();
    await run.waitFor(/Continue with duplicate names/);
    run.type("н");
    await run.waitFor(/Press y or n \(switch to a Latin layout\) \(y\/N\)/);
    run.type("ф");
    await Bun.sleep(100);
    run.type("y");
    expect(await run.exited()).toBe(0);
    expect(run.output().match(/Latin layout/g)).toHaveLength(1);
  });

  describe.skipIf(process.platform !== "darwin")("on a Russian layout", () => {
    const russian = "com.apple.keylayout.Russian";

    it("starts on the key under Y", async () => {
      const run = promptInTerminal(duplicateArgs, russian);
      await run.waitFor(/Continue with duplicate names/);
      run.type("н");
      expect(await run.exited()).toBe(0);
    });

    it("stops on the key under N", async () => {
      const run = promptInTerminal(duplicateArgs, russian);
      await run.waitFor(/Continue with duplicate names/);
      run.type("т");
      expect(await run.exited()).toBe(1);
      expect(processesOf(run.output())).toEqual([]);
    });
  });
});

describe("Duplicate process names over a pipe", () => {
  const timeout = 5000;

  for (const answer of ["y", "yes", "YES", "yEs"]) {
    it(`starts on the line ${JSON.stringify(answer)}`, async () => {
      const simulator = promptOverPipe();
      await simulator.waitForOutput(/Continue with duplicate names/, timeout);
      await simulator.write(`${answer}\n`);
      expect(await simulator.waitForExit(timeout)).toBe(0);
    });
  }

  for (const answer of ["n", "no", "NO", "nO", ""]) {
    it(`stops on the line ${JSON.stringify(answer)}`, async () => {
      const simulator = promptOverPipe();
      await simulator.waitForOutput(/Continue with duplicate names/, timeout);
      await simulator.write(`${answer}\n`);
      expect(await simulator.waitForExit(timeout)).toBe(1);
    });
  }

  for (const answer of ["invalid", "у", "н"]) {
    it(`asks again after the line ${JSON.stringify(answer)}`, async () => {
      const simulator = promptOverPipe();
      await simulator.waitForOutput(/Continue with duplicate names/, timeout);
      await simulator.write(`${answer}\n`);
      await simulator.waitForOutput(/Please enter y or n \(y\/N\)/, timeout);
      await simulator.write("n\n");
      expect(await simulator.waitForExit(timeout)).toBe(1);
    });
  }
});
