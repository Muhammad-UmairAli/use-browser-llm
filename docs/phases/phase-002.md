# Phase 2 — hook-reliability-hardening

**Date opened:** 2026-07-08
**Status:** CLOSED

## Scope

Closes three documented Phase 1 Scope Deltas gaps on the already-shipped
`use-browser-llm` hook: generation-phase crash/watchdog coverage
(`generate()`/`streamGenerate()` previously hung forever on a worker
crash or silent OOM-kill mid-generation), a real-browser test proving
Comlink's `proxy()` callback-marshaling mechanism actually works over a
genuine `postMessage` boundary, and a `statusRef` render-safety fix for
React 18 concurrent-mode correctness. Hardening/testing only — no new
public API surface.

## Deliverables

- [x] Mergeable PR(s) closing the linked GitHub Issue(s) — PR #26 (Closes #25), PR #28 (Closes #27), PR #30 (Closes #29)
- [x] TIME-LOG.md rows logged for each substantive step (via /log-time)
- [x] DASHBOARD.html updated with rows for every step (auto via /log-time)
- [x] Closure log appended below at phase close

## Plan

- P2-01 — Generation-phase crash/watchdog coverage (`.claude/epics/hook-reliability-hardening/001.md`)
- P2-02 — Real-browser Comlink-proxy integration test (`.claude/epics/hook-reliability-hardening/002.md`)
- P2-03 — statusRef render-safety fix (`.claude/epics/hook-reliability-hardening/003.md`)

Executed sequentially (`--full-auto`, no `--parallel`) per task 001/003
conflicting on `src/use-browser-llm.ts`.

## Closure log

**Date closed:** 2026-07-08

**Issues/PRs:**

- #25 / PR #26 — Generation-phase crash/watchdog coverage. Merged to `develop`. A blocking code-review finding (the stream watchdog's `controller.abort()` was gated behind the same client-identity check as its terminate/dispatch side effects, so a `modelId` change mid-stream could leave a suspended generator hung forever) was fixed and locked in with a dedicated regression test before merge.
- #27 / PR #28 — Real-browser Comlink-proxy integration test. Merged to `develop`. Surfaced a genuine finding (not a src bug): a `Comlink.proxy()`-wrapped callback invoked back-to-back with no yield between calls silently drops all but the last invocation. Production's `streamGenerate` is unaffected (its `for await` loop naturally yields); `loadModel`'s `onProgress` delivery under `MLCEngine`'s internal call cadence is unverified and deferred to `SPLIT-PLAN §6 (backlog)`.
- #29 / PR #30 — statusRef render-safety fix. Merged to `develop`. Pure internal fix (render-body write → `useLayoutEffect`), no behavioral change under this test suite; traced every internal status-changing path and confirmed no stale-read regression.

**What shipped:** all three Scope Deltas gaps from Phase 1's `epic.md` are closed. `pnpm lint && pnpm typecheck && pnpm build && pnpm test` green after every task; `pnpm test:integration` green (2/2, including the new Comlink-proxy test) after task 002; 55 unit tests total (up from 47 at Phase 1 close), zero regressions.

**Files NOT touched:** `src/engine-api.ts`, `src/engine-client.ts`, `src/worker.ts`, `src/detect-webgpu.ts`, `src/types.ts`, `src/errors.ts`, `src/index.ts`, `package.json`, `README.md`, `.github/workflows/*.yml` — none of this phase's three tasks required changes outside `src/to-async-generator.ts`, `src/use-browser-llm.ts`, `test/use-browser-llm.test.ts`, and the new `test/integration/` files.

**Sanity checks:** each task's code-review pass (`voltagent-qa-sec:code-reviewer`) completed with all blocking findings resolved before its PR; every new test verified to demonstrably fail without its corresponding fix (P2-01: 6 tests confirmed failing pre-fix by temporarily reverting `src/use-browser-llm.ts`/`src/to-async-generator.ts`; P2-02: the message-drop confirmed reproducible by temporarily removing the `await`). CI green on the pull_request-triggered run for all three PRs (the push-triggered run failing/being superseded is this repo's established, expected pattern).

**Diagrams:** `docs/architecture-diagrams.md`'s Worker+Comlink RPC boundary section is current — P2-01 and P2-02 both marked `(built)`. P2-03 added no diagram entry (pure internal implementation fix, no system component changed).

**Actuals vs. estimate:** epic estimated 1.76 h (with-AI) across the three tasks. Actual: P2-01 0.7996 h (est 1.20), P2-02 0.0725 h (est 0.26), P2-03 0.0499 h (est 0.30) — 0.922 h total, ~52% of estimate. Plus 0.05 h for the phase-open step. See `TIME-LOG.md` Phase 2 rows.

**What this unblocks:** Phase 1's `epic.md` Scope Deltas backlog is now fully closed. No follow-on phase is queued; `SPLIT-PLAN §6 (backlog)` carries four deferred advisory items from this phase's code reviews (stream-watchdog cadence, `toAsyncGenerator` pre-aborted-signal handling, direct `AbortSignal` unit tests, and the `onProgress` delivery-reliability open question) for whoever picks them up next.
