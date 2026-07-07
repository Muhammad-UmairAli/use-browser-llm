import { useEffect, useReducer, useRef } from "react";
import { createEngineClient, type EngineClient } from "./engine-client.js";

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

export type UseLocalLLMResult = ModelLoadState;

/**
 * Placeholder for the public useLocalLLM() hook name; this task (P1-04)
 * implements only the model-loading state machine. Generation
 * (P1-05), cache-status (P1-06), and the unsupported-browser path
 * (P1-07) extend this in later tasks.
 */
export function useLocalLLM(modelId: string | undefined): UseLocalLLMResult {
  const [state, dispatch] = useReducer(reducer, initialState);
  const clientRef = useRef<EngineClient | null>(null);

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
    // (This is currently a defensive no-op — the effect's own cleanup
    // always runs first and nulls the ref — but clientRef is exposed here
    // rather than kept as a local variable because P1-05's generate/
    // streamGenerate will need to read the current client from outside
    // this effect.)
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

  return state;
}
