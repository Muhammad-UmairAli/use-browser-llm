---
description: Formally close Phase N — marks complete in plan-data.json, updates SPLIT-PLAN row, populates phase doc closure log
argument-hint: '<phase> "<closure-summary>"'
---

# /close-phase

Close a phase that's in flight. The natural counterpart to `/open-phase`. Once invoked, the dashboard shows the phase's actual completion date in the projected-finish row and auto-collapses the phase block on load — so closed phases stop crowding the active view.

## Steps

Invoke the helper script:

```bash
python tools/close-phase.py <phase> "<closure-summary>"
```

The script:

1. Replaces the IN FLIGHT row in `SPLIT-PLAN §5 (progress log)` with the closure summary.
2. Writes `completed: <YYYY-MM-DD>` into `.claude/plan-data.json` for the phase and regenerates `.claude/plan-data.js`. The dashboard JS reads `PLAN_DATA[phase].completed` to:
   - Populate the projected-finish row's Actual column with the closure date.
   - Auto-collapse the phase's table on dashboard load.
3. Updates `docs/phases/phase-NNN.md`: flips `**Status:** IN FLIGHT` → `**Status:** CLOSED (<date>)` and populates the Closure log section with the summary.
4. Runs `render-check.py` to confirm the data files are valid.

Surface the script's stdout. It ends with `✓ Phase <N> closed. ...`.

## When to invoke

Close a phase only when its deliverables are met:

- All linked PRs merged
- All TIME-LOG rows logged for the phase's substantive work
- The phase doc's Deliverables checklist is satisfied
- Any dependent backlog items have been promoted to the next phase

If the phase is still in flight (waiting on review, deploy, etc.), don't close it yet — log additional work via `/log-time` and revisit `/close-phase` later.

## What you must not do

- Don't close a phase that has unmerged PRs or unresolved Issues. Surface those first; let the user decide.
- Don't write a closure summary on the user's behalf without confirming it. Either ask the user for the summary, or generate one from the phase's TIME-LOG rows + closed Issues and confirm.
- Don't use this command to close Phase 0 — `init-project.sh` marks Phase 0 complete automatically at the end of bootstrap.
