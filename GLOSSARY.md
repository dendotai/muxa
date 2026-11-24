# muxa

muxa runs several commands side by side in one terminal, with monorepo awareness, on top of dekit in mprocs mode.

## Language

**Settings**:
Optional values under the `muxa` key of the root `package.json`.
_Avoid_: config, configuration file, mprocs settings

**Process**:
One command that muxa starts, with the programs it starts.
_Avoid_: app, tab, task

**Package**:
A folder of the monorepo that `-s` and `-w` name.
_Avoid_: app

**Tab name**:
The name of a process in the process list.
_Avoid_: process name
