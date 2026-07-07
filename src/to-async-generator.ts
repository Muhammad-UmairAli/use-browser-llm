/**
 * Bridges a callback-driven async operation (call `run(onToken)`, `onToken`
 * fires zero or more times before `run`'s returned promise settles) into an
 * AsyncGenerator, so consumers can `for await (const token of ...)` instead
 * of passing a callback.
 *
 * Tokens are queued as they arrive and drained before awaiting the next
 * one, so a token pushed before anything is "listening" (e.g. synchronously
 * inside `run`) is never lost.
 */
export async function* toAsyncGenerator(
  run: (onToken: (token: string) => void) => Promise<void>,
): AsyncGenerator<string, void, void> {
  const queue: string[] = [];
  let resolveNext: (() => void) | null = null;
  let done = false;
  let error: unknown = null;

  run((token) => {
    queue.push(token);
    resolveNext?.();
    resolveNext = null;
  }).then(
    () => {
      done = true;
      resolveNext?.();
      resolveNext = null;
    },
    (err: unknown) => {
      error = err;
      done = true;
      resolveNext?.();
      resolveNext = null;
    },
  );

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
}
