import { describe, expect, it } from "bun:test";
import { processesOf, runMuxa } from "@tests/helpers/muxa-runner";

describe("CLI > Reserved words", () => {
  it("are all in the help", async () => {
    const result = await runMuxa(["--help"]);
    expect(result.stdout).toContain("workspaces, ws, check, migrate, logs, restart, stop, start\n");
    expect(result.stdout).toContain("muxa logs <process>");
  });

  for (const verb of ["logs", "restart", "stop", "start"]) {
    for (const args of [[verb], [verb, ""]]) {
      it(`need a process: muxa ${args.map((arg) => arg || "''").join(" ")}`, async () => {
        const result = await runMuxa(args);
        expect(result.code).toBe(1);
        expect(result.stderr).toBe(
          `Error: muxa ${verb} needs a process name. To run a program named ${verb}, use: muxa -c ${verb}\n`,
        );
      });
    }

    it(`run as a program after -c: ${verb}`, async () => {
      const result = await runMuxa(["-c", verb]);
      expect(result.code).toBe(0);
      expect(processesOf(result.stdout)).toMatchObject([{ command: verb }]);
    });

    it(`take no option: ${verb}`, async () => {
      const result = await runMuxa([verb, "--help"]);
      expect(result.code).toBe(1);
      expect(result.stderr).toBe("Error: Unknown option '--help'\n");
    });

    it(`take one process: ${verb}`, async () => {
      const result = await runMuxa([verb, "web", "api"]);
      expect(result.code).toBe(1);
      expect(result.stderr).toBe("Error: Unexpected argument: api\n");
    });
  }
});
