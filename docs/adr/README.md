# Architecture Decision Records

Lightweight log of architecture decisions whose rationale isn't obvious from the code. Nygard-lite — one file per decision, minimal ceremony.

## When to write one

Write an ADR when **both** hold:

- The decision is **deliberate** and likely to be **re-questioned or re-flagged later** ("this looks wrong / accidental / like duplication" — but it isn't).
- Its **rationale isn't visible in the code** — a future reader (or agent) staring at the diff couldn't reconstruct _why_ without the context.

This is the "this looks wrong but is deliberate" bar. It is **not** a log of every choice. Routine, self-evident, or convention-following decisions don't need one. When in doubt, ask: _would someone reasonably try to "fix" this later and undo a deliberate trade-off?_ If yes, record it.

## Format

- One file per decision, directly in this folder: `NNNN-kebab-title.md`, zero-padded sequential number (`0001-…`, `0002-…`). `0000-template.md` is the template, not a decision.
- Copy `0000-template.md` to start.
- Sections: **Title**, **Status**, **Context**, **Decision**, **Consequences**, and **Rejected** when a declined option is likely to be proposed again.
- **Status**: `Proposed` · `Accepted` · `Superseded` (note the superseding ADR).

No status-lifecycle ceremony, no RFC process. Keep each one short.
