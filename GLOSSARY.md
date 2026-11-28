# muxa

muxa runs several commands side by side in one terminal, with monorepo awareness, on top of dekit.

## Language

**Settings**:
Optional values under the `muxa` key of the root `package.json`, or in `~/.config/muxa/settings.json` for runs in a folder with no `package.json`.
_Avoid_: config, configuration file, mprocs settings

**Process**:
One command that muxa starts, with the programs it starts.
_Avoid_: app, tab, task

**Package**:
A folder of the monorepo that `-s` and `-w` name.
_Avoid_: app

**Log file**:
A file that holds the output of one process: `<process>.log`, or `<process>.log.1` for the output before the last rotation.

**Log folder**:
The folder that holds the log files of the processes started in one folder: `.muxa/logs`, or a folder in `~/.local/state/muxa/logs/` when the folder has no `package.json`. `muxa clean` deletes the log files of every log folder in the log folder list.

**Rotation**:
The copy of `<process>.log` to `<process>.log.1`, after which muxa empties `<process>.log`.

**Start line**:
The line `=== muxa started <date time> ===` that opens a run in a log file.

**Open run**:
A runner that runs. Its processes keep running after the screen closes with `d`.

**Verb**:
A first word that acts on one process: `logs`, `restart`, `stop`, `start`.

**Reserved word**:
A first word that muxa does not run as a command.

**Tab name**:
The name of a process in the process list.
_Avoid_: process name

**Runner**:
dekit's program that runs every process of one folder. A folder has one runner.

**muxad**:
The hidden task in the runner that rotates the log files and takes later background jobs.
