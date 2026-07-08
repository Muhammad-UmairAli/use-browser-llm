import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionRequestNonStreaming,
  ChatCompletionRequestStreaming,
  InitProgressReport,
} from "@mlc-ai/web-llm";
import type { EngineAPI } from "./engine-api.js";

/**
 * The subset of MLCEngine's interface createEngineAPI() actually calls.
 * Kept narrow (rather than importing MLCEngine's full type) so tests can
 * satisfy it with a lightweight fake instead of the real WebGPU engine.
 * The chatCompletion overloads intentionally reuse web-llm's own real
 * request/response types (rather than simplified inline shapes) so that
 * a real MLCEngine is structurally assignable to EngineLike — TypeScript
 * checks overload compatibility strictly, and a simplified shape doesn't
 * line up with MLCEngine's own overloads.
 */
export interface EngineLike {
  setInitProgressCallback(cb: (report: InitProgressReport) => void): void;
  reload(modelId: string): Promise<void>;
  chatCompletion(
    request: ChatCompletionRequestNonStreaming,
  ): Promise<ChatCompletion>;
  chatCompletion(
    request: ChatCompletionRequestStreaming,
  ): Promise<AsyncIterable<ChatCompletionChunk>>;
  interruptGenerate(): Promise<void>;
  unload(): Promise<void>;
}

/**
 * Builds the Comlink-exposed EngineAPI on top of an MLCEngine-shaped
 * object. Pure wiring, no side effects — worker.ts is the only place this
 * is combined with a real MLCEngine and Comlink.expose().
 *
 * `checkCache` is injected separately (not part of `EngineLike`) because
 * `hasModelInCache` is a standalone function on @mlc-ai/web-llm, not a
 * method on MLCEngine instances — same dependency-injection pattern as
 * `engine`, so tests can fake it without touching real IndexedDB.
 */
export function createEngineAPI(
  engine: EngineLike,
  checkCache: (modelId: string) => Promise<boolean>,
): EngineAPI {
  return {
    async loadModel(modelId, onProgress) {
      engine.setInitProgressCallback(onProgress);
      await engine.reload(modelId);
    },

    async generate(messages) {
      const completion = await engine.chatCompletion({
        messages,
        stream: false,
      });
      return completion.choices[0]?.message.content ?? "";
    },

    async streamGenerate(messages, onToken) {
      const stream = await engine.chatCompletion({
        messages,
        stream: true,
      });
      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta.content;
        if (token) {
          onToken(token);
        }
      }
    },

    async abort() {
      await engine.interruptGenerate();
    },

    async unload() {
      await engine.unload();
    },

    async checkCache(modelId) {
      return checkCache(modelId);
    },
  };
}
