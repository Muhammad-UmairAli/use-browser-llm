---
description: One-command health check of the kit's pipeline — hooks, data files, generated views, step ids, runtime state
argument-hint: ""
---

# /kit-doctor

Run the kit's health check and act on what it finds. Most kit failures are silent — a hook that stopped firing, a generated `.js` view that drifted from its `.json` source, a lock left behind by a crash. This command is the first thing to run when the dashboard looks wrong, logging seems to have stopped, or a tool errors unexpectedly.

## Steps

1. Run the doctor and surface its output **verbatim**:

   ```bash
   python tools/kit-doctor.py
   ```

   (Use `python3` or `py` if `python` doesn't run on this machine.)

2. Act on the result:
   - **`RESULT: healthy`** — say so and stop; nothing else to do.
   - **Warnings (`!`)** — explain each in one sentence and ask whether to apply the printed fix. Warnings never block work.
   - **Failures (`✗`)** — each line prints its own `fix:`. Apply the fixes in order, re-run the doctor, and repeat until healthy. If a fix involves deleting or overwriting a file the user may care about (e.g. `git checkout -- .claude/time-log.json` discards uncommitted entries), confirm first.

3. If the doctor itself fails to run (missing `tools/kit-doctor.py`, no Python), fall back to `bash tools/render-check.sh <last-phase>` and report what's missing.

## What you must not do

- Don't edit `.claude/*.js` files to "fix" a mismatch — they are generated; rerun the owning tool (any `/log-time` or `/estimate`) instead.
- Don't delete data files to silence a failure. The doctor's `fix:` lines restore, not erase.
- Don't skip re-running the doctor after fixes — done means a clean `RESULT: healthy` (warnings allowed), not "applied the fix".
