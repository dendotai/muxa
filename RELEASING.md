# Releasing

A release is a `dev` → `main` pull request. Its merge publishes `@den-ai/muxa` to npm, and the release workflow computes the version from the commit messages. No release step runs on a laptop.

## The flow

- Feature pull requests merge into `dev`. The `commitlint` job in `.github/workflows/commits.yml` checks that each of their commits has a conventional prefix (`feat:`, `fix:`, `chore:`, …), and the `.githooks/commit-msg` hook checks each local commit.
- To release, open a pull request from `dev` into `main` titled `Release TBD`, with a `## What's Changed` list of the commits it brings.
- Merge it once its checks pass, with a **merge commit**. The release does not run the tests again, and `main` requires no green check. A squash merge turns the pull request title into the one commit semantic-release reads, and `Release TBD` carries no prefix.
- The push to `main` runs `.github/workflows/release.yml`. Its semantic-release step reads the commits since the last tag, publishes the package to npm, pushes the new tag (`v1.4.2`) and writes the GitHub release with its notes.
- The `Rename the merged release PR` step renames the merged pull request to `Release v1.4.2`.
- The same push deploys the docs when it changes `apps/docs/` (`.github/workflows/deploy-docs.yml`).

`packages/muxa/package.json` stays at `0.0.0`: the release version lives in git tags, GitHub releases and npm, so no release commit lands on `main`. Never push a `v*` tag by hand.

## Which prefix raises which part

| Commits since the last tag                      | Release             |
| ----------------------------------------------- | ------------------- |
| a `fix:` or a `perf:`                           | `v1.4.1` → `v1.4.2` |
| a `feat:`                                       | `v1.4.2` → `v1.5.0` |
| `BREAKING CHANGE:` in the body                  | `v1.5.0` → `v2.0.0` |
| only `chore:`, `docs:`, `test:`, `refactor:`, … | no release          |

A `!` after the type (`feat!:`) releases nothing with the default preset; write the `BREAKING CHANGE:` footer. npm updates the README only on a publish, so a `docs:` change to it reaches npm with the next release.

## How npm publishing works

- `@semantic-release/npm` publishes from `packages/muxa` (`pkgRoot` in the `release` key of the root `package.json`).
- Auth is trusted publishing (OIDC): npmjs.com trusts `.github/workflows/release.yml` in this repo, so no token exists anywhere, and npm adds provenance on its own. Renaming that file breaks the publish until the trust on npmjs.com names the new file.
- The `prepack` script in `packages/muxa/package.json` builds after semantic-release writes the version, so `muxa --version` prints the release.
- The comments in `release.yml` give the reason for each of its steps.
