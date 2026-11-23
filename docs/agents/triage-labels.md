# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `needs-human`        | Steps only a human can do                |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the "Label in our tracker" column to match whatever vocabulary you actually use. The labels must exist in the repo before a skill applies them (`gh label create <name>` for any missing one).

## Additional state labels

`.github/workflows/maintenance.yml` also knows these labels. They sit next to the five roles and describe who is on an issue, not whether it is specified.

| Label         | Meaning                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `in-progress` | Someone is on the issue, at any stage (grill, spec, build). Pickers such as `/next` skip it.                                                                                                           |
| `in-review`   | A ready pull request waits on a human reviewer. Exclusive with `in-progress` and `needs-human`.                                                                                                        |
| `needs-human` | The issue waits on answers or steps only a human can do, listed in one issue comment, a letter per item. An agent that parks its work sets it, and so does a triage. Exclusive with `ready-for-agent`. |
| `tracking`    | Spec split into child tickets. Not grabbable — the work is the children. Closes when they all close.                                                                                                   |

`/to-tickets` applies `tracking` to the parent spec after publishing the children and removes `in-progress` from it. `/next` and `/triage` never serve a `tracking` issue as actionable work.

## Exit convention: labels are stripped on close

Closing an issue is the terminal state. The maintenance workflow removes every live state label (`needs-triage`, `needs-info`, `ready-for-agent`, `tracking`, `in-progress`, `needs-human`, `in-review`) from each closed issue; `wontfix` stays as the closing reason. It runs on every issue close and on manual dispatch, so a missed event self-heals on the next run. Agents never strip these labels themselves.
