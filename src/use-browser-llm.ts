import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { createEngineClient, type EngineClient } from "./engine-client.js";
import { detectWebGPUSupport } from "./detect-webgpu.js";
import { toAsyncGenerator } from "./to-async-generator.js";
import {
  HookBusyError,
  HookNotReadyError,
  UnsupportedError,
  WorkerCrashError,
} from "./errors.js";
import type { ChatMessage } from "./types.js";

export type ModelLoadStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error"
  | "unsupported";

export type CacheStatus = "idle" | "checking" | "cached" | "downloading";

export interface ModelLoadState {
  status: ModelLoadStatus;
  /** 0-1 while status === "loading"; meaningless otherwise. */
  progress: number;
  /** Set for both "error" and "unsupported" — check `status` first, this
   * carries the detail (an UnsupportedError, WorkerCrashError, or
   * whatever the engine/worker rejected with). */
  error: Error | null;
  /** Whether modelId was already in IndexedDB before this load started.
   * "checking" until the (non-blocking) cache check resolves; settles to
   * "cached" or "downloading" before status reaches "ready" — but is not
   * itself a loading gate, so it's still meaningful to read after ready.
   * Edge case: for a fast/cached model, `status` can reach "ready" before
   * this check resolves at all — cacheStatus then stays "checking"
   * indefinitely for that load (the reducer intentionally drops a late
   * resolution once status is no longer "loading"; see the "cache-status"
   * case below). */
  cacheStatus: CacheStatus;
}

type Action =
  | { type: "reset" }
  | { type: "load-start" }
  | { type: "progress"; progress: number }
  | { type: "cache-status"; cacheStatus: "cached" | "downloading" }
  | { type: "ready" }
  | { type: "error"; error: Error }
  | { type: "unsupported"; error: UnsupportedError };

const initialState: ModelLoadState = {
  status: "idle",
  progress: 0,
  error: null,
  cacheStatus: "idle",
};

// No progress event and no settlement for this long means the worker has
// likely been silently killed by the browser (e.g. an out-of-memory kill,
// which fires no JS error event at all — the RPC promise would otherwise
// hang forever). This is a heuristic, not a guarantee: a genuinely slow
// connection could in principle stall this long between progress ticks.
const LOAD_INACTIVITY_TIMEOUT_MS = 30_000;

// generate() has no intermediate signal at all (no callback fires until
// the whole call resolves), so this is a flat "took too long" timeout
// rather than a reset-on-activity watchdog — deliberately more generous
// than the load/stream watchdogs since a single long completion is a
// legitimate case a per-token signal would otherwise distinguish from a
// genuine hang.
const GENERATE_TIMEOUT_MS = 90_000;

// streamGenerate() DOES have a per-token signal, so — like the load
// watchdog — this resets on every token rather than being a flat timeout.
const STREAM_INACTIVITY_TIMEOUT_MS = 30_000;

function reducer(state: ModelLoadState, action: Action): ModelLoadState {
  switch (action.type) {
    case "reset":
      return initialState;
    case "load-start":
      // Reset progress/error even on a retry after a previous failure —
      // otherwise a re-request would start from stale progress or carry
      // the old error into the new load.
      return {
        status: "loading",
        progress: 0,
        error: null,
        cacheStatus: "checking",
      };
    case "progress":
      return { ...state, progress: action.progress };
    case "cache-status":
      // Ignore a stale check that resolves after the load already
      // settled — e.g. a small/cached model can reach "ready" before the
      // (concurrently-fired, non-blocking) cache check resolves. Once
      // terminal, cacheStatus for the current load is already implied
      // (ready always means it finished downloading-or-was-cached), so a
      // late flip to "downloading" here would be misleading, not useful.
      if (state.status !== "loading") {
        return state;
      }
      return { ...state, cacheStatus: action.cacheStatus };
    case "ready":
      return { ...state, status: "ready", progress: 1, error: null };
    case "error":
      // Deliberately keeps the current cacheStatus (unlike "unsupported"
      // below, which resets it to "idle") — an error happens mid-load,
      // after cacheStatus was already meaningfully "checking"/"cached"/
      // "downloading" for this attempt, whereas "unsupported" short-
      // circuits before a load — and therefore a cache check — ever
      // started.
      return { ...state, status: "error", error: action.error };
    case "unsupported":
      return {
        status: "unsupported",
        progress: 0,
        error: action.error,
        cacheStatus: "idle",
      };
  }
}

