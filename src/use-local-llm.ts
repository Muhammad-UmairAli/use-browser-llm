import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { createEngineClient, type EngineClient } from "./engine-client.js";
import { toAsyncGenerator } from "./to-async-generator.js";
import { HookBusyError, HookNotReadyError } from "./errors.js";
import type { ChatCompletionMessageParam } from "@mlc-ai/web-llm";

export type ModelLoadStatus = "idle" | "loading" | "ready" | "error";

export interface ModelLoadState {
  status: ModelLoadStatus;
  /** 0-1 while status === "loading"; meaningless otherwise. */
  progress: number;
  error: Error | null;
}

type Action =
  | { type: "reset" }
  | { type: "load-start" }
  | { type: "progress"; progress: number }
  | { type: "ready" }
  | { type: "error"; error: Error };

const initialState: ModelLoadState = {
  status: "idle",
  progress: 0,
  error: null,
};

function reducer(state: ModelLoadState, action: Action): ModelLoadState {
  switch (action.type) {
    case "reset":
      return initialState;
    case "load-start":
      // Reset progress/error even on a retry after a previous failure —
      // otherwise a re-request would start from stale progress or carry
      // the old error into the new load.
      return { status: "loading", progress: 0, error: null };
    case "progress":
      return { ...state, progress: action.progress };
    case "ready":
      return { ...state, status: "ready", progress: 1, error: null };
    case "error":
      return { ...state, status: "error", error: action.error };
  }
}

export interface GenerationState {
  isGenerating: boolean;
  generationError: Error | null;
}

export interface UseLocalLLMResult extends ModelLoadState, GenerationState {
  generate(messages: ChatCompletionMessageParam[]): Promise<string>;
  streamGenerate(
    messages: ChatCompletionMessageParam[],
  ): AsyncGenerator<string, void, void>;
  /** Stops an in-flight generate()/streamGenerate() call, including the
   * worker's inference loop — not just the UI-visible promise. */
  abort(): void;
}

/**
 * Model-loading state machine (P1-04) plus generate/streamGenerate/abort
 * (P1-05). Cache-status (P1-06) and the unsupported-browser path (P1-07)
 * extend this hook in later tasks.
 */
export function useLocalLLM(modelId: string | undefined): UseLocalLLMResult {
  const [state, dispatch] = useReducer(reducer, initialState);
  const clientRef = useRef<EngineClient | null>(null);

  // Mirrors `state.status` into a ref so generate/streamGenerate/abort can
  // read the current status without needing `state.status` in their
  // useCallback deps — that would otherwise recreate them (and break
  // reference equality for consumers) on every status transition.
  const statusRef = useRef(state.status);
  statusRef.current = state.status;

  // Synchronous re-entrancy guard: React state updates are batched/async,
  // so `isGenerating` state alone can't prevent two generate() calls fired
  // back-to-back (before the first's setState has flushed) from both
  // passing the check.
  const isGeneratingRef = useRef(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<Error | null>(null);

  useEffect(() => {
    if (!modelId) {
      dispatch({ type: "reset" });
      return;
    }

    let cancelled = false;

    // Terminate any previous client before starting a new load. MLCEngine
    // has no API to abort an in-flight reload() and overlapping reloads on
    // one engine are unspecified, so a full terminate-and-recreate is the
    // only unambiguously correct way to cancel/replace a stale load.
    clientRef.current?.terminate();
    const client = createEngineClient();
    clientRef.current = client;
    dispatch({ type: "load-start" });

    client
      .loadModel(modelId, (report) => {
        if (!cancelled) {
          dispatch({ type: "progress", progress: report.progress });
        }
      })
      .then(() => {
        if (!cancelled) {
          dispatch({ type: "ready" });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          dispatch({
            type: "error",
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
      });

    return () => {
      cancelled = true;
      client.terminate();
      clientRef.current = null;
    };
  }, [modelId]);

  const generate = useCallback(
    async (messages: ChatCompletionMessageParam[]): Promise<string> => {
      if (statusRef.current !== "ready" || !clientRef.current) {
        throw new HookNotReadyError();
      }
      if (isGeneratingRef.current) {
        throw new HookBusyError();
      }

      isGeneratingRef.current = true;
      setIsGenerating(true);
      setGenerationError(null);
      try {
        return await clientRef.current.generate(messages);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setGenerationError(error);
        throw error;
      } finally {
        isGeneratingRef.current = false;
        setIsGenerating(false);
      }
    },
    [],
  );

  const streamGenerate = useCallback(
    (
      messages: ChatCompletionMessageParam[],
    ): AsyncGenerator<string, void, void> =>
      streamGenerateImpl(
        statusRef,
        clientRef,
        isGeneratingRef,
        setIsGenerating,
        setGenerationError,
        messages,
      ),
    [],
  );

  const abort = useCallback(() => {
    clientRef.current?.abort().catch(() => {
      // Fire-and-forget: a rejection here means the underlying worker is
      // already gone (e.g. a modelId change terminated it), which is not
      // an error from the caller's perspective — there's nothing left to
      // abort.
    });
  }, []);

  return {
    ...state,
    isGenerating,
    generationError,
    generate,
    streamGenerate,
    abort,
  };
}

async function* streamGenerateImpl(
  statusRef: { current: ModelLoadStatus },
  clientRef: { current: EngineClient | null },
  isGeneratingRef: { current: boolean },
  setIsGenerating: (value: boolean) => void,
  setGenerationError: (value: Error | null) => void,
  messages: ChatCompletionMessageParam[],
): AsyncGenerator<string, void, void> {
  if (statusRef.current !== "ready" || !clientRef.current) {
    throw new HookNotReadyError();
  }
  if (isGeneratingRef.current) {
    throw new HookBusyError();
  }

  const client = clientRef.current;
  isGeneratingRef.current = true;
  setIsGenerating(true);
  setGenerationError(null);
  try {
    yield* toAsyncGenerator((onToken) => client.streamGenerate(messages, onToken));
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    setGenerationError(error);
    throw error;
  } finally {
    isGeneratingRef.current = false;
    setIsGenerating(false);
    // Always signal the worker to stop, whether we finished naturally or
    // the consumer `break`s out of a `for await` early — interruptGenerate()
    // on an already-finished generation is a harmless no-op, but skipping
    // this on early exit would leave the worker's inference loop (and GPU
    // compute) running unattended. A rejection here means the worker is
    // already gone (e.g. a modelId change terminated it mid-stream), which
    // isn't an error from the caller's perspective.
    client.abort().catch(() => {});
  }
}
