---
name: use-local-llm
status: backlog
created: 2026-07-07T11:47:41Z
updated: 2026-07-07T11:47:41Z
progress: 0%
prd: .claude/prds/use-local-llm.md
github: (will be set on sync)
---

# Epic: use-local-llm

## Overview

Ship `useLocalLLM()` — a single headless React hook that wraps `@mlc-ai/web-llm` running inside a dedicated Web Worker, exposing model-loading state, download progress, and generate/stream methods without ever surfacing worker or engine internals to the consumer.

## Architecture Decisions

- **Engine**: `@mlc-ai/web-llm`'s `WebWorkerMLCEngine` pattern — chosen over `transformers.js` because it ships a worker-ready engine split already built for this exact use case, minimizing custom worker-lifecycle code for Phase 1 (Stack A from the technology-stack review).
- **Worker RPC**: `comlink` proxies the engine's async API across the `postMessage` boundary instead of a hand-rolled message protocol — removes message-typing/correlation boilerplate at the cost of one small dependency.
- **Build**: `tsup` producing an **ESM-only** output for the main entry plus a separate worker bundle chunk, so the worker code is never pulled into the consumer's main-thread bundle. (Revised from dual ESM/CJS during P1-01 review: `@mlc-ai/web-llm` is ESM-first, so a CJS build would throw `ERR_REQUIRE_ESM` for CJS consumers; ESM-only is also the natural fit for a browser/WebGPU-only package with no CJS-consumer obligation.) The worker file ships as a `dist/` asset, not as a public `exports` subpath — it's loaded internally via `new URL('./worker.js', import.meta.url)`, the pattern bundlers actually resolve worker chunks through.
- **Two `tsconfig` files**: `tsconfig.json` (DOM lib) typechecks the main-thread entry, `tsconfig.worker.json` (WebWorker lib) typechecks the worker entry — TypeScript's `dom` and `webworker` libs declare conflicting globals and cannot share one config.
- **License: MIT.**
- **Public API stays engine-agnostic in naming/shape** (e.g. no `web-llm`-specific types leak into the hook's return value) so a future pluggable-adapter epic (transformers.js, etc.) is additive, not a breaking change. That adapter abstraction itself is explicitly deferred out of this epic.
- **Testing**: Vitest with a mocked-engine path for the hook's state machine (runs in CI without a GPU); a browser/Playwright-driven path is reserved for manual/real-WebGPU smoke testing, not CI-blocking for Phase 1.

## Technical Approach

### Frontend Components

N/A — this package ships no UI components by design (headless, hooks-only). The only "frontend" surface is the `useLocalLLM()` hook itself and its TypeScript types.

### Backend Services

N/A — no backend. All inference is client-side; the only network activity is the browser downloading model weights from the engine's default CDN (or a developer-supplied source).

### Infrastructure

- npm package scaffold: `package.json` with dual ESM/CJS `exports` map, a separate `./worker` (or inlined-but-code-split) entry for the worker bundle, `sideEffects: false` for tree-shaking.
- `tsup` build config producing `dist/index.{js,cjs,d.ts}` and `dist/worker.{js,d.ts}`.
- CI: lint + typecheck + Vitest unit suite on every PR; npm publish workflow gated on a version tag (wired in the final task, not executed until the maintainer is ready to publish).

## Implementation Strategy

Build bottom-up: scaffolding and build tooling first (nothing else can be tested without it), then the worker boundary (engine wrapped in Comlink), then the hook's state machine on top of that worker boundary, then capability detection and error/fallback handling layered in, then tests, docs, and publish plumbing last. This keeps every later task building on a concrete, testable artifact from the task before it rather than parallel guesswork against an unbuilt interface.

## Task Breakdown Preview

- 001 — Package scaffolding & build tooling (tsup, TS strict config, exports map)
- 002 — WebGPU capability detection utility
- 003 — Web Worker: wrap `@mlc-ai/web-llm` engine via Comlink
- 004 — Hook state machine: model loading (`idle`/`loading`/`ready`/`error`/`unsupported`) + progress
- 005 — Hook generate/streamGenerate API + cancellation
- 006 — Cache-status exposure (surface IndexedDB cache hit/miss from the engine)
- 007 — Error handling & `unsupported`-browser fallback path
- 008 — Unit tests (mocked engine) + integration test harness for the worker boundary
- 009 — README + usage docs (primary usage, cancellation, unsupported-fallback pattern)
- 010 — Public API polish, type exports, npm publish config & CI workflow

Total: 10 tasks (at the epic's ≤10-task ceiling).

## Dependencies

- `@mlc-ai/web-llm` and `comlink` npm packages (external).
- Browser WebGPU availability (external, not controlled by this project).
- No dependency on other in-repo epics — this is the first epic in the project.

## Success Criteria (Technical)

- `npm run build` produces a dual ESM/CJS bundle with a code-split worker chunk that is not included in the main entry's bundle size.
- Full Vitest suite passes in CI without requiring a real GPU (mocked-engine path).
- `useLocalLLM()` never calls engine methods on the main thread — verified by the worker-boundary integration test.
- README examples are copy-paste runnable in a fresh React 18 app.

## Estimated Effort

Sized per-task via `/estimate` (with-AI hours, the figure carried into `/log-time` as each task's estimate):

| Task | Title | With-AI h |
|---|---|---|
| 001 | Package scaffolding & build tooling | 1.04 |
| 002 | WebGPU capability detection utility | 0.52 |
| 003 | Web Worker wrapping @mlc-ai/web-llm via Comlink | 5.44 |
| 004 | Hook state machine for model loading | 1.56 |
| 005 | Hook generate/streamGenerate API + cancellation | 4.16 |
| 006 | Cache-status exposure | 1.56 |
| 007 | Error handling & unsupported-browser fallback path | 4.16 |
| 008 | Unit tests (mocked engine) + worker-boundary integration harness | 2.72 |
| 009 | README + usage docs | 0.75 |
| 010 | Public API polish, type exports & npm publish config/CI | 7.28 |

**Total with-AI estimate: 29.19 h** (baseline sum: 78.30 h).

## Tasks Created
- [ ] 001.md - Package scaffolding & build tooling (parallel: false)
- [ ] 002.md - WebGPU capability detection utility (parallel: true)
- [ ] 003.md - Web Worker wrapping @mlc-ai/web-llm via Comlink (parallel: true)
- [ ] 004.md - Hook state machine for model loading (parallel: false)
- [ ] 005.md - Hook generate/streamGenerate API + cancellation (parallel: false)
- [ ] 006.md - Cache-status exposure (parallel: true)
- [ ] 007.md - Error handling & unsupported-browser fallback path (parallel: true)
- [ ] 008.md - Unit tests (mocked engine) + worker-boundary integration harness (parallel: false)
- [ ] 009.md - README + usage docs (parallel: true)
- [ ] 010.md - Public API polish, type exports & npm publish config/CI (parallel: false)

Total tasks: 10
Parallel tasks: 5
Sequential tasks: 5
Estimated total effort: 29.19 h (with-AI) / 78.30 h (baseline)
