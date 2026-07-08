---
name: hook-reliability-hardening
status: backlog
created: 2026-07-08T07:54:39Z
updated: 2026-07-08T07:54:39Z
progress: 0%
prd: .claude/prds/hook-reliability-hardening.md
github: (will be set on sync)
---

# Epic: hook-reliability-hardening

## Overview

Close three documented Phase 1 Scope Deltas gaps: generation-phase crash/watchdog coverage, a real-browser Comlink-proxy integration test, and a `statusRef` render-safety fix. All three are hardening/testing work on the existing, already-shipped `use-browser-llm` hook — no new public API surface beyond more reliably surfacing `WorkerCrashError`.

## Architecture Decisions

- **Reuse `EngineClient.onCrash()` for generation, don't build a second crash-detection mechanism.** It's a worker-lifecycle listener (subscribes to the worker's `error`/`messageerror` events), not a load-phase-specific concept — wiring it into `generate()`/`streamGenerate()` is a direct extension, not new infrastructure.
- **Different timeout shapes for `generate()` vs `streamGenerate()`.** `generate()` has no intermediate signal (no callback fires until the whole call resolves), so it gets a flat, longer, configurable timeout. `streamGenerate()` has a token callback firing per chunk, so it gets a reset-on-activity watchdog — the same shape as the existing load-phase watchdog, just keyed on token events instead of progress events.
- **The new Comlink-proxy integration test uses a dedicated minimal test-fixture worker, not the real `MLCEngine`.** Testing `Comlink.proxy()`'s callback-marshaling mechanism doesn't require touching WebGPU or `@mlc-ai/web-llm` at all — a toy worker exposing one proxied-callback method is a faithful, fast, dependency-free way to prove the mechanism genuinely works over a real `postMessage` boundary. This keeps the new test in the same `pnpm test:integration` / `@vitest/browser` + Playwright setup as the existing `checkCache()` test.
- **`useLayoutEffect`, not `useSyncExternalStore`, for the `statusRef` fix.** `useSyncExternalStore` is designed for external stores with real subscribers; `statusRef` is a single internal ref read only by three stable `useCallback`-wrapped functions. `useLayoutEffect` is the minimal fix that guarantees the ref is only ever written from a committed render pass, at negligible cost (one-line change, no behavioral or API surface change).

## Technical Approach

### Frontend Components

N/A — no UI components (headless hook, unchanged from Phase 1's out-of-scope boundary).

### Backend Services

N/A — no backend. All changes are client-side (the hook, the worker, and a new test-only worker fixture).

### Infrastructure

- New test-fixture worker file (e.g. `test/integration/fixtures/echo-worker.ts`) built/served the same way as the real `worker.ts` for the purposes of the Playwright-driven test — no changes to the package's own `tsup` build or public `exports`.
- No CI workflow changes expected beyond the existing `test:integration` job already picking up the new test file (same `test/integration/**/*.browser.test.ts` glob from `vitest.browser.config.ts`).

## Implementation Strategy

Three tasks, two of which touch the same file (`src/use-browser-llm.ts`) and are sequenced to avoid conflicts; the third (integration test) is independent and can run in parallel with the first.

## Task Breakdown Preview

- 001 — Generation-phase crash/watchdog coverage (`generate()` timeout + `onCrash()`; `streamGenerate()` per-token watchdog + `onCrash()`)
- 002 — Real-browser Comlink-proxy integration test (new test-fixture worker + test)
- 003 — `statusRef` render-safety fix (`useLayoutEffect`)

Total: 3 tasks.

## Dependencies

- Phase 1's `EngineClient.onCrash()`, `src/to-async-generator.ts`, and `src/use-browser-llm.ts` (all already shipped, unchanged as dependencies — this phase extends them).
- No dependency on other in-repo epics.

## Success Criteria (Technical)

- New tests for generation-phase crash/timeout (mocked-engine, no browser needed) pass and demonstrably fail without the fix (verified during task review, not just written).
- New real-browser Comlink-proxy test passes in CI under the existing non-required `Worker boundary integration test` job.
- `pnpm lint && pnpm typecheck && pnpm build && pnpm test` all green after each task; no regression in the existing 47-test suite.
- `statusRef`'s render-body write is fully removed, replaced by `useLayoutEffect`.

## Estimated Effort

| Task | Title | With-AI h |
|---|---|---|
| 001 | Generation-phase crash/watchdog coverage | 1.20 |
| 002 | Real-browser Comlink-proxy integration test | 0.26 |
| 003 | statusRef render-safety fix | 0.30 |

**Total with-AI estimate: 1.76 h** (baseline sum: 5.30 h).

## Tasks Created
- [ ] 001.md - Generation-phase crash/watchdog coverage (parallel: true)
- [ ] 002.md - Real-browser Comlink-proxy integration test (parallel: true)
- [ ] 003.md - statusRef render-safety fix (parallel: true)

Total tasks: 3
Parallel tasks: 3 (001 and 003 conflict on `src/use-browser-llm.ts` — not run concurrently despite both being individually parallel-eligible)
Sequential tasks: 0
Estimated total effort: 1.76 h (with-AI) / 5.30 h (baseline)
