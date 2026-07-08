import * as Comlink from "comlink";
import type {
  ChatCompletionMessageParam,
  InitProgressReport,
} from "@mlc-ai/web-llm";
import type { EngineAPI } from "./engine-api.js";
import { WorkerCrashError } from "./errors.js";

export interface EngineClient {
  loadModel(
    modelId: string,
    onProgress?: (report: InitProgressReport) => void,
  ): Promise<void>;
  generate(messages: ChatCompletionMessageParam[]): Promise<string>;
  streamGenerate(
    messages: ChatCompletionMessageParam[],
    onToken: (token: string) => void,
  ): Promise<void>;
  abort(): Promise<void>;
  unload(): Promise<void>;
  checkCache(modelId: string): Promise<boolean>;
  /** Terminates the underlying Worker. Not part of EngineAPI — this is a
   * main-thread-only lifecycle operation, not something to proxy. */
  terminate(): void;
  /**
   * Subscribes to uncaught exceptions inside the worker (returns an
   * unsubscribe function). This only covers crashes that raise a JS
   * `error`/`messageerror` event — it does NOT cover a silent browser
   * OOM-kill, where the worker just stops responding with no event at
   * all. That case has no event to subscribe to; callers needing to
   * detect it must use an inactivity timeout on their own pending calls
   * instead (see use-browser-llm.ts's load-inactivity watchdog).
   */
  onCrash(listener: (error: WorkerCrashError) => void): () => void;
}

/**
 * Spawns the worker (loaded via new URL(...) so bundlers statically detect
 * and code-split it into its own chunk, never pulling worker.ts into the
 * main-thread bundle) and wraps it with Comlink, returning a plain-callback
 * client so consumers never need to import or think about Comlink
 * themselves.
 *
 * Callback args are wrapped in Comlink.proxy() below. There's no explicit
 * release call for this pattern (Comlink.releaseProxy applies to remote
 * proxies obtained via wrap(), not to local callbacks passed as proxied
 * arguments) — Comlink's own FinalizationRegistry-based cleanup handles the
 * underlying MessagePort once each proxied callback is garbage collected.
 */
export function createEngineClient(): EngineClient {
  const worker = new Worker(new URL("./worker.js", import.meta.url), {
    type: "module",
  });
  const remote = Comlink.wrap<EngineAPI>(worker);

  return {
    loadModel(modelId, onProgress) {
      return remote.loadModel(modelId, Comlink.proxy(onProgress ?? (() => {})));
    },
    generate(messages) {
      return remote.generate(messages);
    },
    streamGenerate(messages, onToken) {
      return remote.streamGenerate(messages, Comlink.proxy(onToken));
    },
    abort() {
      return remote.abort();
    },
    unload() {
      return remote.unload();
    },
    checkCache(modelId) {
      return remote.checkCache(modelId);
    },
    terminate() {
      worker.terminate();
    },
    onCrash(listener) {
      const handleError = (event: ErrorEvent) => {
        listener(new WorkerCrashError(event.message || "uncaught exception"));
      };
      const handleMessageError = () => {
        listener(new WorkerCrashError("failed to deserialize a worker message"));
      };
      worker.addEventListener("error", handleError);
      worker.addEventListener("messageerror", handleMessageError);
      return () => {
        worker.removeEventListener("error", handleError);
        worker.removeEventListener("messageerror", handleMessageError);
      };
    },
  };
}
