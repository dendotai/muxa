# Git hooks

The fast CI checks run before a commit or a push leaves the machine: `commit-msg` runs `commitlint`, `pre-commit` runs `lint` and `format`, and `pre-push` runs `typecheck` and `test`.

[`.githooks/`](../../.githooks) holds one file per git hook, named as git names it; the folder stays at the root, where `core.hooksPath` points git. The root `prepare` script runs [`install.mjs`](install.mjs) on every `bun install`, and the file sets that path. It does nothing in CI, because CI runs each check as its own step and a release push there would run `pre-push`, and nothing in a folder with no git repo, where `git config` would fail the install.

Each hook file is a fixed header and one call of the root script named after it (`githook:pre-commit` for `.githooks/pre-commit`), so what a hook runs is set in [`package.json`](../../package.json). `githooks.test.mjs` fails when a file lacks the header, cannot run, or has no script.

A hook runs only a check that takes seconds, because it stops every commit or push for that long. The build stays in CI. A new fast check goes into the `githook:*` script of the hook it fits; a check at another moment gets a new file with the same header and a new `githook:*` script.

Never pass `--no-verify`: fix what the hook reports (`bun run check:fix` fixes most lint and format errors). A fresh clone has no hook until its first `bun install`. `pre-commit` and `pre-push` check the files on disk, not the staged or pushed content; CI checks the commits.
