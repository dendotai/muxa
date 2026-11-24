import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { formatError, hasPackageJson, xdgHome } from "./utils";

export interface Settings {
  mouseScrollSpeed?: number;
  processListTitle?: string;
  logs?: Partial<LogLimits>;
}

/** In bytes */
export interface LogLimits {
  maxSizePerProcess: number;
  maxSizeTotal: number;
}

export interface MprocsConfig {
  mouse_scroll_speed: number;
}

const BYTES = { KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 };

const PROJECT_LOG_LIMITS: LogLimits = {
  maxSizePerProcess: 100 * BYTES.MB,
  maxSizeTotal: 500 * BYTES.MB,
};
/** The total is for all folders with no package.json together */
const HOME_LOG_LIMITS: LogLimits = {
  maxSizePerProcess: 50 * BYTES.MB,
  maxSizeTotal: 200 * BYTES.MB,
};

/** The place of a value in a Settings file: the file, and the keys down to the value */
interface Place {
  file: string;
  keys: string[];
}

const label = ({ file, keys }: Place) => `'${keys.join(".")}' in ${file}`;

type Parsers<T> = {
  [K in keyof T]-?: (value: unknown, place: Place) => T[K];
};

const SETTINGS: Parsers<Settings> = {
  mouseScrollSpeed(value, place) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      throw new Error(
        `${label(place)} must be a whole number of 1 or more, got ${JSON.stringify(value)}`,
      );
    }
    return value;
  },
  processListTitle(value, place) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`${label(place)} must be a non-empty string, got ${JSON.stringify(value)}`);
    }
    return value;
  },
  logs: (value, place) => parseObject(value, place, LOG_SETTINGS),
};

const LOG_SETTINGS: Parsers<Partial<LogLimits>> = {
  maxSizePerProcess: parseSize,
  maxSizeTotal: parseSize,
};

function parseSize(value: unknown, place: Place): number {
  const [, number, unit] = /^(\d+(?:\.\d+)?) ?(KB|MB|GB)$/i.exec(String(value)) ?? [];
  const bytes = Math.floor(Number(number) * BYTES[unit?.toUpperCase() as keyof typeof BYTES]);
  if (typeof value !== "string" || !(bytes >= 1)) {
    throw new Error(
      `${label(place)} must be a size such as "100MB", in KB, MB, or GB, got ${JSON.stringify(value)}`,
    );
  }
  return bytes;
}

function parseObject<T>(value: unknown, place: Place, parsers: Parsers<T>): T {
  const { file, keys } = place;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      keys.length > 0 ? `${label(place)} must be an object` : `${file} must hold an object`,
    );
  }

  const isKnown = (key: string): key is keyof T & string => Object.hasOwn(parsers, key);
  const parsed = Object.entries(value).map(([key, child]) => {
    if (!isKnown(key)) {
      const where = keys.length > 0 ? `${file} '${keys.join(".")}'` : file;
      throw new Error(
        `Unknown key '${key}' in ${where}. Known keys: ${Object.keys(parsers).join(", ")}`,
      );
    }
    return [key, parsers[key](child, { file, keys: [...keys, key] })];
  });
  return Object.fromEntries(parsed) as T;
}

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
  if (!hasPackageJson(dir)) return readHomeSettings();

  const raw = readPackageJson(dir)?.muxa;
  if (raw === undefined) return {};
  return parseObject<Settings>(raw, { file: "package.json", keys: ["muxa"] }, SETTINGS);
}

/** The Settings of every folder with no package.json */
function readHomeSettings(): Settings {
  const configHome = xdgHome(process.env.XDG_CONFIG_HOME, ".config");
  const file = path.join(configHome, "muxa", "settings.json");
  if (!fs.existsSync(file)) return {};

  const content = fs.readFileSync(file, "utf-8");
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${formatError(error)}`);
  }
  return parseObject<Settings>(raw, { file, keys: [] }, SETTINGS);
}

export function resolveLogLimits(dir: string, settings: Settings): LogLimits {
  return { ...(hasPackageJson(dir) ? PROJECT_LOG_LIMITS : HOME_LOG_LIMITS), ...settings.logs };
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
 * Write the config to a new temporary file and return its path. dekit reads it at startup;
 * the caller deletes it with `removeTempMprocsConfig` when dekit exits.
 */
export function writeTempMprocsConfig(config: MprocsConfig): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "muxa-"));
  // dekit picks the parser from the extension and accepts .json
  const file = path.join(dir, "mprocs.json");
  fs.writeFileSync(file, JSON.stringify(config));
  return file;
}

export function removeTempMprocsConfig(file: string): void {
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
}
