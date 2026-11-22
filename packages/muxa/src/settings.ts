import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface Settings {
  mouseScrollSpeed?: number;
  processListTitle?: string;
}

export interface MprocsConfig {
  mouse_scroll_speed: number;
}

const KNOWN_KEYS = ["mouseScrollSpeed", "processListTitle"];

/**
 * The package.json in `dir`, or null when it is missing or unreadable, the same way workspace
 * discovery treats package.json.
 */
function readPackageJson(dir: string): { name?: unknown; muxa?: unknown } | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8"));
  } catch {
    return null;
  }
}

export function readSettings(dir: string): Settings {
  const raw = readPackageJson(dir)?.muxa;
  if (raw === undefined) return {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`'muxa' in package.json must be an object`);
  }

  const settings: Settings = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "mouseScrollSpeed") {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
        throw new Error(
          `'muxa.mouseScrollSpeed' in package.json must be a whole number of 1 or more, got ${JSON.stringify(value)}`,
        );
      }
      settings.mouseScrollSpeed = value;
    } else if (key === "processListTitle") {
      if (typeof value !== "string" || value.trim() === "") {
        throw new Error(
          `'muxa.processListTitle' in package.json must be a non-empty string, got ${JSON.stringify(value)}`,
        );
      }
      settings.processListTitle = value;
    } else {
      throw new Error(
        `Unknown key '${key}' in package.json 'muxa'. Known keys: ${KNOWN_KEYS.join(", ")}`,
      );
    }
  }
  return settings;
}

export function resolveProcessListTitle(dir: string, settings: Settings): string {
  if (settings.processListTitle) return settings.processListTitle;
  const name = readPackageJson(dir)?.name;
  if (typeof name === "string" && name.trim() !== "") return name;
  return path.basename(path.resolve(dir));
}

export function toMprocsConfig(settings: Settings): MprocsConfig | null {
  if (settings.mouseScrollSpeed === undefined) return null;
  return { mouse_scroll_speed: settings.mouseScrollSpeed };
}

/**
 * Write the config to a new temporary file and return its path. mprocs reads it at startup;
 * the caller deletes it with `removeTempMprocsConfig` when mprocs exits.
 */
export function writeTempMprocsConfig(config: MprocsConfig): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "muxa-"));
  // mprocs picks the parser from the extension and accepts .json
  const file = path.join(dir, "mprocs.json");
  fs.writeFileSync(file, JSON.stringify(config));
  return file;
}

export function removeTempMprocsConfig(file: string): void {
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
}
