# Settings live in package.json, not in a muxa or mprocs file

Commands in scripts stay self-contained, so muxa reads no config for what runs. Optional Settings that change how muxa shows processes live under a `"muxa"` key in the root `package.json`: muxa already parses that file, so Settings need no new file and no parser package. A Setting that mprocs takes as a flag (`processListTitle`) goes as that flag; one it takes only from a config file (`mouseScrollSpeed`) goes in a temporary config with `--config`, so a `./mprocs.yaml` in the folder no longer changes that muxa run.

## Considered Options

- `.muxa.yaml`, `.muxa.toml`, `.muxa.json`: a new file, plus a parser package for YAML or TOML; JSON allows no comments.
- `bunfig.toml`: exists only in Bun projects and needs a TOML parser under Node.
- Docs that point to `mprocs.yaml`: Settings carry the muxa name.
- A muxa default for `mouse_scroll_speed`: the mprocs default of 5 is fine, and a default hides values set in `./mprocs.yaml`.
- A `--scroll-speed` flag: a shared script forces one person's speed on every teammate.
- Command presets in a config file (`muxa --preset dev`): a preset decides what runs from a file, and commands in scripts stay self-contained.

## Consequences

`package.json` is always in git, so a value in Settings applies to every teammate.
