// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBrowserLLM } from "../src/use-browser-llm.js";
import type { EngineClient } from "../src/engine-client.js";
import { UnsupportedError, WorkerCrashError } from "../src/errors.js";

const engineClientModule = vi.hoisted(() => ({
  createEngineClient: vi.fn(),
}));

vi.mock("../src/engine-client.js", () => engineClientModule);

const detectWebGPUSupportModule = vi.hoisted(() => ({
  detectWebGPUSupport: vi.fn(),
}));

vi.mock("../src/detect-webgpu.js", () => detectWebGPUSupportModule);

function makeFakeClient(
  overrides: Partial<EngineClient> = {},
): EngineClient {
  return {
    loadModel: vi.fn().mockResolvedValue(undefined),
    generate: vi.fn(),
    streamGenerate: vi.fn(),
    abort: vi.fn().mockResolvedValue(undefined),
    unload: vi.fn().mockResolvedValue(undefined),
    checkCache: vi.fn().mockResolvedValue(false),
    terminate: vi.fn(),
    onCrash: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  };
}

beforeEach(() => {
  // Default every test to a supported browser; the dedicated "unsupported"
  // describe block below overrides this per-test.
  detectWebGPUSupportModule.detectWebGPUSupport.mockResolvedValue({
    supported: true,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useBrowserLLM", () => {
  it("starts idle when no modelId is given", () => {
    const { result } = renderHook(() => useBrowserLLM(undefined));

    expect(result.current.status).toBe("idle");
    expect(result.current.progress).toBe(0);
    expect(result.current.error).toBeNull();
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.generationError).toBeNull();
    expect(result.current.cacheStatus).toBe("idle");
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

    const { result } = renderHook(() => useBrowserLLM("test-model"));

    await waitFor(() => expect(result.current.status).toBe("loading"));
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

    const { result } = renderHook(() => useBrowserLLM("test-model"));

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
      ({ modelId }) => useBrowserLLM(modelId),
      { initialProps: { modelId: "model-a" } },
    );
    await waitFor(() => expect(result.current.status).toBe("error"));

    rerender({ modelId: "model-b" });
    await waitFor(() => expect(result.current.status).toBe("loading"));
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

    const { result, unmount } = renderHook(() => useBrowserLLM("test-model"));
    // Wait for the client to actually exist (past the async capability
    // check) before unmounting — otherwise there's nothing to terminate
    // yet, and this test would pass trivially for the wrong reason.
    await waitFor(() => expect(result.current.status).toBe("loading"));
    unmount();

    // The real regression guard: cleanup ran (worker terminated) — this
    // fails if the effect's cleanup function is ever removed or
    // conditionally skipped.
    expect(fakeClient.terminate).toHaveBeenCalledOnce();

    // Note: once truly unmounted, RTL's `result.current` can never reflect
    // a post-unmount state change regardless of whether the `cancelled`
    // guard exists (there's no component left to re-render), so comparing
    // it before/after would pass either way. What we CAN meaningfully
    // assert is that firing the stale callbacks doesn't throw or reject —
    // if the `cancelled` check were removed, `dispatch` would still be
    // called on an unmounted component, which React 18 silently no-ops
    // rather than warning on, so this wouldn't a regression guard for the
    // dispatch itself, but it would catch a guard implemented incorrectly
    // (e.g. throwing instead of no-op'ing).
    await act(async () => {
      progressCallback?.({ progress: 0.9 });
      resolveLoad?.();
      await Promise.resolve();
    });
  });

  it("terminates the previous client and starts a fresh one when modelId changes mid-load", async () => {
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
      ({ modelId }) => useBrowserLLM(modelId),
      { initialProps: { modelId: "model-a" } },
    );
    await waitFor(() => expect(result.current.status).toBe("loading"));

    rerender({ modelId: "model-b" });

    // Synchronous: the effect terminates the previous client in its body,
    // before the async capability check for the new modelId even starts.
    expect(firstClient.terminate).toHaveBeenCalledOnce();

    await waitFor(() =>
      expect(secondClient.loadModel).toHaveBeenCalledWith(
        "model-b",
        expect.any(Function),
      ),
    );
  });

  async function renderReadyHook(overrides: Partial<EngineClient> = {}) {
    const fakeClient = makeFakeClient(overrides);
    engineClientModule.createEngineClient.mockReturnValue(fakeClient);
    const rendered = renderHook(() => useBrowserLLM("test-model"));
    await waitFor(() => expect(rendered.result.current.status).toBe("ready"));
    return { ...rendered, fakeClient };
  }

  describe("generate", () => {
    it("resolves with the full completion text", async () => {
      const { result, fakeClient } = await renderReadyHook({
        generate: vi.fn().mockResolvedValue("hello world"),
      });

      let generated: string | undefined;
      await act(async () => {
        generated = await result.current.generate([
          { role: "user", content: "hi" },
        ]);
      });

      expect(generated).toBe("hello world");
      expect(fakeClient.generate).toHaveBeenCalledWith([
        { role: "user", content: "hi" },
      ]);
      expect(result.current.isGenerating).toBe(false);
    });

    it("rejects with HookNotReadyError when called before ready", async () => {
      const fakeClient = makeFakeClient({
        loadModel: vi.fn(() => new Promise<void>(() => {})),
      });
      engineClientModule.createEngineClient.mockReturnValue(fakeClient);
      const { result } = renderHook(() => useBrowserLLM("test-model"));
      await waitFor(() => expect(result.current.status).toBe("loading"));

      await expect(
        result.current.generate([{ role: "user", content: "hi" }]),
      ).rejects.toThrow("cannot generate before the model is ready");
    });

    it("rejects with HookBusyError on an overlapping call", async () => {
      const box: { resolveFirst: ((value: string) => void) | null } = {
        resolveFirst: null,
      };
      const { result } = await renderReadyHook({
        generate: vi.fn(
          () =>
            new Promise<string>((resolve) => {
              box.resolveFirst = resolve;
            }),
        ),
      });

      let firstCallDone = false;
      const firstCallPromise = result.current
        .generate([{ role: "user", content: "one" }])
        .then(() => {
          firstCallDone = true;
        });

      await waitFor(() => expect(result.current.isGenerating).toBe(true));
      await expect(
        result.current.generate([{ role: "user", content: "two" }]),
      ).rejects.toThrow("a generation is already in progress");

      box.resolveFirst?.("done");
      await firstCallPromise;
      expect(firstCallDone).toBe(true);
    });

    it("sets generationError when the client rejects", async () => {
      const { result } = await renderReadyHook({
        generate: vi.fn().mockRejectedValue(new Error("engine exploded")),
      });

      await act(async () => {
        await expect(
          result.current.generate([{ role: "user", content: "hi" }]),
        ).rejects.toThrow("engine exploded");
      });

      expect(result.current.generationError?.message).toBe(
        "engine exploded",
      );
      expect(result.current.isGenerating).toBe(false);
    });
  });

  describe("streamGenerate", () => {
    it("yields tokens incrementally", async () => {
      const { result } = await renderReadyHook({
        streamGenerate: vi.fn(async (_messages, onToken) => {
          onToken("hel");
          onToken("lo");
        }),
      });

      const tokens: string[] = [];
      await act(async () => {
        for await (const token of result.current.streamGenerate([
          { role: "user", content: "hi" },
        ])) {
          tokens.push(token);
        }
      });

      expect(tokens).toEqual(["hel", "lo"]);
      expect(result.current.isGenerating).toBe(false);
    });

    it("calls abort() when the consumer breaks out early", async () => {
      const box: { released: (() => void) | null } = { released: null };
      const fakeAbort = vi.fn().mockResolvedValue(undefined);
      const { result } = await renderReadyHook({
        abort: fakeAbort,
        streamGenerate: vi.fn(
          (_messages, onToken) =>
            new Promise<void>((resolve) => {
              onToken("first");
              onToken("second");
              box.released = resolve;
            }),
        ),
      });

      await act(async () => {
        for await (const token of result.current.streamGenerate([
          { role: "user", content: "hi" },
        ])) {
          if (token === "first") {
            break;
          }
        }
      });

      expect(fakeAbort).toHaveBeenCalledOnce();
      box.released?.();
    });

    it("rejects with HookNotReadyError when called before ready", async () => {
      const fakeClient = makeFakeClient({
        loadModel: vi.fn(() => new Promise<void>(() => {})),
      });
      engineClientModule.createEngineClient.mockReturnValue(fakeClient);
      const { result } = renderHook(() => useBrowserLLM("test-model"));

      const gen = result.current.streamGenerate([
        { role: "user", content: "hi" },
      ]);
      await expect(gen.next()).rejects.toThrow(
        "cannot generate before the model is ready",
      );
    });
  });

  describe("abort", () => {
    it("delegates to the engine client's abort", async () => {
      const { result, fakeClient } = await renderReadyHook();

      result.current.abort();

      expect(fakeClient.abort).toHaveBeenCalledOnce();
    });
  });

  describe("unsupported browser", () => {
    it("short-circuits straight to unsupported, never through loading, and never spawns a worker", async () => {
      detectWebGPUSupportModule.detectWebGPUSupport.mockResolvedValue({
        supported: false,
        reason: "no-navigator-gpu",
      });

      const { result } = renderHook(() => useBrowserLLM("test-model"));

      await waitFor(() =>
        expect(result.current.status).toBe("unsupported"),
      );
      expect(result.current.error).toBeInstanceOf(UnsupportedError);
      expect((result.current.error as UnsupportedError).reason).toBe(
        "no-navigator-gpu",
      );
      expect(engineClientModule.createEngineClient).not.toHaveBeenCalled();
    });

    it("also short-circuits on a modelId change mid-session, not just initial mount", async () => {
      const readyClient = makeFakeClient();
      engineClientModule.createEngineClient.mockReturnValue(readyClient);

      const { result, rerender } = renderHook(
        ({ modelId }) => useBrowserLLM(modelId),
        { initialProps: { modelId: "model-a" } },
      );
      await waitFor(() => expect(result.current.status).toBe("ready"));

      detectWebGPUSupportModule.detectWebGPUSupport.mockResolvedValue({
        supported: false,
        reason: "no-adapter",
      });
      rerender({ modelId: "model-b" });

      await waitFor(() =>
        expect(result.current.status).toBe("unsupported"),
      );
      // Only the first (model-a) call spawned a worker; model-b's
      // capability check failed before a second one was ever created.
      expect(engineClientModule.createEngineClient).toHaveBeenCalledOnce();
    });
  });

  describe("worker crash", () => {
    it("surfaces a crash via onCrash as a typed error, and a fresh request recovers", async () => {
      let crashListener: ((error: Error) => void) | null = null;
      const crashingClient = makeFakeClient({
        loadModel: vi.fn(() => new Promise<void>(() => {})),
        onCrash: vi.fn((listener) => {
          crashListener = listener;
          return () => {};
        }),
      });
      const recoveredClient = makeFakeClient();
      engineClientModule.createEngineClient
        .mockReturnValueOnce(crashingClient)
        .mockReturnValueOnce(recoveredClient);

      const { result, rerender } = renderHook(
        ({ modelId }) => useBrowserLLM(modelId),
        { initialProps: { modelId: "model-a" } },
      );
      await waitFor(() => expect(result.current.status).toBe("loading"));

      act(() => {
        crashListener?.(new WorkerCrashError("uncaught exception"));
      });

      await waitFor(() => expect(result.current.status).toBe("error"));
      expect(result.current.error).toBeInstanceOf(WorkerCrashError);

      // The hook remains usable — a fresh request (different modelId)
      // recovers cleanly.
      rerender({ modelId: "model-b" });
      await waitFor(() => expect(result.current.status).toBe("ready"));
    });
  });

  describe("load inactivity watchdog", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("surfaces a typed error if no progress is reported for the timeout window", async () => {
      const fakeClient = makeFakeClient({
        loadModel: vi.fn(() => new Promise<void>(() => {})),
      });
      engineClientModule.createEngineClient.mockReturnValue(fakeClient);

      const { result } = renderHook(() => useBrowserLLM("test-model"));

      // Let the async capability-check microtask resolve under fake timers.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.status).toBe("loading");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });

      expect(result.current.status).toBe("error");
      expect(result.current.error).toBeInstanceOf(WorkerCrashError);
    });

    it("resets on each progress tick, so steady-but-slow progress never times out", async () => {
      let progressCallback: ((report: { progress: number }) => void) | null =
        null;
      const fakeClient = makeFakeClient({
        loadModel: vi.fn((_modelId: string, onProgress) => {
          progressCallback = onProgress as typeof progressCallback;
          return new Promise<void>(() => {});
        }),
      });
      engineClientModule.createEngineClient.mockReturnValue(fakeClient);

      const { result } = renderHook(() => useBrowserLLM("test-model"));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // 20s, then a progress tick, then another 20s — 40s total elapsed,
      // but never more than 20s without a tick, so no timeout fires.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });
      act(() => {
        progressCallback?.({ progress: 0.5 });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });

      expect(result.current.status).toBe("loading");
    });
  });

  describe("cacheStatus", () => {
    it("resolves to 'cached' when checkCache reports the model is already downloaded", async () => {
      const fakeClient = makeFakeClient({
        loadModel: vi.fn(() => new Promise<void>(() => {})),
        checkCache: vi.fn().mockResolvedValue(true),
      });
      engineClientModule.createEngineClient.mockReturnValue(fakeClient);

      const { result } = renderHook(() => useBrowserLLM("test-model"));

      await waitFor(() => expect(result.current.cacheStatus).toBe("cached"));
      // Available before status reaches "ready" — this load never resolves.
      expect(result.current.status).toBe("loading");
    });

    it("resolves to 'downloading' when checkCache reports a cache miss", async () => {
      const fakeClient = makeFakeClient({
        loadModel: vi.fn(() => new Promise<void>(() => {})),
        checkCache: vi.fn().mockResolvedValue(false),
      });
      engineClientModule.createEngineClient.mockReturnValue(fakeClient);

      const { result } = renderHook(() => useBrowserLLM("test-model"));

      await waitFor(() =>
        expect(result.current.cacheStatus).toBe("downloading"),
      );
      expect(result.current.status).toBe("loading");
    });

    it("starts as 'checking' immediately on load-start, before checkCache resolves", async () => {
      const fakeClient = makeFakeClient({
        loadModel: vi.fn(() => new Promise<void>(() => {})),
        checkCache: vi.fn(() => new Promise<boolean>(() => {})),
      });
      engineClientModule.createEngineClient.mockReturnValue(fakeClient);

      const { result } = renderHook(() => useBrowserLLM("test-model"));

      await waitFor(() => expect(result.current.status).toBe("loading"));
      expect(result.current.cacheStatus).toBe("checking");
    });

    it("ignores a late checkCache resolution once the load has already reached ready", async () => {
      const box: { resolveCheckCache: ((cached: boolean) => void) | null } = {
        resolveCheckCache: null,
      };
      const fakeClient = makeFakeClient({
        loadModel: vi.fn().mockResolvedValue(undefined),
        checkCache: vi.fn(
          () =>
            new Promise<boolean>((resolve) => {
              box.resolveCheckCache = resolve;
            }),
        ),
      });
      engineClientModule.createEngineClient.mockReturnValue(fakeClient);

      const { result } = renderHook(() => useBrowserLLM("test-model"));
      await waitFor(() => expect(result.current.status).toBe("ready"));
      expect(result.current.cacheStatus).toBe("checking");

      act(() => {
        box.resolveCheckCache?.(false);
      });

      // The reducer drops a cache-status action once status isn't
      // "loading" anymore — a late "downloading" label after ready would
      // be misleading, not useful.
      expect(result.current.cacheStatus).toBe("checking");
    });

    it("resets to idle on a modelId change back to undefined", async () => {
      const fakeClient = makeFakeClient({
        checkCache: vi.fn().mockResolvedValue(true),
      });
      engineClientModule.createEngineClient.mockReturnValue(fakeClient);

      const { result, rerender } = renderHook<
        ReturnType<typeof useBrowserLLM>,
        { modelId: string | undefined }
      >(({ modelId }) => useBrowserLLM(modelId), {
        initialProps: { modelId: "test-model" },
      });
      await waitFor(() => expect(result.current.status).toBe("ready"));

      rerender({ modelId: undefined });

      expect(result.current.cacheStatus).toBe("idle");
    });
  });

  /**
   * Renders a ready hook backed by a fake client whose onCrash() tracks
   * EVERY registered listener (not just the most recent), so triggerCrash()
   * faithfully simulates a real crash event reaching every subscriber —
   * matching production, where both the load effect's onCrash and
   * generate()/streamGenerate()'s own onCrash are simultaneously subscribed
   * and both fire on the same event.
   */
  async function renderReadyHookWithCrashTracking(
    overrides: Partial<EngineClient> = {},
  ) {
    const listeners: Array<(error: Error) => void> = [];
    const onCrash = vi.fn((listener: (error: Error) => void) => {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      };
    });
    const rendered = await renderReadyHook({ onCrash, ...overrides });
    return {
      ...rendered,
      triggerCrash(error: Error) {
        for (const listener of [...listeners]) {
          listener(error);
        }
      },
    };
  }

  describe("generate crash/timeout", () => {
    it("rejects immediately via onCrash, and status transitions to error", async () => {
      const { result, triggerCrash } = await renderReadyHookWithCrashTracking({
        generate: vi.fn(() => new Promise<string>(() => {})),
      });

      let generatePromise: Promise<string> | undefined;
      act(() => {
        generatePromise = result.current.generate([
          { role: "user", content: "hi" },
        ]);
      });
      await waitFor(() => expect(result.current.isGenerating).toBe(true));

      act(() => {
        triggerCrash(new WorkerCrashError("uncaught exception"));
      });

      await expect(generatePromise).rejects.toThrow(WorkerCrashError);
      await waitFor(() => expect(result.current.status).toBe("error"));
      expect(result.current.isGenerating).toBe(false);
    });

    it("does NOT transition status on a normal (non-crash) generation failure", async () => {
      const { result, fakeClient } = await renderReadyHook({
        generate: vi.fn().mockRejectedValue(new Error("content policy violation")),
      });

      await act(async () => {
        await expect(
          result.current.generate([{ role: "user", content: "hi" }]),
        ).rejects.toThrow("content policy violation");
      });

      expect(result.current.generationError?.message).toBe(
        "content policy violation",
      );
      // The model is still loaded and usable — status must stay "ready".
      expect(result.current.status).toBe("ready");
      expect(fakeClient.terminate).not.toHaveBeenCalled();
    });

    it("times out and surfaces WorkerCrashError when the worker silently hangs", async () => {
      const { result, fakeClient } = await renderReadyHook({
        generate: vi.fn(() => new Promise<string>(() => {})),
      });

      vi.useFakeTimers();
      try {
        // The assertion is chained onto the promise in the same act() call
        // that creates it — attaching a rejection handler before the timer
        // advance below fires, so there's no window where the rejection is
        // briefly unobserved (which vitest flags as an unhandled rejection
        // even when a `.rejects` handler is attached moments later).
        let assertion!: Promise<void>;
        act(() => {
          assertion = expect(
            result.current.generate([{ role: "user", content: "hi" }]),
          ).rejects.toThrow(WorkerCrashError);
        });

        await act(async () => {
          await vi.advanceTimersByTimeAsync(90_000);
        });
        await assertion;

        expect(result.current.status).toBe("error");
        expect(fakeClient.terminate).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("streamGenerate crash/timeout", () => {
    it("throws WorkerCrashError immediately via onCrash mid-stream", async () => {
      let capturedOnToken: ((token: string) => void) | null = null;
      const { result, triggerCrash } = await renderReadyHookWithCrashTracking({
        streamGenerate: vi.fn((_messages, onToken) => {
          capturedOnToken = onToken;
          return new Promise<void>(() => {});
        }),
      });

      const tokens: string[] = [];
      let thrown: unknown;
      let consume!: Promise<void>;
      act(() => {
        consume = (async () => {
          try {
            for await (const token of result.current.streamGenerate([
              { role: "user", content: "hi" },
            ])) {
              tokens.push(token);
            }
          } catch (err) {
            thrown = err;
          }
        })();
      });
      expect(capturedOnToken).not.toBeNull();

      act(() => {
        capturedOnToken?.("hel");
      });
      await waitFor(() => expect(tokens).toEqual(["hel"]));

      act(() => {
        triggerCrash(new WorkerCrashError("uncaught exception"));
      });
      await consume;

      expect(thrown).toBeInstanceOf(WorkerCrashError);
      await waitFor(() => expect(result.current.status).toBe("error"));
    });

    it("resets the inactivity watchdog on each token, so steady-but-slow streaming never times out", async () => {
      let onTokenCb: ((token: string) => void) | null = null;
      const { result, fakeClient } = await renderReadyHook({
        streamGenerate: vi.fn((_messages, onToken) => {
          onTokenCb = onToken;
          return new Promise<void>(() => {});
        }),
      });

      vi.useFakeTimers();
      try {
        const tokens: string[] = [];
        act(() => {
          void (async () => {
            for await (const token of result.current.streamGenerate([
              { role: "user", content: "hi" },
            ])) {
              tokens.push(token);
            }
          })();
        });
        expect(onTokenCb).not.toBeNull();

        // 20s, a token, another 20s — 40s total elapsed but never more
        // than 20s without a token, so no timeout fires.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(20_000);
        });
        act(() => {
          onTokenCb?.("hel");
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(20_000);
        });

        expect(result.current.status).toBe("ready");
        expect(fakeClient.terminate).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("times out and surfaces WorkerCrashError when no token arrives", async () => {
      const { result, fakeClient } = await renderReadyHook({
        streamGenerate: vi.fn(() => new Promise<void>(() => {})),
      });

      vi.useFakeTimers();
      try {
        let thrown: unknown;
        let consume!: Promise<void>;
        act(() => {
          consume = (async () => {
            try {
              for await (const token of result.current.streamGenerate([
                { role: "user", content: "hi" },
              ])) {
                void token;
              }
            } catch (err) {
              thrown = err;
            }
          })();
        });

        await act(async () => {
          await vi.advanceTimersByTimeAsync(30_000);
        });
        await consume;

        expect(thrown).toBeInstanceOf(WorkerCrashError);
        expect(result.current.status).toBe("error");
        expect(fakeClient.terminate).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("still unsticks an abandoned stream when the client was replaced by a new load, without stomping the new client's state", async () => {
      vi.useFakeTimers();
      try {
        let onTokenCb: ((token: string) => void) | null = null;
        const clientA = makeFakeClient({
          streamGenerate: vi.fn((_messages, onToken) => {
            onTokenCb = onToken;
            return new Promise<void>(() => {});
          }),
        });
        const clientB = makeFakeClient();
        engineClientModule.createEngineClient
          .mockReturnValueOnce(clientA)
          .mockReturnValueOnce(clientB);

        const { result, rerender } = renderHook(
          ({ modelId }) => useBrowserLLM(modelId),
          { initialProps: { modelId: "model-a" } },
        );
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });
        expect(result.current.status).toBe("ready");

        let thrown: unknown;
        let consume!: Promise<void>;
        act(() => {
          consume = (async () => {
            try {
              for await (const token of result.current.streamGenerate([
                { role: "user", content: "hi" },
              ])) {
                void token;
              }
            } catch (err) {
              thrown = err;
            }
          })();
        });
        expect(onTokenCb).not.toBeNull();

        // modelId changes mid-stream: the load effect's cleanup terminates
        // clientA directly (a plain terminate() fires no onCrash event,
        // unlike a real crash), and clientB takes over as clientRef.
        rerender({ modelId: "model-b" });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });
        expect(result.current.status).toBe("ready");

        // The abandoned stream's own watchdog still fires on schedule and
        // must unstick its suspended `for await` (otherwise isGeneratingRef
        // stays stuck true forever, since streamGenerateImpl's finally
        // block — which resets it — never runs). It must NOT terminate the
        // new client or dispatch an error over the new client's state.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(30_000);
        });
        await consume;

        expect(thrown).toBeInstanceOf(WorkerCrashError);
        expect(result.current.status).toBe("ready");
        expect(clientB.terminate).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("abort() during a live stream still ends gracefully, without throwing", async () => {
      let onTokenCb: ((token: string) => void) | null = null;
      let releaseStream: (() => void) | null = null;
      const { result, fakeClient } = await renderReadyHook({
        streamGenerate: vi.fn(
          (_messages, onToken) =>
            new Promise<void>((resolve) => {
              onTokenCb = onToken;
              releaseStream = resolve;
            }),
        ),
      });

      const tokens: string[] = [];
      let thrown: unknown;
      let consume!: Promise<void>;
      act(() => {
        consume = (async () => {
          try {
            for await (const token of result.current.streamGenerate([
              { role: "user", content: "hi" },
            ])) {
              tokens.push(token);
            }
          } catch (err) {
            thrown = err;
          }
        })();
      });
      expect(onTokenCb).not.toBeNull();

      act(() => {
        onTokenCb?.("hel");
      });
      await waitFor(() => expect(tokens).toEqual(["hel"]));

      // Simulates the existing, already-shipped graceful-cancel contract:
      // a live worker's interruptGenerate() (via client.abort()) ends the
      // stream normally — no error — rather than the new crash machinery
      // firing. This locks in that abort() was deliberately NOT wired to
      // force-abort the internal AbortController (see abort()'s comment
      // in src/use-browser-llm.ts).
      act(() => {
        result.current.abort();
        releaseStream?.();
      });
      await consume;

      expect(thrown).toBeUndefined();
      expect(fakeClient.abort).toHaveBeenCalled();
    });
  });
});
