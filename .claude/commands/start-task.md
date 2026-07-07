---
description: Record a task start timestamp in .claude/task-timer.json
argument-hint: '<phase> <step> "<description>"'
---

# /start-task

Record the wall-clock start of a task so `tools/log-time.py` can calculate real elapsed time when the task finishes.

## Usage

```
/start-task <phase> <step> "<description>"
```

## What this does

1. Writes a timer entry to `.claude/task-timer.json` keyed by `"<phase>-<step>"` with the UTC start timestamp and description.

## When to call

Call this at the very beginning of each task in `/work-the-phase`, before any code is written or commands are run. The matching `/log-time` call at task finish automatically reads the timer and records real elapsed hours instead of the CCPM estimate.

## Example

```
/start-task 2 P2-01 "Issue #16 — auth middleware"
```

> **`<step>` must be the EXACT step id (`num`) from `.claude/plan-data.json`** — whatever
> id `/open-phase` decomposition wrote, typically `P{phase}-{NN}` (e.g. `P1-06`). Use the
> SAME id you will pass to `/log-time`, so the timer key and the plan-data/time-log rows
> line up. A bare number (`6`/`06`) that shadows an existing `P{phase}-NN` row is
> **refused** (exit 2). See
> `docs/methodology/02-time-tracking-and-estimates.md` § "Step ids".

## Implementation

```bash
python tools/start-task.py <phase> <step> "<description>"
```
