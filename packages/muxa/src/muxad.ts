import * as fs from "fs";
import * as path from "path";
import { logDirsInTotal } from "./log-files";
import { LogLimiter } from "./log-limits";
import type { LogLimits } from "./settings";
import { formatError } from "./utils";

/** Set on muxad's task, so muxa's program runs as muxad and no first word is reserved for it */
export const MUXAD_ENV = "MUXA_MUXAD";

const CHECK_INTERVAL_MS = 1000;
/** In the runner root; each start writes it, so a second start's processes join the checks */
const CONFIG_FILE = "muxad.json";
/** In the runner root, while the last check failed; the screen's muxa warns with it after the runner stops */
const ERROR_FILE = "log-limits-error.txt";

/** What muxad limits: `logDir` as `resolveLogDir` returns it, and the full paths of the log files */
export interface MuxadConfig {
  cwd: string;
  logDir: string;
  logFiles: string[];
  limits: LogLimits;
}

/**
 * With `runnerRuns`, the log files of the earlier starts stay in the checks: `dekit reload` keeps
 * running a task that the new dekit.yaml leaves out.
 */
export function writeMuxadConfig(root: string, config: MuxadConfig, runnerRuns: boolean): void {
  const file = path.join(root, CONFIG_FILE);
  if (runnerRuns) {
    const earlier = readMuxadConfig(file)?.logFiles ?? [];
    config = { ...config, logFiles: [...new Set([...earlier, ...config.logFiles])] };
  }
  // Renamed, because muxad that reads half a file takes it for broken
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(config));
  fs.renameSync(`${file}.tmp`, file);
}

export function enforceLogLimits(config: MuxadConfig): void {
  const limiter = createLimiter(config);
  try {
    enforce(limiter, config);
  } finally {
    limiter.close();
  }
}

export function readLogLimitsError(root: string): string | undefined {
  try {
    return fs.readFileSync(errorFile(root), "utf8");
  } catch {
    return undefined;
  }
}

export function removeLogLimitsError(root: string): void {
  fs.rmSync(errorFile(root), { force: true });
}

/** Check the log sizes once per second, until dekit stops the task */
export function runMuxad(root: string): void {
  let current: { content: string; config: MuxadConfig; limiter: LogLimiter } | undefined;

  const check = () => {
    let content: string;
    try {
      content = fs.readFileSync(path.join(root, CONFIG_FILE), "utf8");
    } catch {
      return;
    }
    try {
      if (content !== current?.content) {
        current?.limiter.close();
        const config = JSON.parse(content) as MuxadConfig;
        current = { content, config, limiter: createLimiter(config) };
      }
      enforce(current.limiter, current.config);
      removeLogLimitsError(root);
    } catch (error) {
      try {
        fs.writeFileSync(errorFile(root), formatError(error));
      } catch {
        // A deleted root: the next start writes it again
      }
    }
  };

  process.on("exit", () => current?.limiter.close());
  // Without a handler, Node ends on a signal without the exit event, and the run-*.json file of the open run stays
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => process.exit(0));
  }
  check();
  setInterval(check, CHECK_INTERVAL_MS);
}

function readMuxadConfig(file: string): MuxadConfig | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as MuxadConfig;
  } catch {
    return undefined;
  }
}

function enforce(limiter: LogLimiter, { cwd, logDir }: MuxadConfig): void {
  limiter.enforce(logDirsInTotal(cwd, logDir));
}

function errorFile(root: string): string {
  return path.join(root, ERROR_FILE);
}

function createLimiter({ cwd, logDir, logFiles, limits }: MuxadConfig): LogLimiter {
  return new LogLimiter(path.resolve(cwd, logDir), logFiles, limits);
}
