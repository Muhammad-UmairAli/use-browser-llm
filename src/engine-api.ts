import type {
  ChatCompletionMessageParam,
  InitProgressReport,
} from "@mlc-ai/web-llm";

/**
 * The Comlink-exposed surface of the worker-hosted @mlc-ai/web-llm engine.
 * Shared between worker.ts (implements it) and engine-client.ts (types the
 * Comlink.wrap<EngineAPI>() proxy against it) so neither side needs to
 * import the other module directly — worker.ts is compiled against the
 * WebWorker lib, engine-client.ts against the DOM lib, and importing across
 * that split would pull worker-only globals into the main-thread compile.
 *
 * Callback parameters (onProgress, onToken) must be passed wrapped in
 * `Comlink.proxy(...)` by the caller — Comlink does not auto-proxy plain
 * functions, and an un-proxied function cannot cross the postMessage
 * boundary. engine-client.ts's createEngineClient() handles this so
 * downstream consumers never need to know about Comlink directly.
 */
export interface EngineAPI {
  loadModel(
    modelId: string,
    onProgress: (report: InitProgressReport) => void,
  ): Promise<void>;
  generate(messages: ChatCompletionMessageParam[]): Promise<string>;
  streamGenerate(
    messages: ChatCompletionMessageParam[],
    onToken: (token: string) => void,
  ): Promise<void>;
  abort(): Promise<void>;
  unload(): Promise<void>;
}
