# 0004. The lockfile picks the package manager for `-s`, before the `packageManager` field

**Status:** Accepted

## Context

`-s backend dev` runs a `package.json` script, so muxa must pick `npm`, `yarn`, `pnpm`, or `bun` to run it. A project shows its package manager in two places: the lockfile at the root, and the `packageManager` field in the root `package.json` that Corepack reads. The field looks like the authoritative source, but many projects have no field, and a field can stay behind after a team moves to another manager, while the lockfile is what the team's installs write.

## Decision

muxa checks at startup, in the folder it runs from:

- the lockfile, in this order: `bun.lockb` (bun), `yarn.lock` (yarn), `pnpm-lock.yaml` (pnpm), `package-lock.json` (npm); the first one found wins
- else the `packageManager` field, when it names npm, yarn, pnpm, or bun before `@` (`pnpm@8.0.0` gives pnpm)
- else npm

When the picked manager is not in `PATH`, muxa uses npm. Scripts run as `<manager> run <script>`, `yarn run` included, so every manager gets the same form.

## Consequences

- **Positive:** no Setting and no flag; `-s` runs the script the way the team's installs do.
- **Accepted trade-off:** a folder with lockfiles of two managers gets the first one in the order, whatever its `packageManager` field says.
- **Accepted trade-off:** a user who wants another manager for one process writes it out with `-c` or `-w` (`-w frontend 'yarn dev'`).
- **Open:** bun's text lockfile, `bun.lock`, is not in the list yet, so a bun project with only that file falls through to the field or npm (#39).

## Rejected

- The `packageManager` field first: many projects have none, and it can name a manager the team left.
- A Setting or a flag for the manager: the lockfile already says it, and a Setting is one more value to keep in step.
