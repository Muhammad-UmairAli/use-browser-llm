# Phase 1 — browser-local-llm-hook

**Date opened:** 2026-07-07
**Status:** CLOSED

## Scope

Build the `use-local-llm` npm package: a headless React hook (`useLocalLLM`)
that runs LLMs locally in the browser via WebGPU, using `@mlc-ai/web-llm`
inside a dedicated Web Worker wrapped with Comlink. Covers model-loading
state, generation (single-call and streaming) with cancellation, the
unsupported-browser fallback path, cache-status exposure, test
completeness, usage docs, and npm-publish readiness. See
`.claude/prds/use-local-llm.md` and `.claude/epics/use-local-llm/epic.md`
for the full PRD/epic. Per SPLIT-PLAN §1 (goals).

## Deliverables

- [x] Mergeable PR(s) closing the linked GitHub Issue(s) — 10 task PRs
      (#2, #4, #6, #8, #10, #12, #14, #16, #19, #21) plus one unlinked
      chore PR (#17, repo rename) and one closure-only PR for this
      phase-close commit, all merged to `develop`
- [x] TIME-LOG.md rows logged for each substantive step (via /log-time)
- [x] DASHBOARD.html updated with rows for every step (auto via
      /log-time; DASHBOARD.html itself is gitignored per an explicit
      project decision to keep internal time/estimate tracking local-only
      for this open-source repo — see `.gitignore`)
- [x] Closure log appended below at phase close

## Plan

10 CCPM tasks (`.claude/epics/use-local-llm/001.md`–`010.md`), decomposed
from the epic, executed sequentially in `--full-auto` mode (confirmed
recommendation: N=10, P=1, D=6, no unknowns/risk flags at decomposition
time). One unplanned chore (GitHub repo rename to match the npm package
name) was inserted between tasks 007 and 008 at the user's request.

| Task | Title                                                            | Step id         | Issue | PR  |
| ---- | ---------------------------------------------------------------- | --------------- | ----- | --- |
| 001  | Package scaffolding & build tooling                              | P1-01           | #1    | #2  |
| 002  | WebGPU capability detection utility                              | P1-02           | #3    | #4  |
| 003  | Web Worker wrapping @mlc-ai/web-llm via Comlink                  | P1-03           | #5    | #6  |
| 004  | Hook state machine for model loading                             | P1-04           | #7    | #8  |
| 005  | Hook generate/streamGenerate API + cancellation                  | P1-05           | #9    | #10 |
| 007  | Error handling & unsupported-browser fallback path               | P1-07           | #11   | #12 |
| —    | chore: rename repo to use-local-llm                              | P1-chore-rename | none  | #17 |
| 006  | Cache-status exposure                                            | P1-06           | #13   | #14 |
| 009  | README + usage docs                                              | P1-09           | #15   | #16 |
| 008  | Unit tests (mocked engine) + worker-boundary integration harness | P1-08           | #18   | #19 |
| 010  | Public API polish, type exports & npm publish config/CI          | P1-10           | #20   | #21 |

(Task order above reflects actual execution order, not the numeric task
ID order — 007 ran before 006 since both 006 and 007 became eligible at
the same time and 007 was chosen first; the repo-rename chore was
inserted reactively when the user flagged the naming mismatch.)

## Closure log

**Date closed:** 2026-07-08

**What shipped:** the full `use-local-llm` v0.1.0 npm package —
`useLocalLLM(modelId)` hook covering model-loading state (idle → loading →
ready/error/unsupported), `generate()`/`streamGenerate()` with real
cancellation, WebGPU capability detection, worker-crash + load-inactivity-
watchdog error handling, IndexedDB cache-status exposure, a 47-test mocked
suite plus a real-browser Worker+Comlink integration test, full usage
docs, and a tag-gated publish CI workflow. Package builds ESM-only (revised
from the original dual-ESM/CJS plan — see epic.md Scope Deltas), with the
worker chunk verifiably isolated from the main bundle (confirmed via a
real throwaway Vite consumer project in P1-10, now also a permanent CI
guard).

**Architecture deviations from the original plan** (all reviewed,
confirmed sound, and documented in `.claude/epics/use-local-llm/epic.md`'s
Scope Deltas section — not repeated here in full):

- Dropped Comlink-over-`WebWorkerMLCEngine` in favor of Comlink-over-bare-`MLCEngine`, since web-llm's own worker layer would have doubled up with Comlink (P1-03).
- ESM-only instead of dual ESM/CJS, since `@mlc-ai/web-llm` is ESM-first (P1-01).
- Added a `HookBusyError` re-entrancy guard, a `"fallback-adapter"` WebGPU-unsupported reason, and a 30s load-inactivity watchdog — each beyond a task's literal AC but required for correctness, each reviewed.
- Public `generate()`/`streamGenerate()` take a self-contained `ChatMessage` type, not a re-export of web-llm's own message type (P1-10).

**Files NOT touched this phase:** `.editorconfig`, `.gitattributes`,
`.pre-commit-config.yaml`, `docs/methodology/*`, `docs/conventions/*`,
`docs/observability.md`, `TODO.md`, `SPLIT-PLAN.md`'s §3/§4 (only §5 the
progress log is touched by phase close) — all kit-bootstrap files from
Phase 0, unrelated to this phase's product work.

**Sanity checks:**

- `pnpm lint && pnpm typecheck && pnpm build && pnpm test` — all pass, 47/47 tests, on `develop` HEAD after every merge.
- `pnpm test:integration` — real headless-Chromium Worker+Comlink round-trip, passing in CI.
- `./tools/render-check.sh 1` — OK, all 12 logged Phase 1 steps have actuals.
- `npm pack --dry-run` — exactly `dist/`, `README.md`, `LICENSE`, `package.json` (8.3kB).
- Every PR passed CI (`Lint, typecheck & test`, `Pre-commit hooks`, and — from P1-08 onward — `Worker boundary integration test`) before merge.

**Diagrams:** `docs/architecture-diagrams.md`'s "use-local-llm: Worker +
Comlink RPC boundary" diagram is current as of P1-10 — the `hook` node's
annotation was updated after every task that changed `useLocalLLM`'s
surface, and a final "Phase 1 complete" note was added marking the public
API polish-frozen.

**Time — estimate vs. actual (with an important caveat):**

|                               | Baseline | With-AI estimate | Actual (logged) |
| ----------------------------- | -------- | ---------------- | --------------- |
| Total (11 steps, incl. chore) | 80.90 h  | 29.29 h          | 9.96 h          |

The actual figure is **not directly comparable** to the estimates:
`/log-time` measures wall-clock time between `/start-task` and `/log-time`
calls, and this phase spanned a session pause overnight (P1-10's task
timer was left running across that gap and hit the tool's 8h cap on
resume — 8 of the 9.96 total actual hours are that one artifact-inflated
entry, not real active work). Excluding that entry, the other 10 steps
sum to **1.96 h** of measured wall-clock time — itself an undercount of
total effort, since it doesn't capture agent "thinking"/tool-call time
within a single start/log window consistently across steps. Treat the
with-AI estimate column as the more reliable planning artifact for this
phase; the actual-hours column needs a human to sanity-check before being
relied on for calibration.

**What this unblocks:** `use-local-llm` v0.1.0 is feature-complete and
publish-ready pending two manual steps outside this phase's scope: (1) a
maintainer adding an `NPM_TOKEN` repo secret before `publish.yml` can
actually publish, and (2) live-browser verification of the README
examples and real model generation (documented as a known gap in P1-09
and P1-08's Scope Deltas — this environment has no WebGPU-capable
browser to download and run a real model end-to-end). No Phase 2 has been
opened yet.
