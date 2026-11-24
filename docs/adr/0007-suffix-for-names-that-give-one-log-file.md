# 0007. A suffix separates names that would give one log file

**Status:** Accepted

## Context

dekit names a log file after the tab name, and different names can give one file: `.web` and `web` both give `web.log`, and on macOS `Web` and `web` do too. For `a b` and `a/b`, dekit numbers the second file (`a_b-2.log`), so the file of a process changes with the order of the processes.

## Decision

When different names would give one log file, muxa adds a short suffix to all but one tab name, and starts with no warning: `.web` beside `web` shows as `.web-oyv` and writes `web-oyv.log`. The suffix is a hash of the name as typed, so it is the same at each start. The name that equals its file name keeps it, in any order; if none or several do, the first one keeps it. `.muxa/logs/processes.json` maps each typed name to its file, so `muxa logs .web` works. It keeps the processes of earlier starts while their files exist, because a file name alone does not tell `a b` from `a/b`.

Two processes with exactly one name still bring up the duplicate-name prompt.

## Consequences

- **Positive:** the lines of two processes never mix, and the user answers no question.
- **Accepted trade-off:** the process list shows the suffix, because dekit names the file after the name on screen.
- **Accepted trade-off:** when no name equals its file name (`a b`, `a/b`), the start order decides which one gets the suffix.

## Rejected

- A warning with a question at start: the lines mix after a yes.
- A number (`.web-2`), `{id}` in the file name: it follows the order of the processes.
- A random suffix: a new file at each start.
- `_` in place of a dot: it changes the default tab name `.:build` (ADR 0005).
- A log file per process in dekit's config: a run with `--config` does not load the user's `mprocs.yaml`.
