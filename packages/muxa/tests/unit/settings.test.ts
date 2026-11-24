import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { createRootPackageWorkspace, createTempWorkspace } from "@tests/helpers/fixture-helpers";
import {
  readSettings,
  removeTempMprocsConfig,
  resolveProcessListTitle,
  toMprocsConfig,
  writeTempMprocsConfig,
} from "@/settings";

function workspaceWithRawPackageJson(content: string): string {
  const dir = createTempWorkspace("muxa-settings");
  fs.writeFileSync(path.join(dir, "package.json"), content);
  return dir;
}

describe("readSettings", () => {
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

describe("readSettings for log size limits", () => {
  const settingsWith = (logs: unknown) =>
    readSettings(createRootPackageWorkspace({ muxa: { logs } }));

  it("reads sizes in KB, MB, and GB as bytes", () => {
    expect(settingsWith({ maxSizePerProcess: "512KB", maxSizeTotal: "1.5 gb" })).toEqual({
      logs: { maxSizePerProcess: 524288, maxSizeTotal: 1610612736 },
    });
    expect(settingsWith({ maxSizeTotal: "20MB" })).toEqual({ logs: { maxSizeTotal: 20971520 } });
  });

  it("rejects a value that is not a size above 0", () => {
    for (const value of ["100", "100MiB", "-1MB", "0MB", "0.0001KB", 100, null, ""]) {
      expect(() => settingsWith({ maxSizeTotal: value })).toThrow(
        `'muxa.logs.maxSizeTotal' in package.json must be a size such as "100MB", in KB, MB, or GB, got ${JSON.stringify(value)}`,
      );
    }
  });

  it("rejects an unknown key and names the known keys", () => {
    expect(() => settingsWith({ maxSize: "1MB" })).toThrow(
      "Unknown key 'maxSize' in package.json 'muxa.logs'. Known keys: maxSizePerProcess, maxSizeTotal",
    );
  });

  it("rejects a logs key that is not an object", () => {
    for (const value of [false, "100MB", ["100MB"]]) {
      expect(() => settingsWith(value)).toThrow("'muxa.logs' in package.json must be an object");
    }
  });
});

describe("readSettings in a folder with no package.json", () => {
  const { XDG_CONFIG_HOME } = process.env;
  let configHome: string;
  beforeEach(() => {
    configHome = createTempWorkspace("muxa-config");
    process.env.XDG_CONFIG_HOME = configHome;
  });
  afterEach(() => {
    process.env.XDG_CONFIG_HOME = XDG_CONFIG_HOME;
    if (XDG_CONFIG_HOME === undefined) delete process.env.XDG_CONFIG_HOME;
  });

  const file = () => path.join(configHome, "muxa", "settings.json");
  const writeSettings = (content: string) => {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), content);
  };
  const read = () => readSettings(createTempWorkspace("muxa-settings"));

  it("returns no Settings when there is no settings.json", () => {
    expect(read()).toEqual({});
  });

  it("reads the same keys as package.json, from settings.json", () => {
    writeSettings(
      `{ "mouseScrollSpeed": 2, "processListTitle": "Mine", "logs": { "maxSizeTotal": "1KB" } }`,
    );
    expect(read()).toEqual({
      mouseScrollSpeed: 2,
      processListTitle: "Mine",
      logs: { maxSizeTotal: 1024 },
    });
  });

  it("is not read in a folder with a package.json", () => {
    writeSettings(`{ "mouseScrollSpeed": 2 }`);
    expect(readSettings(createRootPackageWorkspace())).toEqual({});
    expect(readSettings(workspaceWithRawPackageJson("not JSON"))).toEqual({});
  });

  it("names settings.json in each error", () => {
    for (const [content, error] of [
      [
        `{ "muxa": {} }`,
        `Unknown key 'muxa' in ${file()}. Known keys: mouseScrollSpeed, processListTitle, logs`,
      ],
      [
        `{ "logs": { "maxSize": "1MB" } }`,
        `Unknown key 'maxSize' in ${file()} 'logs'. Known keys: maxSizePerProcess, maxSizeTotal`,
      ],
      [`{ "logs": { "maxSizeTotal": 5 } }`, `'logs.maxSizeTotal' in ${file()} must be a size`],
      [`[]`, `${file()} must hold an object`],
      [`{ "logs": {}, }`, `${file()} is not valid JSON: `],
    ] as const) {
      writeSettings(content);
      expect(read).toThrow(error);
    }
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

describe("temporary mprocs config", () => {
  it("writes the config as JSON, then removes its folder", () => {
    const file = writeTempMprocsConfig({ mouse_scroll_speed: 1 });
    expect(path.basename(file)).toBe("mprocs.json");
    expect(JSON.parse(fs.readFileSync(file, "utf-8"))).toEqual({ mouse_scroll_speed: 1 });

    removeTempMprocsConfig(file);
    expect(fs.existsSync(path.dirname(file))).toBe(false);
  });
});
