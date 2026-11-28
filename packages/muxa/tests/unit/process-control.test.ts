import { afterEach, expect, it } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { controlProcess } from "@/process-control";
import { cleanupFixture, createRootPackageWorkspace } from "@tests/helpers/fixture-helpers";

let toDelete: string[] = [];
afterEach(() => {
  toDelete.forEach(cleanupFixture);
  toDelete = [];
});

it("stops with dekit's error when dekit does not answer the command", () => {
  const cwd = createRootPackageWorkspace();
  toDelete.push(cwd);
  fs.mkdirSync(path.join(cwd, ".muxa", "dev"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".muxa", "dev", "dekit.yaml"), "");
  // A dekit whose runner lists `web` and then refuses the restart
  const dekit = path.join(cwd, "dekit");
  const tasks = JSON.stringify({
    tasks: [{ path: "web", state: "ready", spec: { label: "web" } }],
  });
  fs.writeFileSync(
    dekit,
    `#!/bin/sh\nif [ "$3" = ls ]; then echo '${tasks}'; exit 0; fi\necho 'Error: socket closed' >&2\nexit 1\n`,
    { mode: 0o755 },
  );

  expect(() => controlProcess(dekit, cwd, "restart", "web")).toThrow(
    "muxa cannot reach the muxa that runs 'web': Error: socket closed",
  );
});
