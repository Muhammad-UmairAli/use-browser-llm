---
description: Open a new phase — adds a row to SPLIT-PLAN §5 (progress log), creates docs/phases/phase-NNN.md skeleton, logs the opening
argument-hint: '<phase-number> "<short title>"'
---

# /open-phase

Open Phase N formally. Every phase must be opened via this command **before** any phase work happens (writing PRDs, decomposing tasks, building, etc.). Skipping `/open-phase` and starting work directly is how phase work — including CCPM decomposition — ends up untracked.

## Arguments

```
/open-phase <phase-number> "<short title>"
```

| Arg              | Example                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `<phase-number>` | `1`, `2`, `1.4.0`, `am-3`, `release/2.0.0`                              |
| `<short title>`  | `"customer-portal build"`, `"add billing UI"`, `"hotfix: timezone bug"` |

## Steps

Invoke the helper script:

```bash
python tools/open-phase.py <phase-number> "<short title>"
```

The script:

1. Checks that the phase isn't already in flight in SPLIT-PLAN §5 (progress log) — exits with an error if so.
2. Adds an in-flight row to `SPLIT-PLAN §5 (progress log)`.
3. Creates `docs/phases/phase-NNN.md` (zero-padded for numeric ids) with a skeleton of Scope, Deliverables, Plan, and Closure log sections.
4. Calls `tools/log-time.py <phase> 0 0.05 "Phase <N> opened — ..."` which creates the Phase N entry in `.claude/plan-data.json`, appends the time-log entry and TIME-LOG.md row, and regenerates the `.js` views the dashboard reads.

Surface the script's stdout. It ends with `✓ Phase <N> is open. Log subsequent work via /log-time.`

After the script succeeds, **stop**. Wait for the user's explicit next direction. Do not auto-start any phase work (writing PRDs, decomposing tasks, building features) — those happen via separate /log-time invocations as work progresses.

## What you must not do

- Don't auto-start any phase work (writing code, opening Issues, decomposing tasks). This command opens; another command does the work.
- Don't skip the `/log-time` invocation in step 4 — without it the opening is itself an untracked action.
- Don't add a closure log here; that comes at phase close.
- Don't open a phase whose number is already in flight. Surface and stop.
