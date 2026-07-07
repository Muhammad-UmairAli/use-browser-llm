import { describe, expect, it } from "vitest";
import * as Comlink from "comlink";
import type { EngineAPI } from "../../src/engine-api.js";

/**
 * Runs in a REAL headless Chromium (via @vitest/browser + Playwright), not
 * jsdom or a mocked Worker — jsdom does not implement Web Workers at all,
 * so this is the only way to genuinely prove the worker boundary works,
 * rather than proving our code calls `new Worker(...)` correctly (which is
 * all the mocked-Worker unit tests in test/engine-client.test.ts can do).
 *
 * Deliberately calls checkCache() — the only EngineAPI method that touches
 * neither WebGPU nor the network for a model that isn't cached (it's a
 * pure IndexedDB read) — against the real, unmodified src/worker.ts. Uses
 * a real model id from @mlc-ai/web-llm's prebuiltAppConfig.model_list —
 * hasModelInCache() looks up the model's record before checking the
 * cache, so an unknown id throws ModelNotFoundError rather than
 * completing the round trip cleanly. This proves:
 *   1. worker.ts genuinely runs as a Worker (constructing MLCEngine and
 *      exposing the API via Comlink.expose does not throw outside a
 *      WebGPU-capable environment — MLCEngine's constructor is pure JS
 *      setup, no GPU access until reload()/chatCompletion() are called).
 *   2. Comlink.wrap()'s proxy genuinely round-trips a call over a real
 *      postMessage boundary and back with the correct typed result.
 *
 * Run manually with `pnpm test:integration`. Not part of the default
 * `pnpm test` (which must stay GPU/browser-dependency-free for CI), and
 * gated in CI with a separate job that can be skipped without blocking a
 * merge if the runner has no browser available — see .github/workflows/ci.yml.
 */
describe("worker boundary (real Worker + real Comlink)", () => {
  it("round-trips checkCache() through a genuine postMessage boundary", async () => {
    const worker = new Worker(new URL("../../src/worker.ts", import.meta.url), {
      type: "module",
    });
    const remote = Comlink.wrap<EngineAPI>(worker);

    try {
      // A real model id (from prebuiltAppConfig.model_list) that we have
      // certainly never downloaded in this fresh browser context, so the
      // real IndexedDB check genuinely has something to look up and
      // legitimately resolves to false — not cached.
      const result = await remote.checkCache(
        "Llama-3.2-1B-Instruct-q4f16_1-MLC",
      );
      expect(result).toBe(false);
    } finally {
      worker.terminate();
    }
  });
});
