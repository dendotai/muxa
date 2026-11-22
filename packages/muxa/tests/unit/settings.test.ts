import { describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { createRootPackageWorkspace, createTempWorkspace } from "@tests/helpers/fixture-helpers";
import { readSettings, resolveProcessListTitle, toMprocsConfig } from "@/settings";

function workspaceWithRawPackageJson(content: string): string {
  const dir = createTempWorkspace("muxa-settings");
  fs.writeFileSync(path.join(dir, "package.json"), content);
  return dir;
}

describe("readSettings", () => {
  it("returns no Settings when the folder has no package.json", () => {
    expect(readSettings(createTempWorkspace("muxa-settings"))).toEqual({});
  });

  it("returns no Settings when package.json has no muxa key", () => {
    expect(readSettings(createRootPackageWorkspace())).toEqual({});
  });

  it("returns no Settings when package.json is not valid JSON", () => {
    expect(
      readSettings(workspaceWithRawPackageJson(`{ "muxa": { "mouseScrollSpeed": 1 }, }`)),
    ).toEqual({});
  });

  it("returns no Settings when package.json holds null", () => {
    expect(readSettings(workspaceWithRawPackageJson("null"))).toEqual({});
  });

  it("reads mouseScrollSpeed", () => {
    expect(readSettings(createRootPackageWorkspace({ muxa: { mouseScrollSpeed: 1 } }))).toEqual({
      mouseScrollSpeed: 1,
    });
  });

  it("rejects an unknown key and names the known keys", () => {
    expect(() =>
      readSettings(createRootPackageWorkspace({ muxa: { mouseScrolSpeed: 1 } })),
    ).toThrow(
      `Unknown key 'mouseScrolSpeed' in package.json 'muxa'. Known keys: mouseScrollSpeed, processListTitle`,
    );
  });

  it("reads processListTitle", () => {
    expect(readSettings(createRootPackageWorkspace({ muxa: { processListTitle: "Dev" } }))).toEqual(
      { processListTitle: "Dev" },
    );
  });

  it("rejects a processListTitle that is empty or not a string", () => {
    for (const value of ["", "  ", 5]) {
      expect(() =>
        readSettings(createRootPackageWorkspace({ muxa: { processListTitle: value } })),
      ).toThrow(`'muxa.processListTitle' in package.json must be a non-empty string`);
    }
  });

  it("rejects a mouseScrollSpeed that is not a whole number of 1 or more", () => {
    for (const value of [0, -1, 1.5, "fast"]) {
      expect(() =>
        readSettings(createRootPackageWorkspace({ muxa: { mouseScrollSpeed: value } })),
      ).toThrow(`'muxa.mouseScrollSpeed' in package.json must be a whole number of 1 or more`);
    }
  });

  it("rejects a muxa key that is not an object", () => {
    expect(() => readSettings(createRootPackageWorkspace({ muxa: 1 }))).toThrow(
      `'muxa' in package.json must be an object`,
    );
  });
});

describe("resolveProcessListTitle", () => {
  it("uses processListTitle from Settings first", () => {
    const dir = createRootPackageWorkspace();
    expect(resolveProcessListTitle(dir, { processListTitle: "Dev" })).toBe("Dev");
  });

  it("uses the name in package.json", () => {
    expect(resolveProcessListTitle(createRootPackageWorkspace(), {})).toBe("root");
  });

  it("uses the folder name when package.json has no name", () => {
    const dir = workspaceWithRawPackageJson(`{ "private": true }`);
    expect(resolveProcessListTitle(dir, {})).toBe(path.basename(dir));
  });

  it("uses the folder name when there is no package.json", () => {
    const dir = createTempWorkspace("muxa-settings");
    expect(resolveProcessListTitle(dir, {})).toBe(path.basename(dir));
  });
});

describe("toMprocsConfig", () => {
  it("maps mouseScrollSpeed to the mprocs key", () => {
    expect(toMprocsConfig({ mouseScrollSpeed: 2 })).toEqual({ mouse_scroll_speed: 2 });
  });

  it("returns null when Settings set nothing", () => {
    expect(toMprocsConfig({})).toBeNull();
  });
});
