# 0005. Default tab names come from the package's folder name

**Status:** Accepted

## Context

A process with no name in the command gets one from muxa. The tab name shows in dekit's process list, which is narrow. The package name in `package.json` is the unique one, but in a monorepo it is often scoped (`@myapp/backend`), so a tab name built from it is long and every tab starts with the same scope.

## Decision

When the command gives no name:

- `-c` and basic mode: the command itself (`npm run dev`)
- `-s`: the package's folder name, a colon, and the script (`backend:dev`); the root is `.` (`.:build`)
- `-w`: the package's folder name alone (`mobile`)

Below the root, the folder name is used however the package was named in the command: `-s @myapp/backend dev` and `-s ./packages/backend dev` both give `backend:dev`.

## Consequences

- **Positive:** short tabs with no repeated scope, and the same tab name for every way of naming one package.
- **Accepted trade-off:** two packages in folders of one name (`packages/backend`, `tools/backend`) get the same default name, which brings up the duplicate-name prompt; the user names one of them.

## Rejected

- The package name from `package.json`: unique, but long and repeated in scoped monorepos.
- The identifier as typed in the command: one package would get a different tab name for each way of naming it.
