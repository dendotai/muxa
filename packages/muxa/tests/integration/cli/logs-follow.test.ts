import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { cleanupFixture, createRootPackageWorkspace } from "@tests/helpers/fixture-helpers";
import { followLogs, type FollowRun } from "@tests/helpers/follow-runner";
import { muxaPath, muxaRuntime } from "@tests/helpers/constants";
import { runMuxa } from "@tests/helpers/muxa-runner";
import { runInTerminal } from "@tests/helpers/terminal-runner";

const START_1 = "=== muxa started 2026-01-31 09:30:00+01:00 ===\n";
const START_2 = "=== muxa started 2026-01-31 10:00:00+01:00 ===\n";

/** Longer than muxa waits before it looks at the log files again */
const NEXT_LOOK_MS = 400;

let created: string[] = [];
afterEach(() => {
  created.forEach(cleanupFixture);
  created = [];
});

function project(files: Record<string, string>) {
  const cwd = createRootPackageWorkspace();
  created.push(cwd);
  const dir = path.join(cwd, ".muxa", "logs");
  fs.mkdirSync(dir, { recursive: true });
  for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), text);
  const log = path.join(dir, "web.log");
  return { cwd, log, append: (text: string | Buffer) => fs.appendFileSync(log, text) };
}

/** As muxa rotates a log file, with this output of the process added during the copy */
async function rotate(log: string, meanwhile = "", pause = 0) {
  fs.rmSync(`${log}.1`, { force: true });
  fs.copyFileSync(log, `${log}.1.tmp`);
  fs.renameSync(`${log}.1.tmp`, `${log}.1`);
  fs.appendFileSync(log, meanwhile);
  fs.appendFileSync(`${log}.1`, meanwhile);
  await Bun.sleep(pause);
  fs.truncateSync(log);
}

