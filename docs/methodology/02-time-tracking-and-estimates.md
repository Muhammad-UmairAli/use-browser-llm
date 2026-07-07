# 02 — Time tracking and estimates

Three representations, one source of truth. `.claude/time-log.json` and `.claude/plan-data.json` are the **canonical data** (written only by `tools/log-time.py`, `tools/estimate.py`, and friends); the matching `.claude/*.js` files are **generated views** the dashboard loads over `file://`; `TIME-LOG.md` is the **human-readable audit trail** (append-only, not parsed by any tool). The system gives you per-step estimate-vs-actual variance with a hover tooltip showing _why_ a step came in over or under — so anyone reviewing pace can see the reason, not just the number.

## The data files — source of truth

`.claude/time-log.json` holds one entry per logged step (datetime, phase, step, hours, who, notes); `.claude/plan-data.json` holds per-phase step lists with `h_baseline` / `h_ai` estimates and completion dates. Both are written atomically and only via the kit's tools — never edit them (or their generated `.js` views) by hand. `tools/render-check.py` verifies each `.js` view matches its `.json` source.

**Claude is the sole writer.** The developer never edits the data files or `TIME-LOG.md` directly. Two paths get entries in:

1. **Claude completed the step** — when the AI finishes a step (work landed via PR or otherwise complete), it runs `/log-time`, which records real elapsed time from the `/start-task` timer (or the summed agent durations) rather than a guess.
2. **Developer did the step** — work the AI couldn't perform (meetings, manual environment setup, stakeholder conversations). Developer says "I did Phase Nx step M for Y hours" and the AI runs `/log-time` with those hours.

Why sole-writer? Keeps the format consistent, removes the developer's context-switching cost, and gives the AI a structured place to record what it did.

## `DASHBOARD.html` — the render layer

A single self-contained HTML page. On load it pulls `.claude/plan-data.js` (estimates, phase labels, completion dates) and `.claude/time-log.js` (actuals), then renders per-step Estimate / Actual / Difference cells, phase subtotals, and buffered totals. The Difference column's hover tooltips come from each entry's Notes field, so the _why_ is one hover away. The `.js` wrapper exists because browsers block `fetch()` on `file://` — a `<script src>` works everywhere with zero dependencies.

## Estimating: the rubric

The Baseline and With-AI columns mean different things; they should carry different numbers. _Baseline_ is what a senior dev typing every line, without an AI pair-programmer, would honestly take. _With AI_ is the same dev with the AI helping. The point of having both is that the gap between them — visible on every step row, summed at the phase subtotal, totalled at the grand-total — is the kit's own running case study of where AI assistance pays off and where it doesn't.

To keep the two numbers consistent across estimators, the kit ships a rubric. Pick **one task type**, **one size**, **one unknowns band**, then apply the formula. `/estimate` (see below) is the canonical way to invoke it — it spawns the `task-estimator` subagent which encodes the rubric verbatim and writes both columns to `DASHBOARD.html`.

### Task type — the With-AI / Baseline ratio

The multiplier captures how much of the work the AI can take over honestly. Documentation drafts and boilerplate scaffolds collapse to a fraction of baseline; system architecture and stakeholder reviews don't.

| Task type                                                        | Multiplier | Why                                                   |
| ---------------------------------------------------------------- | ---------: | ----------------------------------------------------- |
| Boilerplate / scaffolding (configs, templates, mechanical files) |       0.10 | AI generates these end-to-end with light review       |
| Test writing (unit, integration scaffolds)                       |       0.20 | Drafting test cases is one of AI's strongest plays    |
| Documentation (READMEs, runbooks, methodology)                   |       0.25 | Prose drafting is mostly editor-mode work             |
| Refactoring with a clear goal                                    |       0.30 | Mechanical; AI executes, human verifies pattern       |
| Feature implementation (new endpoints, components, flows)        |       0.40 | Real speedup but still warrants careful review        |
| Code review / QA                                                 |       0.40 | AI catches patterns fast; human still verifies        |
| DevOps / deploy scripts                                          |       0.50 | Trial-and-error against real cloud state remains slow |
| Debugging (deep root-cause work)                                 |       0.50 | AI helps narrow; human verifies the fix               |
| Architecture / system design                                     |       0.60 | Human judgment is the bottleneck                      |
| Validation against real data / business reports                  |       0.70 | Mostly inspection; AI assists at the margins          |
| Stakeholder review / meeting / conversation                      |       1.00 | No AI substitute                                      |

