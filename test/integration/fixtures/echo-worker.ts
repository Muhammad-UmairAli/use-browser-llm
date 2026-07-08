import * as Comlink from "comlink";

/**
 * Minimal fixture worker for proving Comlink.proxy() genuinely marshals a
 * callback over a real postMessage boundary — no MLCEngine/WebGPU
 * dependency, unlike src/worker.ts. `streamTokens` mirrors the shape
 * EngineAPI's own callback-taking methods use (loadModel's onProgress,
 * streamGenerate's onToken): a proxied callback invoked N times before the
 * owning call resolves.
 */
export interface EchoAPI {
  streamTokens(
    count: number,
    onToken: (token: string) => void,
  ): Promise<void>;
}

const api: EchoAPI = {
  async streamTokens(count, onToken) {
    for (let i = 0; i < count; i++) {
      // The `await` here is load-bearing, not stylistic — discovered by
      // this exact test. Calling a Comlink.proxy()-wrapped callback
      // several times back-to-back with no yield to the event loop in
      // between silently drops all but the last call: a first attempt
      // without `await` here only ever delivered 1 of 3 tokens. `onToken`
      // is typed `=> void` (matching EngineAPI's own onProgress/onToken
      // signatures), but Comlink's proxy still returns a promise-like
      // value under the hood, so `await`ing it — even though TypeScript
      // sees `void` — is, empirically, what's needed for every call to be
      // delivered; the working theory is that it yields long enough for
      // each postMessage to be sent and processed before the next call
      // fires, though Comlink's internals weren't traced to confirm it.
      await onToken(`token-${i}`);
    }
  },
};

Comlink.expose(api);
