// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLocalLLM } from "../src/use-local-llm.js";
import type { EngineClient } from "../src/engine-client.js";

const engineClientModule = vi.hoisted(() => ({
  createEngineClient: vi.fn(),
}));

vi.mock("../src/engine-client.js", () => engineClientModule);

function makeFakeClient(
  overrides: Partial<EngineClient> = {},
): EngineClient {
  return {
    loadModel: vi.fn().mockResolvedValue(undefined),
    generate: vi.fn(),
    streamGenerate: vi.fn(),
    abort: vi.fn(),
    unload: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("useLocalLLM", () => {
  it("starts idle when no modelId is given", () => {
    const { result } = renderHook(() => useLocalLLM(undefined));

    expect(result.current).toEqual({
      status: "idle",
      progress: 0,
      error: null,
    });
    expect(engineClientModule.createEngineClient).not.toHaveBeenCalled();
  });

  it("transitions idle -> loading -> ready, with incremental progress", async () => {
    let progressCallback: ((report: { progress: number }) => void) | null =
      null;
    const fakeClient = makeFakeClient({
      loadModel: vi.fn((_modelId: string, onProgress) => {
        progressCallback = onProgress as typeof progressCallback;
        return new Promise<void>((resolve) => {
          // Resolve only after the test manually fires progress + calls resolve.
          (fakeClient as unknown as { _resolve: () => void })._resolve =
            resolve;
        });
      }),
    });
    engineClientModule.createEngineClient.mockReturnValue(fakeClient);

    const { result } = renderHook(() => useLocalLLM("test-model"));

    expect(result.current.status).toBe("loading");
    expect(result.current.progress).toBe(0);

    act(() => {
      progressCallback?.({ progress: 0.5 });
    });
    expect(result.current.progress).toBe(0.5);

    act(() => {
      (fakeClient as unknown as { _resolve: () => void })._resolve();
    });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.progress).toBe(1);
    expect(result.current.error).toBeNull();
  });

  it("transitions to error when loadModel rejects", async () => {
    const fakeClient = makeFakeClient({
      loadModel: vi.fn().mockRejectedValue(new Error("boom")),
    });
    engineClientModule.createEngineClient.mockReturnValue(fakeClient);

    const { result } = renderHook(() => useLocalLLM("test-model"));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error?.message).toBe("boom");
  });

  it("resets progress and error on a retry after a failure", async () => {
    let resolveSecondLoad: (() => void) | null = null;
    const fakeClient = makeFakeClient({
      loadModel: vi
        .fn()
        .mockRejectedValueOnce(new Error("first failure"))
        .mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              resolveSecondLoad = resolve;
            }),
        ),
    });
    engineClientModule.createEngineClient.mockReturnValue(fakeClient);

    const { result, rerender } = renderHook(
      ({ modelId }) => useLocalLLM(modelId),
      { initialProps: { modelId: "model-a" } },
    );
    await waitFor(() => expect(result.current.status).toBe("error"));

    rerender({ modelId: "model-b" });
    expect(result.current.status).toBe("loading");
    expect(result.current.progress).toBe(0);
    expect(result.current.error).toBeNull();

    act(() => resolveSecondLoad?.());
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("does not dispatch state updates after unmount", async () => {
    let resolveLoad: (() => void) | null = null;
    let progressCallback: ((report: { progress: number }) => void) | null =
      null;
    const fakeClient = makeFakeClient({
      loadModel: vi.fn((_modelId: string, onProgress) => {
        progressCallback = onProgress as typeof progressCallback;
        return new Promise<void>((resolve) => {
          resolveLoad = resolve;
        });
      }),
    });
    engineClientModule.createEngineClient.mockReturnValue(fakeClient);

    const { result, unmount } = renderHook(() => useLocalLLM("test-model"));
    const stateBeforeUnmount = result.current;
    unmount();

    expect(fakeClient.terminate).toHaveBeenCalledOnce();

    // If the cancelled-flag guard were missing, these post-unmount calls
    // would still dispatch, and result.current would change (or React
    // would warn/throw on an update to an unmounted component's state).
    await act(async () => {
      progressCallback?.({ progress: 0.9 });
      resolveLoad?.();
      await Promise.resolve();
    });

    expect(result.current).toEqual(stateBeforeUnmount);
  });

  it("terminates the previous client and starts a fresh one when modelId changes mid-load", () => {
    const firstClient = makeFakeClient({
      // A promise that never resolves during this test — proves the
      // replacement happens while model-a's load is still genuinely
      // in-flight, not after it already completed.
      loadModel: vi.fn(() => new Promise<void>(() => {})),
    });
    const secondClient = makeFakeClient();
    engineClientModule.createEngineClient
      .mockReturnValueOnce(firstClient)
      .mockReturnValueOnce(secondClient);

    const { result, rerender } = renderHook(
      ({ modelId }) => useLocalLLM(modelId),
      { initialProps: { modelId: "model-a" } },
    );
    expect(result.current.status).toBe("loading");

    rerender({ modelId: "model-b" });

    expect(firstClient.terminate).toHaveBeenCalledOnce();
    expect(secondClient.loadModel).toHaveBeenCalledWith(
      "model-b",
      expect.any(Function),
    );
  });
});