### Size — Baseline hours before adjustment

The "size" picker is intentionally a small fixed ladder. If a task spans two sizes, split it into separate steps before estimating.

| Size        | Baseline (h) | Heuristic                                            |
| ----------- | -----------: | ---------------------------------------------------- |
| Trivial     |         0.25 | A typo fix; renaming a variable; updating a doc link |
| Small       |         1.00 | One file, one concept, no integration concerns       |
| Medium      |         3.00 | A handful of files, one subsystem, mostly known      |
| Large       |         8.00 | Cross-cutting; multiple subsystems; some new ground  |
| Extra-large |        16.00 | A whole feature with novelty; consider splitting     |

### Unknowns — Baseline multiplier

| Unknowns                                        | Multiplier |
| ----------------------------------------------- | ---------: |
| Well-known mechanical work                      |        1.0 |
| Some uncertainty (new library / unfamiliar API) |        1.3 |
| Novel work or first-time integration            |        1.7 |

### Formula

```
baseline_h = size_h × unknowns_multiplier
with_ai_h  = baseline_h × type_multiplier
```

### Worked example

> "Integrate 11 new theme CSS blocks into the dashboard and replace the dark/light toggle with a picker dropdown."

- **Type**: Feature implementation → `0.40`
- **Size**: Medium (multiple files, one subsystem) → `3.00`
- **Unknowns**: Well-known (we have an existing toggle to follow) → `1.0`
- `baseline_h = 3.00 × 1.0 = 3.00`
- `with_ai_h  = 3.00 × 0.40 = 1.20`

Result: Baseline **3.00 h**, With AI **1.20 h**. Adopters typing `/log-time` with the actual will then see whether reality bent the With-AI estimate.

### One caveat — parallel agent fan-out

The rubric assumes a single dev with one AI pair-programmer. When the kit fans out 11 parallel agents on the same logical work, wall-clock With-AI hours can come in dramatically under the rubric's prediction (each agent runs concurrently, only the slowest matters for elapsed time). Cumulative AI-hours still match the rubric — the contrast just shifts from "AI is fast" to "parallel AI is faster than sequential AI."

When `/estimate` detects a step's description mentions "parallel" / "in parallel" / "fan-out", it notes this in the rationale and **does not** auto-adjust — adopters should still log the wall-clock actual and let the Difference column expose the parallelism premium.

## Step ids — the contract `/estimate`, `/start-task`, and `/log-time` all share

All three tools key on the `<step>` argument **verbatim** and match it against the step `num` values in `.claude/plan-data.json`. The step id must therefore be the **exact `num` of an existing row** — whatever id `/open-phase` decomposition wrote, typically `P{phase}-{NN}` (e.g. `P1-06`) for a numbered phase. The Phase 0 bootstrap steps are the only bare integers; every Phase ≥ 1 step is `P{phase}-{NN}`.

Passing a **bare number** (`6`, `06`) when the canonical id is `P1-06` does NOT update `P1-06` — it silently appends a **new, orphan row**, leaving the real step with no actual and a duplicate at the bottom of the table.

Guardrail (`tools/_data_js.py` `guard_step_id`, wired into all three tools): a bare number that shadows an existing `P{phase}-NN` row is **refused with exit 2**, printing the canonical id and the valid step ids. Genuinely new step ids are allowed (with a NOTE). So:

