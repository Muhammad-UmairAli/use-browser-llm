---
description: Generate consistent Baseline + With-AI estimates for a step using the kit's rubric and a dedicated subagent
argument-hint: <phase> <step> "<task description>"
---

# /estimate

Produce a `(Baseline h, With-AI h)` pair for one step in `DASHBOARD.html` using the rubric documented in `docs/methodology/02-time-tracking-and-estimates.md`. Two adopters running this on the same description on different days should land on the same numbers — that's the whole point of having both a published rubric _and_ an agent that applies it.

## When to invoke

- Right after `/open-phase` opens Phase N and before the first task starts, walk each known step through `/estimate` so the dashboard shows estimates against which actuals can later be compared.
- When a phase doc gains a new step mid-flight, run `/estimate` for that step.
- Re-run for an existing step when scope changes — the script is idempotent (it updates the step's `h_baseline` / `h_ai` in `.claude/plan-data.json` in place; it does NOT touch logged actuals, which are owned by `/log-time`).

## Usage

```
/estimate <phase> <step> "<task description>"
```

Examples:

```
/estimate 1 P1-02 "Build SPA HTML + CSS in parallel (general-purpose + frontend-engineer)"
/estimate 2 P2-03 "Integrate 11 theme CSS blocks; replace dark/light toggle with picker dropdown"
/estimate 3 P3-01 "Parallel extract tokens from 59 themes across 3 batches of agents"
```

> **`<step>` must be the EXACT step id (`num`) from `.claude/plan-data.json`** — whatever
> id `/open-phase` decomposition wrote, typically `P{phase}-{NN}` (e.g. `P1-06`). A bare
> number (`6`, `06`) does **not** match `P1-06`; it would silently create a duplicate/orphan
> row. `tools/estimate.py` **refuses** a bare number that shadows an existing `P{phase}-NN`
> row (exit 2) and tells you the canonical id. See
> `docs/methodology/02-time-tracking-and-estimates.md` § "Step ids".

## What the command does

1. **Set the task context** so the agent log records the correct phase and step (use `python3`, or `python`/`py` — whichever runs on this machine; the same applies to every kit tool below):

   ```bash
   python3 tools/start-task.py <phase> <step> "Estimate step <phase>-<step>"
   ```

2. **Spawn the `task-estimator` subagent** with the description.
   - Use the Agent tool: `Agent({ subagent_type: "task-estimator", description: "Estimate step <N-M>", prompt: "<phase> <step> <description>" })`.
   - The subagent reads `docs/methodology/02-time-tracking-and-estimates.md` for the rubric, the matching `docs/phases/phase-NNN.md` if present, and recent `TIME-LOG.md` rows for the same phase.
   - It returns a fenced JSON block with `baseline_h`, `with_ai_h`, `type`, `size`, `unknowns`, `rationale`, `confidence`, `error`.

3. **Parse the JSON.** If `error` is non-null, surface it to the user and stop. The most common case is "split this step into two" — when that happens, ask the user whether to split, then `/estimate` each half.

4. **Call `tools/estimate.py`** with the resolved numbers:

   ```bash
   python3 tools/estimate.py <phase> <step> <baseline_h> <with_ai_h> "<description>"
   ```

   The script upserts the step entry in `.claude/plan-data.json` with `h_baseline` and `h_ai` set **separately** (unlike `/log-time`, which sets both to the actual hours). It then regenerates `.claude/plan-data.js`. `DASHBOARD.html`'s `renderDynamicPhases()` reads the updated values on next page load.

5. **Surface the rationale.** Print the subagent's `type`, `size`, `unknowns`, `rationale`, and `confidence` to the user so they can sanity-check the estimate before reality bends it.

## Output template

After the script succeeds, reply with this exact shape so the trace is greppable:

```
✓ Estimate for Phase <N> step <M>:
  Baseline: <baseline_h> h    With AI: <with_ai_h> h
  Type: <type> (×<type_multiplier>)
  Size: <size> (<size_hours> h)
  Unknowns: <unknowns> (×<unknowns_multiplier>)
  Confidence: <high|medium|low>
  Rationale: <subagent's rationale verbatim>
```

## What you must not do

- Do not invent estimates yourself — always spawn the subagent. The kit's value here is _consistency_, and consistency requires every estimate to flow through the same rubric application.
- Do not edit `.claude/plan-data.json`'s `h_baseline` / `h_ai` directly. `tools/estimate.py` is the writer.
- Do not skip step 2 (error handling). If the subagent returns `error: "split into two steps..."`, the answer is to split, not to coerce.
- Do not run `/estimate` on a step that already has a logged actual unless the user explicitly asks to re-estimate — the original estimate is the calibration reference for that actual.
- Do not adjust `with_ai_h` for parallel-agent fan-out yourself. The rubric does not down-adjust for parallelism by design; the parallelism premium surfaces in the Actual vs With-AI Difference column.
