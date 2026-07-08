import { describe, expect, it } from "vitest";
import * as Comlink from "comlink";
import type { EchoAPI } from "./fixtures/echo-worker.js";

/**
 * Runs in a REAL headless Chromium (see worker-boundary.browser.test.ts's
 * header comment for why this can't be jsdom). That test only exercises a
 * plain scalar round-trip (checkCache()) — it never proves Comlink.proxy()
 * itself works over a real postMessage boundary, which is what
 * loadModel's onProgress and streamGenerate's onToken actually depend on
 * in production. This test exercises that mechanism directly, against a
 * minimal fixture worker (no MLCEngine/WebGPU dependency) — it proves the
 * Comlink.proxy() mechanism itself works over a real postMessage boundary,
 * not that src/worker.ts's actual onProgress/onToken call sites are safe.
 * That's a deliberate boundary, not a gap: the real worker's scalar RPC
 * path is already covered by worker-boundary.browser.test.ts, and
 * verifying MLCEngine's own onProgress call cadence would require a real
 * WebGPU engine, which this fixture is designed to avoid. See
 * SPLIT-PLAN §6 (backlog) for the resulting open question on loadModel's
 * onProgress delivery.
 *
 * Run manually with `pnpm test:integration`; picked up by the same
 * "Worker boundary integration test" CI job as the existing test.
 */
describe("Comlink proxy callback (real Worker + real Comlink)", () => {
  it("invokes a Comlink.proxy()-wrapped callback the expected number of times, in order, before the call resolves", async () => {
    const worker = new Worker(
      new URL("./fixtures/echo-worker.ts", import.meta.url),
      { type: "module" },
    );
    const remote = Comlink.wrap<EchoAPI>(worker);

    try {
      const received: string[] = [];
      await remote.streamTokens(
        3,
        Comlink.proxy((token: string) => {
          received.push(token);
        }),
      );
      expect(received).toEqual(["token-0", "token-1", "token-2"]);
    } finally {
      worker.terminate();
    }
  });
});
