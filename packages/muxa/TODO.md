# TODO

## FIX NODE WORKAROUND IN CI

Currently using `node` instead of `bun` in CI because bun isn't available in subprocess PATH. This is a terrible hack.

### What was changed

1. In `tests/helpers/muxa-runner.ts`:

   ```typescript
   // Before:
   const proc = spawn("bun", [muxaPath, ...args], {

   // After (SHITTY WORKAROUND):
   const runtime = process.env.CI ? "node" : "bun";
   const proc = spawn(runtime, [muxaPath, ...args], {
   ```

2. Similar changes in test files like `tests/integration/cli/interactive.test.ts`

### The actual problem

- Bun is installed at `/home/runner/.bun/bin/bun` in GitHub Actions
- When tests spawn subprocesses, the PATH isn't properly inherited
- Subprocesses can't find `bun` and tests hang forever

### Proper solutions

1. **Fix PATH inheritance**: Ensure spawned processes inherit the correct PATH with bun
2. **Use absolute path**: Use `/home/runner/.bun/bin/bun` in CI
3. **Fix bun setup action**: Maybe the GitHub Action isn't setting up PATH correctly for subprocesses
4. **Use execPath**: When running under bun, use `process.execPath` to get bun's location

### Why this matters

- We're using bun everywhere else
- Running with node in CI means we're not testing what we ship
- It's inconsistent and confusing
