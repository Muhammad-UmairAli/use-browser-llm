---
name: use-local-llm
description: React hook that runs LLMs fully in-browser via WebGPU + a Web Worker, with zero backend and complete data privacy
status: backlog
created: 2026-07-07T11:47:41Z
---

# PRD: use-local-llm

## Executive Summary

`use-local-llm` is an open-source npm package that ships a single React hook, `useLocalLLM()`, letting React developers run Large Language Models entirely inside the user's browser via WebGPU. It hides the multi-gigabyte model download, IndexedDB caching, and Web Worker lifecycle management behind a small, typed, headless API — no server, no API keys, no data leaving the device.

## Problem Statement

Running an LLM locally in a browser today requires wiring together a WebGPU inference engine, a Web Worker (so generation doesn't freeze the tab), a model-download/progress pipeline, and IndexedDB-backed caching — by hand, for every project that wants this. That's hundreds of lines of infrastructure code before a developer writes a single line of product logic. There is no drop-in React primitive that collapses this into a normal `useState`-shaped hook.

## User Stories

- As a React developer building an AI feature, I want to call `useLocalLLM()` and get back `{ status, progress, error, generate, streamGenerate }` so I can wire a local model into my UI without writing any WebGPU or worker code.
  - Acceptance: calling the hook with a supported model id downloads/loads the model, reports `progress` from 0–1 during download, and transitions `status` from `idle` → `loading` → `ready`.
- As a developer targeting cost-sensitive or privacy-sensitive users, I want inference to happen fully client-side so no prompt or completion data is ever sent to a server.
  - Acceptance: the library makes no network calls at generation time — only the initial model-weight download — and the underlying inference engine runs in a dedicated Web Worker, never on the main thread.
- As a developer supporting a range of browsers, I want a clear, typed signal when the current browser/device cannot run local inference (no WebGPU) so I can show a fallback in my own UI.
  - Acceptance: on an unsupported browser, `status` resolves to an `unsupported` (or equivalent) error state with a machine-readable reason, without throwing an unhandled exception or freezing the page.
- As a developer already using Tailwind/Shadcn/any other UI system, I want zero shipped CSS or components from this package so it never fights my design system.
  - Acceptance: the package ships no `.css`, no JSX components, and no inline styles — hook-only public API.

## Functional Requirements

- `useLocalLLM(options)` hook with at minimum: selecting a model id, exposing load `status` (`idle` | `loading` | `ready` | `error` | `unsupported`), download `progress` (0–1), a typed `error`, and `generate` / `streamGenerate` methods for producing completions.
- Model inference runs inside a dedicated Web Worker; the hook's public API never requires the consumer to touch `postMessage`, worker files, or engine internals directly.
- Model weights are cached across sessions (IndexedDB, via the underlying engine) so repeat visits skip the multi-gigabyte re-download.
- WebGPU capability detection runs before attempting to load a model, surfacing a distinct `unsupported` state rather than a generic error.
- Streaming token-by-token output is supported (`streamGenerate`) in addition to a single awaited `generate` call.
- Cancellation: an in-flight generation can be aborted from the consumer.
- Public TypeScript types are shipped for every exported symbol; no `any` in the public surface.

## Non-Functional Requirements

- **Confirmed technology stack (Stack A — MLC-first + Comlink RPC):** `@mlc-ai/web-llm` as the underlying WebGPU inference engine; `comlink` for the Web Worker RPC boundary (wraps `web-llm`'s `WebWorkerMLCEngine` pattern); `tsup` (esbuild-based) for an **ESM-only** build with a separate worker output chunk; strict TypeScript with generated `.d.ts`; Vitest for unit tests (mocked-engine path for CI without a GPU) plus a browser/Playwright-driven path for real WebGPU smoke tests.
- **ESM-only, no CJS build** (revised during P1-01 code review): `@mlc-ai/web-llm` ships ESM-first, so a CJS build of this package would `require()` an ESM-only dependency and throw `ERR_REQUIRE_ESM` for CJS consumers on older Node. Browser/WebGPU-targeting packages have no CJS-consumer obligation, so ESM-only removes a whole class of downstream breakage rather than papering over it.
- **License: MIT.**
- React 18+ compatibility required, including concurrent rendering — no reliance on legacy lifecycle patterns.
- Inference must never run on the main thread; violating this is a release blocker, not a bug to backlog.
- Package must stay dependency-light: `@mlc-ai/web-llm` and `comlink` are the only required runtime dependencies; no UI/styling dependencies of any kind.
- Bundle must tree-shake cleanly when the hook is unused; the worker chunk must not be pulled into the main bundle.
- No telemetry, analytics, or any network call other than the model-weight download itself.

## Success Criteria

- A developer can go from `npm install use-local-llm` to a working text generation call using fewer than 10 lines of application code.
- Time-to-first-token after a cached model load is dominated by inference, not library overhead (library-added latency is not user-perceptible, no formal benchmark target set yet).
- Zero main-thread blocking during generation, verified by a long-task/INP check during manual or automated browser testing.
- Package published to npm under a permissive open-source license with README examples covering the primary hook usage, cancellation, and the `unsupported`-browser fallback pattern.

## Constraints & Assumptions

- Constrained to browsers that support WebGPU (Chrome, Edge, Opera today; Safari/Firefox support is evolving) — no CPU/WASM fallback is in scope for Phase 1.
- Assumes React 18+ as the host; no support commitment for React 17 or earlier.
- Assumes `@mlc-ai/web-llm`'s model catalog (Llama, Phi, Gemma, Mistral in MLC/GGUF-compatible formats) is sufficient for Phase 1; broader Hugging Face Hub model support (transformers.js) is a possible future adapter, not Phase 1 scope.
- Model weights are multi-gigabyte; developers are responsible for their own hosting/CDN choices for model files unless `web-llm`'s default model CDN is used.

## Out of Scope

- Any pre-built UI component (chat box, markdown renderer, buttons, loading spinners, etc.) — this package is headless, hooks-only, by design.
- Any visual styling, CSS, or design-system opinion of any kind.
- Server-side or cloud LLM fallback — this is a local-only inference package.
- Non-React framework bindings (Vue, Svelte, etc.) — React 18+ only for Phase 1.
- A pluggable multi-engine adapter (web-llm + transformers.js side by side) — deferred; the public hook API is kept engine-agnostic in naming/shape so this can be added later without a breaking change, but it is not built in Phase 1.

## Dependencies

- `@mlc-ai/web-llm` (WebGPU inference engine, MIT-compatible license — verify before publish).
- `comlink` (Web Worker RPC).
- Browser WebGPU support (external, outside this project's control) — Phase 1 explicitly does not attempt to work around its absence beyond surfacing a clear `unsupported` state.
