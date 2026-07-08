---
name: hook-reliability-hardening
description: Close three documented reliability/coverage gaps left open from Phase 1 of use-browser-llm
status: backlog
created: 2026-07-08T07:54:39Z
---

# PRD: hook-reliability-hardening

## Executive Summary

Phase 1 shipped `use-browser-llm` v0.1.0 with a working load-time crash/watchdog mechanism and a real-browser worker-boundary integration test, but left three gaps explicitly documented in `.claude/epics/use-local-llm/epic.md`'s Scope Deltas. This phase closes all three: crash/watchdog coverage during generation (not just loading), a real-browser integration test that actually exercises Comlink's callback-proxy path, and a render-safety fix for `statusRef`.

## Problem Statement

1. A worker crash or silent browser OOM-kill during `generate()`/`streamGenerate()` currently hangs forever — the hook's crash/watchdog protection only covers the model-loading phase. A user mid-generation with a crashed worker sees `isGenerating: true` forever, no error, no recovery.
2. The one real-browser integration test (`checkCache()`) proves the worker spawns and a plain scalar call round-trips — it does not exercise `Comlink.proxy()`, the mechanism `loadModel`'s progress callback and `streamGenerate`'s token callback actually depend on in production. That's the highest-risk, least-tested part of the whole worker boundary.
3. `statusRef.current = state.status` is mirrored directly in the hook's render body rather than a concurrent-render-safe location, which is a low-severity but real theoretical gap under React 18 concurrent features.

## User Stories

- As a developer using `streamGenerate()`, if the worker crashes or the browser silently kills it mid-stream, I want the `for await` loop to throw a typed error so my UI can recover, instead of hanging forever.
  - Acceptance: a worker crash during `generate()` or `streamGenerate()` surfaces `WorkerCrashError` via `generationError` (and, for `streamGenerate`, as a thrown error from the async generator) within a bounded time, and `isGenerating` returns to `false`.
- As a maintainer, I want CI to prove the worker boundary's callback-proxying mechanism genuinely works in a real browser, not just that a worker spawns and a plain value round-trips.
  - Acceptance: a new real-browser integration test exercises a `Comlink.proxy()`-wrapped callback firing multiple times before its owning call resolves, over a genuine `postMessage` boundary.
- As a maintainer, I want `statusRef` to be updated in a way that can't theoretically be written by a discarded/prerendered render pass under React 18 concurrent features.
  - Acceptance: `statusRef.current` is only ever written from a committed render (`useLayoutEffect`), never directly in the render body.

## Functional Requirements

- `generate()`: on a worker crash (via the existing `onCrash()` listener) during an in-flight call, reject with `WorkerCrashError` and clear `isGenerating`.
- `generate()`: on no resolution within a configurable timeout (default conservative, e.g. 60–120s), treat as a silent hang, terminate the client, and reject with `WorkerCrashError`.
- `streamGenerate()`: same `onCrash()` wiring as `generate()`, applied within the async generator's lifecycle (subscribe on entry, unsubscribe in `finally`).
- `streamGenerate()`: an inactivity watchdog reset on every `onToken` call (mirroring the load-phase watchdog's reset-on-progress pattern), not just on the outer promise settling.
- New real-browser integration test exercising a `Comlink.proxy()`-wrapped callback via a minimal dedicated test fixture worker (not the real `MLCEngine`/WebGPU path) — asserts the callback fires the expected number of times, in order, before the owning call resolves.
- `statusRef.current = state.status` moved from the render body into a `useLayoutEffect`.

## Non-Functional Requirements

- **Confirmed technical approach (per Phase 2 approach review):** reuse `EngineClient.onCrash()` for both `generate()`/`streamGenerate()` crash detection; a flat, longer, configurable timeout for `generate()` (no intermediate signal available) vs. a per-token-reset watchdog for `streamGenerate()` (mirrors the load-phase pattern); a new minimal `EngineAPI`-shaped test-fixture worker for the Comlink-proxy integration test, run under the existing `pnpm test:integration` / `@vitest/browser` + Playwright setup; `useLayoutEffect` (not `useSyncExternalStore`) for the `statusRef` fix.
- No new runtime dependencies. Same stack as Phase 1 (React 18+, TypeScript, tsup, Vitest, `@vitest/browser` + Playwright).
- No changes to the public API surface's shape beyond what's needed to surface the new crash/timeout errors (still `WorkerCrashError`, already exported).

## Success Criteria

- A simulated worker crash during `generate()`/`streamGenerate()` (via a mocked `onCrash()` listener in the existing mocked-engine test suite) surfaces `WorkerCrashError` and clears `isGenerating`, with a dedicated regression test for each.
- The new real-browser Comlink-proxy integration test passes in CI (same non-required job as the existing `checkCache()` test).
- `statusRef`'s render-body write is gone; `pnpm test` suite (currently 47 tests) still passes with the reducer/effect behavior otherwise unchanged.
- No regression in the existing 47-test mocked suite or the existing `checkCache()` integration test.

## Constraints & Assumptions

- Assumes the existing `EngineClient.onCrash()` mechanism (from Phase 1) is the right primitive to reuse — no new crash-detection mechanism is being built, only wired into more call sites.
- Assumes a configurable-but-defaulted timeout for `generate()` is acceptable UX (no way to give a stronger signal than "took too long" for a single non-streaming call with no intermediate progress).
- This environment has no WebGPU-capable browser, so real end-to-end generation still can't be tested against the actual `MLCEngine` — the new integration test fixture is deliberately engine-agnostic (a toy worker, not the real one) specifically so it can be verified without that dependency.

## Out of Scope

- A pluggable multi-engine adapter (transformers.js, etc.) — unrelated to this phase, not revisited.
- Any change to the public hook's return shape beyond surfacing existing error types more reliably.
- Making the new timeout values user-configurable via the public hook API in this phase (may default to a hardcoded, documented constant, matching the load-watchdog's existing pattern, unless a task finds it trivial to expose as an option).

## Dependencies

- `src/engine-client.ts`'s existing `onCrash()` method (Phase 1, unchanged).
- `src/to-async-generator.ts`'s existing callback→AsyncGenerator bridge (Phase 1, unchanged) — the `streamGenerate()` watchdog wiring extends around it, not into it.
- No dependency on other in-repo phases beyond Phase 1 (already shipped).