- ✅ `/log-time 1 P1-06 3 "…"` — updates the real row.
- ❌ `/log-time 1 06 3 "…"` — refused; re-run with `P1-06`.
- ✅ `/estimate 1 P1-18 "new step added mid-phase"` — allowed (new id, NOTE printed).

Projects that use a different step-id scheme only ever hit the NOTE path — the guard refuses only the specific bare-number-shadows-`P{phase}-NN` mistake.

## Wall-clock timer — measuring real elapsed time

The kit ships two tools that work together to record actual elapsed time instead of guessed estimates:

### `/start-task` — start the clock

```
/start-task <phase> <step> "<description>"
```

Backed by `tools/start-task.py`. Call this at the very beginning of each task (before any code is written). It:

1. Writes a UTC start timestamp to `.claude/task-timer.json` under the key `"<phase>-<step>"`. The file is a JSON dict so multiple tasks can run in parallel without clobbering each other.

### `/log-time` — stop the clock

```
/log-time <phase> <step> <hours> "<notes>"
```

Call this after the task's PR is merged. When a matching timer key exists in `.claude/task-timer.json`:

1. Calculates `elapsed = now − started_at` in hours, capped at 8 h.
2. Deletes the timer key (parallel-task-safe write-back).
3. Uses `<hours>` (the estimate you pass in) as the **baseline + With-AI estimate** in `.claude/plan-data.json`, so the baseline-vs-actual comparison remains meaningful.
4. Writes `elapsed` as the **actual hours** in `.claude/time-log.json` and appends a row to `TIME-LOG.md`.

If no timer key exists (e.g., `/start-task` was never called), `/log-time` falls back to using `<hours>` as both estimate and actual — the pre-timer behavior.

## The post-phase render check

After every phase that landed `TIME-LOG.md` rows, before claiming the phase done, **every cell on the closed phase's row must render a value, not `—`.** The kit ships `tools/render-check.sh` to verify. Six things to check on the closed phase:

1. **Per-step Actual cells** show logged hours for every step that has a `TIME-LOG.md` row. Steps the phase intentionally skipped stay `—` and are called out in the `SPLIT-PLAN §5 (progress log)` row's "files NOT touched" / "step X not logged" notes.
2. **Per-step Difference cells** show `±N.NN` color-coded.
3. **Phase subtotal Actual** matches `sum(per-step actuals)`.
4. **Phase subtotal Difference** is the sum of per-step diffs.
5. **Phase buffered-total Actual** equals subtotal Actual (buffer is for estimates).
6. **Phase buffered-total Difference** is `actual − buffered` — different from subtotal Difference whenever the buffer is non-zero.

If any cells are still `—`, the cause is one of:

- The step has no entry in `.claude/time-log.json` (run `/log-time` for that step).
- The step's `num` in `plan-data.json` doesn't match the key used in the time-log entry.
- A bug in `buildActualsFromTimeLog`'s phase-key extraction for unusual phase codes.

Diagnose before declaring the phase done. Don't merge a phase PR with `—` cells unless the row's "files NOT touched" notes explain why.

## Phase 0 — the kit's own self-test

`tools/init-project.sh` performs 16 timed bootstrap steps when an adopter initializes a project, writes all of them in one batch to `.claude/time-log.json`, `.claude/plan-data.json`, and `TIME-LOG.md`, marks Phase 0 complete, and runs `render-check.sh` against Phase 0. The adopter opens `DASHBOARD.html` and immediately sees populated cells, color-coded variance, and tooltips — proving end-to-end that the rendering pipeline is wired up before phase 1 starts.

If Phase 0 renders correctly, every subsequent phase will. If it doesn't, the kit was misconfigured and the adopter knows in 30 seconds.

## Format

See the header in `templates/TIME-LOG.md` for the canonical column list and a sample row. Multiple rows for the same `(Phase, Step)` accumulate via sum.
