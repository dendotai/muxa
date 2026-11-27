import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { getMuxaProcesses } from "@tests/helpers/muxa-runner";

describe("Command Generation > Mixed Commands", () => {
  it("should mix workspace, script, and regular commands", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "muxa-mixed-"));

    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "test", workspaces: ["packages/*"] }, null, 2),
    );

    fs.mkdirSync(path.join(tempDir, "packages", "backend"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "packages", "backend", "package.json"),
      JSON.stringify(
        {
          name: "@test/backend",
          scripts: { dev: "nodemon" },
        },
        null,
        2,
      ),
    );

    fs.mkdirSync(path.join(tempDir, "packages", "frontend"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "packages", "frontend", "package.json"),
      JSON.stringify({ name: "@test/frontend" }, null, 2),
    );

    const result = await getMuxaProcesses(
      [
        "-s",
        "backend",
        "dev",
        "api",
        "-w",
        "frontend",
        "npm start",
        "web",
        "-c",
        "docker-compose up",
        "db",
      ],
      tempDir,
    );

    const root = fs.realpathSync(tempDir);
    expect(result.processes).toEqual([
      {
        name: "api",
        command: "npm run dev",
        folder: path.join(root, "packages", "backend"),
        log: path.join(root, ".muxa", "logs", "api.log"),
      },
      {
        name: "web",
        command: "npm start",
        folder: path.join(root, "packages", "frontend"),
        log: path.join(root, ".muxa", "logs", "web.log"),
      },
      {
        name: "db",
        command: "docker-compose up",
        folder: root,
        log: path.join(root, ".muxa", "logs", "db.log"),
      },
    ]);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
