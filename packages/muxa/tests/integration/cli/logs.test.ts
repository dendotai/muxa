import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import {
  cleanupFixture,
  createRootPackageWorkspace,
  createTempWorkspace,
} from "@tests/helpers/fixture-helpers";
import { muxaPath, muxaRuntime } from "@tests/helpers/constants";
import { runMuxa } from "@tests/helpers/muxa-runner";
import { runInTerminal } from "@tests/helpers/terminal-runner";

const START_1 = "=== muxa started 2026-01-31 09:30:00+01:00 ===\n";
const START_2 = "=== muxa started 2026-01-31 10:00:00+01:00 ===\n";

describe("CLI > muxa logs", () => {
  let created: string[] = [];
  afterEach(() => {
    created.forEach(cleanupFixture);
    created = [];
  });
  const track = (dir: string) => {
    created.push(dir);
    return dir;
  };
  const writeLogs = (dir: string, files: Record<string, string>) => {
    fs.mkdirSync(dir, { recursive: true });
    for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), text);
  };
  const projectWithLogs = (files: Record<string, string>) => {
    const cwd = track(createRootPackageWorkspace());
    writeLogs(path.join(cwd, ".muxa", "logs"), files);
    return cwd;
  };

  it("prints from the last start line to the end", async () => {
    const cwd = projectWithLogs({
      "web.log": `${START_1}old\r\n${START_2}new 1\r\nnew 2\r\n`,
    });
    const result = await runMuxa(["logs", "web"], { cwd });
    expect(result).toEqual({ code: 0, stderr: "", stdout: `${START_2}new 1\nnew 2\n` });
  });

  it("joins the two log files when the last start line is in the older one", async () => {
    const cwd = projectWithLogs({
      "web.log.1": `${START_1}old\r\n${START_2}new 1\r\nnew `,
      "web.log": "2\r\nnew 3\r\n",
    });
    const result = await runMuxa(["logs", "web"], { cwd });
    expect(result.stdout).toBe(`${START_2}new 1\nnew 2\nnew 3\n`);
  });

  it("leaves out the older log file when the last start line is in the newer one", async () => {
    const cwd = projectWithLogs({
      "web.log.1": `${START_1}old\r\n`,
      "web.log": `still old\r\n${START_2}new\r\n`,
    });
    const result = await runMuxa(["logs", "web"], { cwd });
    expect(result.stdout).toBe(`${START_2}new\n`);
  });

  it("prints both log files when rotation dropped the start line", async () => {
    const cwd = projectWithLogs({ "web.log.1": "1\r\n", "web.log": "2\r\n" });
    const result = await runMuxa(["logs", "web"], { cwd });
    expect(result.stdout).toBe("1\n2\n");
  });

  it("prints the log when the temporary folder is missing", async () => {
    const cwd = projectWithLogs({ "web.log": "1\r\n" });
    const result = await runMuxa(["logs", "web"], { cwd, env: { TMPDIR: "/nonexistent" } });
    expect(result).toEqual({ code: 0, stderr: "", stdout: "1\n" });
  });

  it("says when the log is empty", async () => {
    const cwd = projectWithLogs({ "web.log": "", "api.log": "", "api.log.1": "1\r\n" });
    expect(await runMuxa(["logs", "web"], { cwd })).toEqual({
      code: 0,
      stdout: "",
      stderr:
        "The log of 'web' is empty. muxa empties logs to keep them under logs.maxSizeTotal.\n",
    });
    const rotated = await runMuxa(["logs", "api"], { cwd });
    expect(rotated).toEqual({ code: 0, stderr: "", stdout: "1\n" });
  });

  it("takes a start line only from muxa, not from the process's output", async () => {
    const cwd = projectWithLogs({
      "web.log": `${START_1}$ cat other.log\r\n${START_2.trimEnd()}\r\nend ${START_2.trimEnd()}\nx\r\n`,
    });
    const result = await runMuxa(["logs", "web"], { cwd });
    expect(result.stdout).toBe(`${START_1}$ cat other.log\n${START_2}end ${START_2}x\n`);
  });

  it("finds the start line and keeps every character of a long log", async () => {
    const line = `${"é🙂".repeat(20)}\r\n`;
    const cwd = projectWithLogs({
      "web.log": `${START_1}old\r\n${START_2}${line.repeat(5000)}`,
    });
    const result = await runMuxa(["logs", "web"], { cwd });
    expect(result.stdout.length).toBe(START_2.length + 5000 * (line.length - 1));
    expect(result.stdout).toBe(START_2 + line.replace("\r", "").repeat(5000));
  });

  it("reads the home log folder in a folder with no package.json", async () => {
    const home = fs.realpathSync(track(createTempWorkspace()));
    const cwd = path.join(home, "work");
    fs.mkdirSync(cwd);
    const folder = cwd.slice(1).replaceAll("_", "__").replaceAll("/", "_");
    writeLogs(path.join(home, "state", "muxa", "logs", folder), { "web.log": `${START_1}hi\r\n` });
    const result = await runMuxa(["logs", "web"], {
      cwd,
      env: { XDG_STATE_HOME: path.join(home, "state") },
    });
    expect(result.stdout).toBe(`${START_1}hi\n`);
  });

  it("prints plain text when its output is not a terminal", async () => {
    const cwd = projectWithLogs({
      "web.log":
        "\x1b[31mred\x1b[0m \x1b[38;5;1m256\x1b[0m\r\n\x1b[2J\x1b[H\x1b]0;title\x07end\r\n",
    });
    const result = await runMuxa(["logs", "web"], { cwd });
    expect(result.stdout).toBe("red 256\nend\n");
  });

  const ESCAPES: [label: string, code: string][] = [
    ["a title", "\x1b]0;npm run dev\x07"],
    ["a title that ends with ST", "\x1b]2;npm run dev\x1b\\"],
    ["a link", "\x1b]8;;http://a.b/c d\x1b\\"],
    ["a device control string", "\x1bP+q544e\x1b\\"],
    ["a private mode", "\x1b[?2004h"],
    ["a key mode", "\x1b[>4;1m"],
    ["a soft reset", "\x1b[!p"],
    ["a cursor shape", "\x1b[0 q"],
    ["a saved cursor", "\x1b7"],
    ["a full reset", "\x1bc"],
    ["a character set", "\x1b(B"],
    ["a bell and a shift", "\x07\x0e"],
  ];
  for (const [label, code] of ESCAPES) {
    it(`drops ${label} and no text, in a pipe and in a terminal`, async () => {
      const cwd = projectWithLogs({ "web.log": `${code}save\t${code}text\r\n` });
      expect((await runMuxa(["logs", "web"], { cwd })).stdout).toBe("save\ttext\n");
      const run = runInTerminal(["logs", "web"], { cwd });
      expect(await run.exited()).toBe(0);
      expect(run.rawOutput()).toBe("save\ttext\r\n");
    });
  }

  it("keeps the text after a title that never ends", async () => {
    const cwd = projectWithLogs({ "web.log": "\x1b]0;title\r\n" });
    expect((await runMuxa(["logs", "web"], { cwd })).stdout).toBe("0;title\n");
  });

  it("shows the last state of each progress line", async () => {
    const cwd = projectWithLogs({
      "web.log": "10%\r50%\r100%\r\n\r1/2\r2/2\r\nspin\r\x1b[Kdone\n\r\nmid 1\rmid 2\r",
    });
    const result = await runMuxa(["logs", "web"], { cwd });
    expect(result.stdout).toBe("100%\n2/2\ndone\n\nmid 2\n");
  });

  it("keeps the color of a progress line that sets it only once", async () => {
    const cwd = projectWithLogs({ "web.log": "\x1b[1m\x1b[0m\x1b[32m10%\r20%\x1b[0m\r\n" });
    const run = runInTerminal(["logs", "web"], { cwd });
    expect(await run.exited()).toBe(0);
    expect(run.rawOutput()).toBe("\x1b[0m\x1b[32m20%\x1b[0m\r\n");
  });

  it("shows the last state of a progress line that rewrites itself with escape sequences", async () => {
    const cwd = projectWithLogs({
      "web.log": [
        "100%\r\x1b[?25h", // Shows the cursor
        "50%\x1b[2K\r", // Erases the line
        "-\x1b[1G\x1b[0K|\x1b[1G\x1b[0Kready", // The spinner of npm
        "-\x1b[1G\x1b[0K",
        "end",
      ]
        .map((line) => `${line}\r\n`)
        .join(""),
    });
    const result = await runMuxa(["logs", "web"], { cwd });
    expect(result.stdout).toBe("100%\n\nready\n\nend\n");
  });

  it("keeps colors, and no other escape sequence, when its output is a terminal", async () => {
    const cwd = projectWithLogs({
      "web.log": "\x1b[31mred\x1b[0m\x1b[2J\x1b[H\x1b]0;title\x07\x1b[38;5;1m256\x1b[0m\r\n",
    });
    const run = runInTerminal(["logs", "web"], { cwd });
    expect(await run.exited()).toBe(0);
    expect(run.rawOutput()).toBe("\x1b[31mred\x1b[0m\x1b[38;5;1m256\x1b[0m\r\n");
  });

  it("stops without an error when its reader closes the pipe", async () => {
    const cwd = projectWithLogs({ "web.log": "line\r\n".repeat(500_000) });
    const proc = Bun.spawn(
      ["sh", "-c", `"$0" "$1" logs web | head -1; echo done`, muxaRuntime, muxaPath],
      { cwd, stdout: "pipe", stderr: "pipe" },
    );
    expect(await Bun.readableStreamToText(proc.stdout)).toBe("line\ndone\n");
    expect(await Bun.readableStreamToText(proc.stderr)).toBe("");
  });

  it("works in a process that muxa runs", async () => {
    const cwd = projectWithLogs({ "web.log": "hi\r\n" });
    const result = await runMuxa(["logs", "web"], { cwd, env: { MUXA_RUNNING: "1" } });
    expect(result).toEqual({ code: 0, stderr: "", stdout: "hi\n" });
  });

  describe("finds the log file of", () => {
    const long = `echo ${"x".repeat(300)}`;
    it.each([
      ["a tab name", "backend:dev", "backend_dev.log"],
      ["a tab name with dots at the ends", ".web.", "web.log"],
      ["a tab name that ends with .log", "web.log", "web.log"],
      ["a command", "echo a/b", "echo_a_b.log"],
      ["a command that sh runs", "a && b", "sh_-c__a____b_.log"],
      ["a command that sh runs, beside a tab name", "a && b", "a____b.log"],
      ["a command with a comma, beside a tab name", "echo a,b", "echo_a_b.log"],
      ["a long command", long, `echo_${"x".repeat(195)}.log`],
      ["a path as its name", "../../secret", "_.._secret.log"],
    ])("%s", async (_, name, file) => {
      const cwd = projectWithLogs({ [file]: "hi\r\n" });
      const result = await runMuxa(["logs", name], { cwd });
      expect(result).toEqual({ code: 0, stderr: "", stdout: "hi\n" });
    });
  });

  it("lists the processes of the log files when it finds none for the name", async () => {
    const cwd = projectWithLogs({ "web.log": "", "web.log.1": "", "api.log": "" });
    const result = await runMuxa(["logs", "wbe"], { cwd });
    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: "Error: No log file for 'wbe' in .muxa/logs\nAvailable processes: api, web\n",
    });
  });

  it("does not print the log file of another name", async () => {
    const cwd = projectWithLogs({
      "a_b.log": "from a b\r\n",
      "web.log": "from Web\r\n",
      "processes.json": JSON.stringify([
        { name: "a b", file: "a_b.log" },
        { name: "Web", file: process.platform === "darwin" ? "Web.log" : "web.log" },
      ]),
    });
    for (const name of ["a/b", "web"]) {
      const result = await runMuxa(["logs", name], { cwd });
      expect(result.stderr).toBe(
        `Error: No log file for '${name}' in .muxa/logs\nAvailable processes: a b, Web\n`,
      );
    }
  });

  it.each(["null", "{}", "[1]", "not JSON"])(
    "reads the log files when processes.json holds %s",
    async (json) => {
      const cwd = projectWithLogs({ "web.log": "hi\r\n", "processes.json": json });
      const result = await runMuxa(["logs", "web"], { cwd });
      expect(result).toEqual({ code: 0, stderr: "", stdout: "hi\n" });
    },
  );

  it("says when the folder has no log files", async () => {
    const result = await runMuxa(["logs", "web"], { cwd: track(createRootPackageWorkspace()) });
    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: "Error: No log files in .muxa/logs. muxa writes them when it starts processes.\n",
    });
  });
});
