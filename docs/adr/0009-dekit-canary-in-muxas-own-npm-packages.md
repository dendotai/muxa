# 0009. dekit canary in muxa's own npm packages

**Status:** Accepted

## Context

muxa needs dekit features that only dekit's master has (`dekit logs`, for #79), and no stable dekit release has them yet. dekit's `canary` is a GitHub prerelease, deleted and created again on every push to master, with prebuilt binaries for five platforms and a `SHA256SUMS` file. npm has no canary build: `@dekit/cli` has only the `latest` dist-tag. A canary cannot be downloaded again once dekit pushes, so a pin to a canary commit needs a home that keeps the binary. dekit is MIT-licensed, so its binaries may be republished with its `LICENSE` file.

## Decision

muxa republishes dekit's canary in five npm packages of its own, `@den-ai/dekit-canary-<os>-<cpu>`, each limited by `os` and `cpu` to its platform and holding the binary and dekit's `LICENSE`. They are `optionalDependencies` of `@den-ai/muxa` at one exact version, `0.0.0-canary.<date>.g<commit>`, and `dekitBinaryPath` finds the binary in the one npm installed. The `g` keeps a commit of digits only from reading as a number, which semver forbids with a leading zero.

`.github/workflows/update-dekit-canary.yml` runs weekly. When the canary commit differs from the pin, it checks the five archives against `SHA256SUMS`, publishes the packages through npm trusted publishing, and only then opens or updates one PR, `update-dekit-canary`, that moves the pin. The PR's CI then tests muxa on the new canary. The same run opens one issue to move back to stable dekit once dekit's newest stable tag contains the pinned commit.

## Consequences

- **Positive:** muxa can build on dekit features weeks or months before a stable release, with no wait on dekit's maintainer.
- **Accepted trade-off:** a version whose PR never merges stays on npm unused, because the publish comes before the PR.
- **Accepted trade-off:** each new package name needs one publish by hand with a maintainer's npm login before trusted publishing can be set, because npm accepts a trusted publisher only for an existing package.
- **Accepted trade-off:** GitHub turns off the weekly schedule after 60 days with no commits on the repo.
- **Open:** the move back to `@dekit/cli`, which the workflow's issue lists step by step.

## Rejected

- Waiting for dekit to publish canary to npm under a `canary` dist-tag: muxa's work would wait on dekit's maintainer, and every push to master would add six npm versions.
- Renovate for the update: it would need publish rights for muxa's npm scope, and dekit's newest master commit can have no canary build yet.
- Downloading the binary from a muxa GitHub release at first run: a first start would need the network.
- All five binaries in `@den-ai/muxa` itself: every install would download four binaries for other platforms.
