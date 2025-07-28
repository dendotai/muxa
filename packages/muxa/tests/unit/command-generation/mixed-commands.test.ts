import { describe, it, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { getMuxaCommand } from "@tests/helpers/muxa-runner";

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

    const result = await getMuxaCommand(
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

    expect(result.command).toContain("'--names' 'api,web,db'");
    expect(result.command).toContain("/packages/backend && npm run dev''");
    expect(result.command).toContain("/packages/frontend && npm start''");
    expect(result.command).toContain("'docker-compose up'");

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
