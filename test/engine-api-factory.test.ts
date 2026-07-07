import { describe, expect, it, vi } from "vitest";
import {
  createEngineAPI,
  type EngineLike,
} from "../src/engine-api-factory.js";
import type { InitProgressReport } from "@mlc-ai/web-llm";

function makeFakeEngine(overrides: Partial<EngineLike> = {}): EngineLike {
  return {
    setInitProgressCallback: vi.fn(),
    reload: vi.fn().mockResolvedValue(undefined),
    chatCompletion: vi.fn() as unknown as EngineLike["chatCompletion"],
    interruptGenerate: vi.fn().mockResolvedValue(undefined),
    unload: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("createEngineAPI", () => {
  it("loadModel forwards progress reports as a subscribable callback, not a one-shot return", async () => {
    const reports: InitProgressReport[] = [];
    const fakeEngine = makeFakeEngine({
      setInitProgressCallback: vi.fn((cb) => {
        // Simulate web-llm calling the callback multiple times during a
        // single reload(), proving this is a stream of events, not a
        // single resolved value.
        cb({ progress: 0.5, text: "halfway" } as InitProgressReport);
        cb({ progress: 1, text: "done" } as InitProgressReport);
      }),
    });
    const api = createEngineAPI(fakeEngine);

    await api.loadModel("test-model", (report) => reports.push(report));

    expect(fakeEngine.reload).toHaveBeenCalledWith("test-model");
    expect(reports).toHaveLength(2);
    expect(reports[0]?.progress).toBe(0.5);
    expect(reports[1]?.progress).toBe(1);
  });

  it("generate returns the full completion text for a non-streaming request", async () => {
    const fakeEngine = makeFakeEngine({
      chatCompletion: vi.fn().mockResolvedValue({
        choices: [{ message: { content: "hello world" } }],
      }) as unknown as EngineLike["chatCompletion"],
    });
    const api = createEngineAPI(fakeEngine);

    const result = await api.generate([{ role: "user", content: "hi" }]);

    expect(result).toBe("hello world");
    expect(fakeEngine.chatCompletion).toHaveBeenCalledWith({
      messages: [{ role: "user", content: "hi" }],
      stream: false,
    });
  });

  it("streamGenerate forwards each chunk's token via callback", async () => {
    async function* fakeStream() {
      yield { choices: [{ delta: { content: "hel" } }] };
      yield { choices: [{ delta: { content: "lo" } }] };
      yield { choices: [{ delta: {} }] }; // no content — should be skipped
    }
    const fakeEngine = makeFakeEngine({
      chatCompletion: vi
        .fn()
        .mockResolvedValue(
          fakeStream(),
        ) as unknown as EngineLike["chatCompletion"],
    });
    const api = createEngineAPI(fakeEngine);
    const tokens: string[] = [];

    await api.streamGenerate(
      [{ role: "user", content: "hi" }],
      (token) => tokens.push(token),
    );

    expect(tokens).toEqual(["hel", "lo"]);
  });

  it("abort delegates to engine.interruptGenerate", async () => {
    const fakeEngine = makeFakeEngine();
    const api = createEngineAPI(fakeEngine);

    await api.abort();

    expect(fakeEngine.interruptGenerate).toHaveBeenCalledOnce();
  });

  it("unload delegates to engine.unload", async () => {
    const fakeEngine = makeFakeEngine();
    const api = createEngineAPI(fakeEngine);

    await api.unload();

    expect(fakeEngine.unload).toHaveBeenCalledOnce();
  });
});