export interface GenerationState {
  isGenerating: boolean;
  generationError: Error | null;
}

export interface UseBrowserLLMResult extends ModelLoadState, GenerationState {
  generate(messages: ChatMessage[]): Promise<string>;
  streamGenerate(
    messages: ChatMessage[],
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
export function useBrowserLLM(modelId: string | undefined): UseBrowserLLMResult {
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
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    let unsubscribeCrash: (() => void) | null = null;

    const clearWatchdog = () => {
      if (watchdog !== null) {
        clearTimeout(watchdog);
        watchdog = null;
      }
    };

    const resetWatchdog = () => {
      clearWatchdog();
      watchdog = setTimeout(() => {
        if (!cancelled) {
          // Terminate rather than just dispatch: a still-pending
          // loadModel()/progress callback from this (likely dead) worker
          // could otherwise resolve or tick *after* this error dispatch,
          // flapping the status back to "ready" or "loading". Terminating
          // means any further postMessage from/to it is silently dropped,
          // so no such late callback can fire.
          clientRef.current?.terminate();
          clientRef.current = null;
          dispatch({
            type: "error",
            error: new WorkerCrashError(
              `no progress for ${LOAD_INACTIVITY_TIMEOUT_MS / 1000}s — the worker may have been killed by the browser (e.g. out of memory)`,
            ),
          });
        }
      }, LOAD_INACTIVITY_TIMEOUT_MS);
    };

    // Terminate any previous client before starting a new load. MLCEngine
    // has no API to abort an in-flight reload() and overlapping reloads on
    // one engine are unspecified, so a full terminate-and-recreate is the
    // only unambiguously correct way to cancel/replace a stale load.
    clientRef.current?.terminate();
    clientRef.current = null;

    void (async () => {
      // Capability check runs before any model-load attempt, and before
      // dispatching "loading" — an unsupported browser must short-circuit
      // straight to "unsupported", never passing through "loading".
      const support = await detectWebGPUSupport();
      if (cancelled) {
        return;
      }
      if (!support.supported) {
        dispatch({
          type: "unsupported",
          error: new UnsupportedError(support.reason),
        });
        return;
      }

      const client = createEngineClient();
      clientRef.current = client;
      dispatch({ type: "load-start" });
      resetWatchdog();

      unsubscribeCrash = client.onCrash((error) => {
        if (!cancelled) {
          clearWatchdog();
          // Align with the watchdog's terminate-and-null discipline above
          // (a JS-error-event crash and a silent-hang timeout are both
          // "this worker is dead now" — treat them the same way).
          clientRef.current?.terminate();
          clientRef.current = null;
          dispatch({ type: "error", error });
        }
      });

      client
        .loadModel(modelId, (report) => {
          if (!cancelled) {
            resetWatchdog();
            dispatch({ type: "progress", progress: report.progress });
          }
        })
        .then(() => {
          if (!cancelled) {
            clearWatchdog();
            dispatch({ type: "ready" });
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            clearWatchdog();
            dispatch({
              type: "error",
              error: err instanceof Error ? err : new Error(String(err)),
            });
          }
        });

      // Fired concurrently with loadModel, not awaited before it — this
      // is purely informational (for UI), no reason to delay the actual
      // download to find out whether it was needed. The reducer ignores
      // this action once status is no longer "loading" (e.g. a small
      // cached model can reach "ready" before this resolves).
      client
        .checkCache(modelId)
        .then((isCached) => {
          if (!cancelled) {
            dispatch({
              type: "cache-status",
              cacheStatus: isCached ? "cached" : "downloading",
            });
          }
        })
        .catch(() => {
          // Cache-check failure is not itself a load failure — loadModel's
          // own error handling above is the source of truth for that.
        });
    })();

    return () => {
      cancelled = true;
      clearWatchdog();
      unsubscribeCrash?.();
      clientRef.current?.terminate();
      clientRef.current = null;
    };
  }, [modelId]);

