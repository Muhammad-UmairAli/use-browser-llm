---
description: Append an entry to .claude/time-log.json and verify the phase still renders cleanly
argument-hint: '<phase> <step> <hours> "<notes>"'
---

# /log-time

Log actual hours for a step. **Every substantive action that Claude takes must end by invoking this command.** That includes — but is not limited to — writing a doc, decomposing tasks, building features, fixing bugs, reviewing code, opening Issues, opening or merging PRs, refactoring, and bootstrap work.

Claude is the sole writer; the developer never edits the data files directly.

## Arguments

```
/log-time <phase> <step> <hours> "<notes>"
```

| Arg       | Type                                                    | Example                                         |
| --------- | ------------------------------------------------------- | ----------------------------------------------- |
| `<phase>` | Phase identifier matching SPLIT-PLAN §5 (progress log)  | `0`, `1`, `2`, `am-1`, `1.4.0` (release)        |
| `<step>`  | **Exact** step id (`num`) from `.claude/plan-data.json` | `P1-06`, `P1-16` (NOT bare `6`/`06` — see note) |
| `<hours>` | Decimal hours, with fractional precision (≥ 0.001)      | `0.5`, `1.25`, `0.05`                           |
| `<notes>` | Short, factual description of what was done             | `"Wrote PRD for customer-portal (79 lines)"`    |

> **`<step>` must match an existing `num` in `.claude/plan-data.json`** — whatever id
> `/open-phase` decomposition wrote, typically `P{phase}-{NN}` (e.g. `P1-06`). A mismatched
> id silently appends a duplicate/orphan row instead of attaching the actual to the real
> step. `tools/log-time.py` **refuses** a bare number that shadows an existing `P{phase}-NN`
> row (exit 2). See `docs/methodology/02-time-tracking-and-estimates.md` § "Step ids".

## Steps

Invoke the helper script. It does all the heavy lifting deterministically:

```bash
python tools/log-time.py <phase> <step> <hours> "<notes>"
```

The script:

1. Appends an entry to `.claude/time-log.json` and regenerates `.claude/time-log.js`.
2. Upserts the step's `h_baseline`/`h_ai` in `.claude/plan-data.json` and regenerates `.claude/plan-data.js`.
3. Appends a row to `TIME-LOG.md` (human-readable audit trail only — not parsed by any tool).
4. Runs `tools/render-check.py <phase>` to verify the data files are valid and every step has a logged actual.

Surface the script's stdout to the user — it summarizes what was changed.

**Do not** commit on the user's behalf. The data file updates are now in the working tree; they get committed as part of the same change that did the work.

## When NOT to use this

- **Reading files only** (no edits, no git, no shell): no log entry needed.
- **Trivial edits the user explicitly tells you to skip** ("don't bother logging this"): respect their call.
- **Bootstrap by `init-project.sh`**: that script logs Phase 0 steps 1–15 itself; don't re-log them.

## What you must not do

- Don't backdate. Use today's date.
- Don't log decimal hours that aren't plausible (e.g., 12 hours for a 5-minute task).
- Don't omit the notes field — future readers need to know what was done.
- Don't edit `.claude/time-log.json` or `TIME-LOG.md` by hand — `/log-time` is the entry point.
- Don't skip `render-check.py`. Verifying the data files stay valid is the whole point.