describe("CLI > muxa logs -f", () => {
  it.each([[["web", "-f"]], [["-f", "web"]], [["web", "--follow"]], [["--follow", "web"]]])(
    "prints the current run and then each new line: muxa logs %p",
    async (args) => {
      const { cwd, append } = project({ "web.log": `${START_1}old\r\n${START_2}1\r\n` });
      const run = followLogs(args, cwd);
      await run.waitFor("1\n");
      append("2\r\n3\r\n");
      await run.waitFor("3\n");
      append("4\r\n");
      await run.waitFor("4\n");
      expect(run.running()).toBe(true);
      await run.interrupt();
      expect(run.output()).toBe(`${START_2}1\n2\n3\n4\n`);
      expect(await run.errors()).toBe("");
    },
  );

  it("needs a process", async () => {
    const result = await runMuxa(["logs", "-f"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(
      "Error: muxa logs needs a process name. To run a program named logs, use: muxa -c logs\n",
    );
  });

  it.each(["restart", "stop", "start"])("is no option of %s", async (verb) => {
    const result = await runMuxa([verb, "web", "-f"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe("Error: Unknown option '-f'\n");
  });

  it("prints plain text when its output is not a terminal", async () => {
    const { cwd, append } = project({ "web.log": START_1 });
    const run = followLogs(["web", "-f"], cwd);
    await run.waitFor(START_1);
    append("\x1b[31mre");
    await Bun.sleep(NEXT_LOOK_MS);
    append("d\x1b[0m\x1b[2J é");
    // Between the two bytes of a character
    append(Buffer.from("é").subarray(0, 1));
    await Bun.sleep(NEXT_LOOK_MS);
    append(Buffer.from("é").subarray(1));
    append("\r\n");
    await run.waitFor("\n", 5000);
    await run.waitFor("red éé\n");
    await run.interrupt();
    expect(run.output()).toBe(`${START_1}red éé\n`);
  });

  it("keeps colors in a terminal, and stops at Ctrl-C", async () => {
    const { cwd, append } = project({ "web.log": "1\r\n" });
    const run = runInTerminal(["logs", "web", "-f"], { cwd });
    await run.waitFor(/1/);
    append("\x1b[31mred\x1b[0m\x1b[2J\r\n");
    await run.waitFor(/red/);
    run.type("\x03");
    await run.exited();
    expect(run.rawOutput()).toBe("1\r\n\x1b[31mred\x1b[0m\r\n^C");
  });

  it("shows only the last state of a progress line", async () => {
    const { cwd, append } = project({ "web.log": START_1 });
    const run = followLogs(["web", "-f"], cwd);
    await run.waitFor(START_1);
    for (const state of ["10%", "\r50%", "\r100%", "\r\nend\r\n"]) {
      append(state);
      await Bun.sleep(NEXT_LOOK_MS);
    }
    await run.waitFor("end\n");
    await run.interrupt();
    expect(run.output()).toBe(`${START_1}100%\nend\n`);
  });

  it("shows a line with no end after a while, and then what comes after it", async () => {
    const { cwd, append } = project({ "web.log": `${START_1}Overwrite? ` });
    const run = followLogs(["web", "-f"], cwd);
    await run.waitFor("Overwrite? ");
    expect(run.output()).toBe(`${START_1}Overwrite? `);
    append("yes\r\n10%");
    await run.waitFor("\n10%");
    append("\r20%\r\n");
    await run.waitFor("\n20%\n");
    await run.interrupt();
    expect(run.output()).toBe(`${START_1}Overwrite? yes\n10%\n20%\n`);
  });

  it("goes on at the start of another run", async () => {
    const { cwd, append } = project({ "web.log": `${START_1}1\r\n` });
    const run = followLogs(["web", "-f"], cwd);
    await run.waitFor("1\n");
    append(`${START_2}2\r\n`);
    await run.waitFor("2\n");
    await run.interrupt();
    expect(run.output()).toBe(`${START_1}1\n${START_2}2\n`);
  });

  it("goes on when the log is empty", async () => {
    const { cwd, append } = project({ "web.log": "" });
    const run = followLogs(["web", "-f"], cwd);
    await Bun.sleep(NEXT_LOOK_MS);
    append("1\r\n");
    await run.waitFor("1\n");
    await run.interrupt();
    expect(run.output()).toBe("1\n");
    expect(await run.errors()).toStartWith("The log of 'web' is empty.");
  });

  describe("prints each line once across", () => {
    const follow = async (
      change: (
        log: string,
        append: (text: string | Buffer) => void,
        run: FollowRun,
      ) => Promise<void> | void,
      files: Record<string, string> = { "web.log": `${START_1}1\r\n` },
    ) => {
      const { cwd, log, append } = project(files);
      const run = followLogs(["web", "-f"], cwd);
      await run.waitFor("1\n");
      await change(log, append, run);
      append("last\r\n");
      await run.waitFor("last\n");
      await run.interrupt();
      return run.output();
    };

    it("a rotation that comes before muxa read the last lines", async () => {
      const output = await follow(async (log, append) => {
        append("2\r\nthr");
        await rotate(log, "ee\r\n4\r\n");
        append("5\r\n");
      });
      expect(output).toBe(`${START_1}1\n2\nthree\n4\n5\nlast\n`);
    });

    it("a rotation that muxa looks at while it runs", async () => {
      const output = await follow(async (log, append) => {
        append("2\r\n");
        await rotate(log, "3\r\n", NEXT_LOOK_MS);
        await Bun.sleep(NEXT_LOOK_MS);
        append("4\r\n");
      });
      expect(output).toBe(`${START_1}1\n2\n3\n4\nlast\n`);
    });

    it("a rotation after which the log file is as long as before", async () => {
      const output = await follow(async (log, append) => {
        await rotate(log);
        append("x".repeat(START_1.length + 10) + "\r\n");
      });
      expect(output).toBe(`${START_1}1\n${"x".repeat(START_1.length + 10)}\nlast\n`);
    });

    it("rotations of equal lines", async () => {
      const output = await follow(
        async (log, append) => {
          for (let i = 0; i < 2; i++) {
            append("1\r\n".repeat(10));
            await rotate(log);
            append("1\r\n".repeat(5));
            await Bun.sleep(NEXT_LOOK_MS);
          }
        },
        { "web.log": "1\r\n".repeat(10) },
      );
      expect(output).toBe(`${"1\n".repeat(40)}last\n`);
    });

    it("a rotation of an empty log file that was filled meanwhile", async () => {
      const output = await follow(
        async (log, append) => {
          append("2\r\n3\r\n");
          await rotate(log);
          append("4\r\n");
        },
        { "web.log.1": "1\r\n", "web.log": "" },
      );
      expect(output).toBe("1\n2\n3\n4\nlast\n");
    });

    it("many rotations", async () => {
      const COUNT = 8;
      const output = await follow(async (log, append) => {
        for (let i = 2; i <= COUNT; i++) {
          append(`${i}\r\n`);
          await rotate(log, `${i} and a half\r\n`);
          await Bun.sleep(NEXT_LOOK_MS);
        }
      });
      const lines = Array.from({ length: COUNT - 1 }, (_, i) => `${i + 2}\n${i + 2} and a half\n`);
      expect(output).toBe(`${START_1}1\n${lines.join("")}last\n`);
    });

    it("a rotation while muxa is stopped", async () => {
      const output = await follow(async (log, append, run) => {
        run.pause();
        append("2\r\n");
        await rotate(log, "3\r\n");
        append("4\r\n".repeat(100));
        run.resume();
      });
      expect(output).toBe(`${START_1}1\n2\n3\n${"4\n".repeat(100)}last\n`);
    });

    it("two rotations while muxa is stopped, without the lines that the first one left", async () => {
      const output = await follow(async (log, append, run) => {
        run.pause();
        append("2\r\n");
        await rotate(log);
        append("3\r\n".repeat(100));
        await rotate(log);
        append("4\r\n");
        run.resume();
      });
      expect(output).toBe(`${START_1}1\n${"3\n".repeat(100)}4\nlast\n`);
    });

    it("an emptied log file that is soon longer than before", async () => {
      const output = await follow((log, append, run) => {
        run.pause();
        fs.truncateSync(log);
        append("2\r\n".repeat(100));
        run.resume();
      });
      expect(output).toBe(`${START_1}1\n${"2\n".repeat(100)}last\n`);
    });

    it("a rotation that muxa starts in", async () => {
      const { cwd, log, append } = project({ "web.log": "1\r\n2\r\n", "web.log.1": "0\r\n" });
      const rotation = rotate(log, "", 600);
      const run = followLogs(["web", "-f"], cwd);
      await rotation;
      append("3\r\n");
      await run.waitFor("3\n");
      await run.interrupt();
      expect(run.output()).toBe("1\n2\n3\n");
    });

    it("a log that has only its older part left", async () => {
      const output = await follow(() => Bun.sleep(NEXT_LOOK_MS), { "web.log.1": "1\r\n" });
      expect(output).toBe("1\nlast\n");
    });

    it("an emptied log file beside an older one", async () => {
      const output = await follow(
        async (log, append) => {
          fs.truncateSync(log);
          await Bun.sleep(NEXT_LOOK_MS);
          append("2\r\n");
        },
        { "web.log.1": "0\r\n", "web.log": "1\r\n" },
      );
      expect(output).toBe("0\n1\n2\nlast\n");
    });

    it("log files that are deleted", async () => {
      const output = await follow(
        async (log, append) => {
          fs.rmSync(log);
          fs.rmSync(`${log}.1`);
          await Bun.sleep(NEXT_LOOK_MS);
          append("2\r\n");
        },
        { "web.log.1": "0\r\n", "web.log": "1\r\n" },
      );
      expect(output).toBe("0\n1\n2\nlast\n");
    });
  });

  it("stops without an error when its reader closes the pipe", async () => {
    const { cwd, append } = project({ "web.log": "1\r\n" });
    const proc = Bun.spawn(
      ["sh", "-c", `"$0" "$1" logs web -f | head -1; echo done`, muxaRuntime, muxaPath],
      { cwd, stdout: "pipe", stderr: "pipe" },
    );
    const timer = setInterval(() => append("2\r\n"), 100);
    const output = await Bun.readableStreamToText(proc.stdout);
    clearInterval(timer);
    expect(output).toBe("1\ndone\n");
    expect(await Bun.readableStreamToText(proc.stderr)).toBe("");
  });
});