  const generate = useCallback(
    async (messages: ChatMessage[]): Promise<string> => {
      if (statusRef.current !== "ready" || !clientRef.current) {
        throw new HookNotReadyError();
      }
      if (isGeneratingRef.current) {
        throw new HookBusyError();
      }

      // Captured by identity so the timeout below only acts if this is
      // still the active client — otherwise a slow timeout firing after a
      // newer load already replaced clientRef (e.g. the consumer changed
      // modelId to recover) would wrongly terminate the NEW client and
      // dispatch a stale error over the newer load's state.
      const client = clientRef.current;
      isGeneratingRef.current = true;
      setIsGenerating(true);
      setGenerationError(null);

      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      // Boxed in an object rather than a bare `let` — TypeScript's control
      // flow analysis can incorrectly narrow a `let` reassigned inside a
      // nested closure to `never` at later use sites; a mutable object
      // property sidesteps that.
      const crashSub: { unsubscribe: (() => void) | null } = {
        unsubscribe: null,
      };

      try {
        return await new Promise<string>((resolve, reject) => {
          // A crash/timeout here means "the worker is actually dead" — the
          // load effect's own onCrash listener (subscribed for the whole
          // effect lifetime, not just during a load) already dispatches
          // {type:"error"} on the reducer for ANY crash, so `status`
          // already transitions correctly regardless of whether a
          // generate() call happens to be in flight. This local subscribe
          // exists only so THIS call's promise settles immediately too,
          // instead of hanging until the timeout below fires up to
          // GENERATE_TIMEOUT_MS later.
          crashSub.unsubscribe = client.onCrash((error) => {
            if (settled) {
              return;
            }
            settled = true;
            reject(error);
          });

          timeoutId = setTimeout(() => {
            if (settled) {
              return;
            }
            settled = true;
            const error = new WorkerCrashError(
              `no response for ${GENERATE_TIMEOUT_MS / 1000}s — the worker may have been killed by the browser (e.g. out of memory)`,
            );
            // Dispatch on the reducer HERE, not in the generic catch below
            // — the catch must not branch on error type (a normal
            // generation failure, e.g. a content-policy rejection from the
            // engine, must NOT transition status away from "ready"; only
            // this timeout and onCrash represent "the worker is actually
            // dead" and should transition it). Captured-by-identity: only
            // act if this is still the active client, so a newer load
            // can't be stomped by a stale timeout.
            if (clientRef.current === client) {
              clientRef.current = null;
              client.terminate();
              dispatch({ type: "error", error });
            }
            reject(error);
          }, GENERATE_TIMEOUT_MS);

          // The "loser" of the race (client.generate() itself, once the
          // timeout/crash above has already settled the promise) still
          // needs a handler here — otherwise its eventual rejection (the
          // dead client's call failing once terminated) would be
          // unhandled. Checking `settled` first means we handle it
          // without acting on it twice.
          client.generate(messages).then(
            (result) => {
              if (!settled) {
                settled = true;
                resolve(result);
              }
            },
            (err: unknown) => {
              if (!settled) {
                settled = true;
                reject(err instanceof Error ? err : new Error(String(err)));
              }
            },
          );
        });
      } catch (err) {
        // Deliberately does not branch on error type/instanceof — every
        // generate() failure sets generationError, but only the timeout
        // and onCrash paths above (or the load effect's own watchdog)
        // transition the overall `status`. See the comments above.
        const error = err instanceof Error ? err : new Error(String(err));
        setGenerationError(error);
        throw error;
      } finally {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
        crashSub.unsubscribe?.();
        isGeneratingRef.current = false;
        setIsGenerating(false);
      }
    },
    [],
  );

