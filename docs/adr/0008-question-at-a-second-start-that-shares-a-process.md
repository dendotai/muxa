# 0008. A question at a second start that shares a process

**Status:** Superseded (by ADR 0010)

## Context

Two muxa runs in one folder share one log folder. When both start a process with one name, both write its log file, and their lines mix. Runs whose processes have different names write different files and share nothing but the folder.

Each open run keeps a `run-<id>.json` record in the log folder. The age of a record cannot tell whether its run is open: after a sleep of the computer, every record looks old.

## Decision

The record holds the muxa process id and the start time, and a run counts as open while that process runs. A start whose process writes the log file of an open run asks first, default No:

```text
Warning: web already runs in another muxa in this folder (started 14:02). Continue? (y/N):
```

With no terminal on its input, muxa exits 1 and names `muxa restart web`. After a yes, both runs write the one log file. A start with no process of the same name as an open run starts with no question.

## Consequences

- **Positive:** a second muxa for other processes in the same folder needs no answer, and a mix of lines comes only after a yes.
- **Accepted trade-off:** after a yes, `muxa restart web`, `stop`, and `start` cannot tell the two `web` processes apart, and stop with the duplicate-name error.
- **Accepted trade-off:** a new process that gets the id of an ended muxa keeps that run's record open until the new process ends.
- **Accepted trade-off:** a run writes its record only after its questions, so two starts at one moment, or one that waits on a question, both start with no question.

## Rejected

- A log folder per run: with two open runs that both have `web`, `muxa restart web` must still choose one, and the folders pile up and change the folder list of `muxa logs`.
- A numbered second log file (`web-2.log`): `muxa logs web` must still choose one.
- A refusal with no question: a user who wants the second run cannot have it.
