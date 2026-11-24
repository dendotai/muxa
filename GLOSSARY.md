# muxa

muxa runs several commands side by side in one terminal, with monorepo awareness, on top of dekit in mprocs mode.

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

**Rotation**:
The copy of `<process>.log` to `<process>.log.1`, after which muxa empties `<process>.log`.

**Start line**:
The line `=== muxa started <date time> ===` that opens a run in a log file.

**Verb**:
A first word that acts on one process: `logs`, `restart`, `stop`, `start`.

**Reserved word**:
A first word that muxa does not run as a command.

**Tab name**:
The name of a process in the process list.
_Avoid_: process name