  const streamGenerate = useCallback(
    (messages: ChatMessage[]): AsyncGenerator<string, void, void> =>
      streamGenerateImpl(
        statusRef,
        clientRef,
        isGeneratingRef,
        setIsGenerating,
        setGenerationError,
        dispatch,
        messages,
      ),
    [],
  );

  const abort = useCallback(() => {
    // Deliberately does NOT also fire streamGenerate()'s internal
    // AbortController here: with a live worker, client.abort() below
    // (interruptGenerate()) ends the stream gracefully — no error, the
    // `for await` loop just stops yielding. Forcing the controller
    // unconditionally would turn every normal, healthy cancel into a
    // thrown WorkerCrashError instead, regressing that existing contract.
    // The one edge case this doesn't cover — the worker already silently
    // dead at the exact moment abort() is called — is still bounded by
    // streamGenerateImpl's own inactivity watchdog (fires within
    // STREAM_INACTIVITY_TIMEOUT_MS regardless), not a permanent hang.
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
  dispatch: (action: Action) => void,
  messages: ChatMessage[],
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

  // Local to this call — not exposed to the outer hook's abort(), which
  // deliberately relies on the existing graceful client.abort() path
  // instead (see abort()'s comment). This controller exists purely so the
  // watchdog below can unstick a suspended `for await` on a dead worker.
  const controller = new AbortController();

  let watchdog: ReturnType<typeof setTimeout> | null = null;
  const clearWatchdog = () => {
    if (watchdog !== null) {
      clearTimeout(watchdog);
      watchdog = null;
    }
  };
  const resetWatchdog = () => {
    clearWatchdog();
    watchdog = setTimeout(() => {
      const error = new WorkerCrashError(
        `no token for ${STREAM_INACTIVITY_TIMEOUT_MS / 1000}s — the worker may have been killed by the browser (e.g. out of memory)`,
      );
      // Unconditional: this unsticks THIS call's suspended `for await`
      // regardless of whether `client` is still the active one — if a
      // newer load already replaced it (e.g. a modelId change terminated
      // this client without an onCrash event, since terminate() fires no
      // error), the local generator would otherwise hang forever and keep
      // isGeneratingRef stuck true. Only the terminate/dispatch/clientRef
      // side effects below are captured-by-identity, same reasoning as
      // generate()'s timeout, so a newer load can't be stomped by a stale
      // watchdog.
      controller.abort(error);
      if (clientRef.current === client) {
        clientRef.current = null;
        client.terminate();
        dispatch({ type: "error", error });
      }
    }, STREAM_INACTIVITY_TIMEOUT_MS);
  };

  // Same reasoning as generate()'s onCrash subscription: the load effect's
  // own onCrash listener already dispatches {type:"error"} on the reducer
  // for any crash regardless of what's in flight, so this only needs to
  // unstick THIS suspended `for await` immediately, rather than waiting
  // up to STREAM_INACTIVITY_TIMEOUT_MS for the watchdog to notice.
  const unsubscribeCrash = client.onCrash((error) => {
    controller.abort(error);
  });

  try {
    resetWatchdog();
    const tokens = toAsyncGenerator(
      (onToken) => client.streamGenerate(messages, onToken),
      controller.signal,
    );
    for await (const token of tokens) {
      resetWatchdog();
      yield token;
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    setGenerationError(error);
    throw error;
  } finally {
    clearWatchdog();
    unsubscribeCrash();
    isGeneratingRef.current = false;
    setIsGenerating(false);
    // Always signal the worker to stop, whether we finished naturally or
    // the consumer `break`s out of a `for await` early — interruptGenerate()
    // on an already-finished generation is a harmless no-op, but skipping
    // this on early exit would leave the worker's inference loop (and GPU
    // compute) running unattended. A rejection here means the worker is
    // already gone (e.g. a modelId change terminated it mid-stream, or the
    // watchdog above already terminated it), which isn't an error from the
    // caller's perspective.
    client.abort().catch(() => {});
  }
}
