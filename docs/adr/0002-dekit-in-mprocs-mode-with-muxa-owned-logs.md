# 0002. Processes run on dekit in mprocs mode, and muxa owns their log files

**Status:** Accepted

Agents need every process's full output and a way to restart a process (#5). mprocs was renamed to dekit after 0.9.6, so muxa runs `dekit mprocs` with its current flags, at least at first, and talks to the session through `--server` and `--ctl`. Users type only `muxa` commands: muxa wraps each dekit action it needs, and dekit stays a part users do not see, as mprocs was. dekit's own process commands (`dekit restart`) do not see a `dekit mprocs` session.

dekit writes one log file per process with `--log-mode append`, and muxa owns the lifecycle: a `muxa started` line at each start, never a cleared file, and rotation by copying `web.log` to `web.log.1` and then emptying `web.log`. Emptying is safe while dekit writes, because append mode opens files with `O_APPEND`. dekit cannot reopen its log files, so a line written in the last moments of a rotation can be lost, as with logrotate's `copytruncate`.

## Consequences

- `restart`, `stop`, and `start` select a process by position before they act, so the process stays selected in the screen; dekit has no command that reports the selection.
- Quit is `q` then `x`, and muxa exits 0 even after a process failed.

## Rejected

- mprocs 0.9.6 with `--log-dir`: it works with muxa's flags, but it is the last `mprocs` release.
- muxa's own runner: it would have to replace terminal drawing, input, scrolling, and interactive programs.
- dekit's `--log-mode truncate`: it clears the file at each start, so a crash before a muxa restart is lost, and it does not open files with `O_APPEND`, so muxa cannot rotate safely.
