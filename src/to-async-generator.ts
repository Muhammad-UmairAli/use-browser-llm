/**
 * Bridges a callback-driven async operation (call `run(onToken)`, `onToken`
 * fires zero or more times before `run`'s returned promise settles) into an
 * AsyncGenerator, so consumers can `for await (const token of ...)` instead
 * of passing a callback.
 *
 * Tokens are queued as they arrive and drained before awaiting the next
 * one, so a token pushed before anything is "listening" (e.g. synchronously
 * inside `run`) is never lost.
 *
 * `signal` lets a caller unstick a suspended iteration from the outside —
 * necessary because if `run`'s underlying operation dies silently (e.g. a
 * terminated Worker whose in-flight call will never respond), nothing ever
 * calls `resolveNext` or settles `run`'s promise, and the generator would
 * otherwise hang on its internal await forever. Without a signal, there is
 * no way to distinguish "still legitimately waiting" from "permanently
 * abandoned" from outside this function.
 */
export async function* toAsyncGenerator(
  run: (onToken: (token: string) => void) => Promise<void>,
  signal?: AbortSignal,
): AsyncGenerator<string, void, void> {
  const queue: string[] = [];
  let resolveNext: (() => void) | null = null;
  let done = false;
  let error: unknown = null;

  const onAbort = () => {
    if (!done) {
      error = signal?.reason ?? new Error("aborted");
      done = true;
      resolveNext?.();
      resolveNext = null;
    }
  };
  signal?.addEventListener("abort", onAbort);

  run((token) => {
    queue.push(token);
    resolveNext?.();
    resolveNext = null;
  }).then(
    () => {
      if (!done) {
        done = true;
        resolveNext?.();
        resolveNext = null;
      }
    },
    (err: unknown) => {
      if (!done) {
        error = err;
        done = true;
        resolveNext?.();
        resolveNext = null;
      }
    },
  );

  try {
    while (true) {
      while (queue.length > 0) {
        yield queue.shift()!;
      }
      if (done) {
        if (error) {
          throw error;
        }
        return;
      }
      await new Promise<void>((resolve) => {
        resolveNext = resolve;
      });
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}
