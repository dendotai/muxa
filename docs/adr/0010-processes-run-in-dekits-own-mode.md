# 0010. Processes run in dekit's own mode, from a dekit.yaml that muxa writes

**Status:** Accepted

## Context

ADR 0002 ran `dekit mprocs`, because dekit's own mode had no logs. dekit's master now has its own mode with `dekit logs`, `restart`, `stop`, and `start`, which muxa would otherwise build over `--server` and `--ctl`. Users still type only `muxa` commands.

dekit's own mode has limits that shape the design:

- `dekit logs` keeps the last 10,000 lines of each task in memory and loses them when the runner stops, so `muxa logs` after a quit needs a file.
- Only a task's config (`dekit.yaml`, or the socket protocol, which "may still change before the first release") gives a task a `log:` file. `dekit spawn` cannot.
- dekit has one runner per root folder. The console names the runner after that folder. Key bindings and the list title live only in the user's own dekit config.
- A task path takes letters, digits, `.`, `_`, `-`, and `/` only; a task's `label` shows any text.
- In `append` mode dekit opens the log file with `O_APPEND`, so emptying it while dekit writes is safe.

## Decision

At each start, muxa writes `.muxa/<title>/dekit.yaml`, then runs `dekit -C .muxa/<title> up` and `reload --yes`, and attaches. `<title>` is the process list title, with characters a folder name cannot hold turned into `_`. A folder with no `package.json` keeps its root under `~/.local/state/muxa/runners/`.

- **Processes.** One task per process, its path the log file's name without `.log`, its `label` the tab name as typed. A command muxa wraps runs as `sh -c`, any other as dekit's string form.
- **Logs.** Each task writes `.muxa/logs/<process>.log` in append mode. Start lines and rotation stay muxa's.
- **muxad.** A hidden task, `@muxa/muxad`, runs muxa's own program and does rotation and the total size limit. It stops with the runner, so rotation lasts as long as the processes.
- **Quit.** Each choice of dekit's quit menu does what it says: `q q`, `x`, and `Q` stop every process, and `d` leaves them running. The next `muxa` in the folder opens the screen on them.
- **One runner per folder.** A start with the processes that already run opens the screen. New names join the runner. A name that runs a different command asks before it replaces it, default No. An open run is a runner that runs.
- **Verbs.** `muxa restart`, `stop`, and `start` call dekit's commands of the same name. `--server`, `--ctl`, and the TCP port go.

## Consequences

- **Positive:** a process never has two copies in one folder, so the verbs never meet a duplicate name, and the `run-<id>.json` records go.
- **Positive:** the screen shows names as typed; ADR 0007's suffix stays only in file names.
- **Accepted trade-off:** a quit choice that stops processes, from any screen in the folder, stops all of them.
- **Accepted trade-off:** a change of the title moves the root, so muxa stops the runner under the old title.
- **Accepted trade-off:** muxad is one more Node process per runner.

## Rejected

- `dekit spawn` with logs only in `dekit logs`: no output after a quit, and at most 10,000 lines per process.
- Tasks added through dekit's socket protocol: it may change before dekit's first release.
- One runner per run: two `web` processes at once make `muxa restart web` fail again.
- Every quit stopping every process: `d` says "leave everything running".
- Key bindings written into the user's dekit config: they apply to every dekit project of that user.
- Rotation only while a muxa command runs: a run left after `d` grows past its limit.
- A muxa server: a second control route next to dekit's socket.
