# use-local-llm

A headless React hook for running Large Language Models locally in the
browser via WebGPU — no backend, no API keys, no data leaving the device.

Model inference runs inside a dedicated Web Worker (via
[`@mlc-ai/web-llm`](https://github.com/mlc-ai/web-llm)), so the main thread
and your UI never freeze during generation. Model weights are cached in
IndexedDB across sessions, so repeat visits skip the multi-gigabyte
re-download.

**This package ships no UI components and no styles — only a hook.** It is
deliberately headless so it stays lightweight and works with whatever
design system you already use (Tailwind, Shadcn, CSS Modules, plain CSS,
anything). You bring the chat bubble, the loading spinner, the button —
`useLocalLLM()` only gives you the state and the functions to drive them.

## Requirements

- React 18 or later
- A browser with [WebGPU](https://caniuse.com/webgpu) support — check the
  link for current browser coverage, since it's still expanding — see
  [Handling unsupported browsers](#handling-unsupported-browsers) below for
  what happens when it's missing

## Install

```sh
npm install use-local-llm
```

## Quickstart

```tsx
import { useState } from "react";
import { useLocalLLM } from "use-local-llm";

const MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLC";

export function App() {
  const { status, progress, generate, isGenerating } = useLocalLLM(MODEL_ID);
  const [reply, setReply] = useState("");

  if (status === "loading") {
    return <p>Loading model… {Math.round(progress * 100)}%</p>;
  }

  if (status === "error") {
    return <p>Something went wrong loading the model.</p>;
  }

  return (
    <div>
      <button
        disabled={status !== "ready" || isGenerating}
        onClick={async () => {
          const text = await generate([
            { role: "user", content: "Say hello in one short sentence." },
          ]);
          setReply(text);
        }}
      >
        {isGenerating ? "Generating…" : "Ask"}
      </button>
      <p>{reply}</p>
    </div>
  );
}
```

`useLocalLLM` takes a model id — any id from
[`prebuiltAppConfig.model_list`](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts)
in `@mlc-ai/web-llm` — or `undefined` if you don't want to load a model yet
(e.g. while the user is still picking one). `status` starts at `"idle"`,
moves to `"loading"` once a model id is provided, then to `"ready"` or
`"error"`. `generate()` only resolves once `status === "ready"`; calling it
earlier rejects immediately (see [Errors](#errors) below).

## Streaming generation

For token-by-token output, use `streamGenerate()` instead of `generate()`.
It returns an `AsyncGenerator`, so you consume it with `for await`:

```tsx
import { useState } from "react";
import { useLocalLLM } from "use-local-llm";

export function StreamingExample() {
  const { status, streamGenerate } = useLocalLLM(
    "Llama-3.2-1B-Instruct-q4f16_1-MLC",
  );
  const [text, setText] = useState("");

  async function handleAsk() {
    setText("");
    for await (const token of streamGenerate([
      { role: "user", content: "Write a haiku about the ocean." },
    ])) {
      setText((prev) => prev + token);
    }
  }

  return (
    <div>
      <button disabled={status !== "ready"} onClick={handleAsk}>
        Ask
      </button>
      <p>{text}</p>
    </div>
  );
}
```

Breaking out of the loop early (e.g. a `break` inside the `for await`)
still stops the underlying worker's inference — you don't need to call
`abort()` yourself in that case, though you can if you want to stop
generation from somewhere other than the loop itself (see below).

## Cancellation

Both `generate()` and `streamGenerate()` share one `abort()` function that
stops generation in the worker itself, not just the promise on the main
thread:

```tsx
import { useLocalLLM } from "use-local-llm";

export function CancellableExample() {
  const { status, streamGenerate, abort, isGenerating } = useLocalLLM(
    "Llama-3.2-1B-Instruct-q4f16_1-MLC",
  );

  async function handleAsk() {
    for await (const token of streamGenerate([
      { role: "user", content: "Tell me a long story." },
    ])) {
      console.log(token);
    }
  }

  return (
    <div>
      <button disabled={status !== "ready"} onClick={handleAsk}>
        Ask
      </button>
      <button disabled={!isGenerating} onClick={abort}>
        Stop
      </button>
    </div>
  );
}
```

`isGenerating` is `true` for the duration of any `generate()` or
`streamGenerate()` call, and only one can run at a time — calling either
while one is already in flight rejects with `HookBusyError` rather than
silently queuing or corrupting state.

## Handling unsupported browsers

When the browser has no usable WebGPU (missing entirely, no adapter, or
only a software fallback adapter), `status` resolves straight to
`"unsupported"` — it never passes through `"loading"`, and no worker is
ever created. Check for it and render your own fallback UI (this package
ships none):

```tsx
import { useLocalLLM } from "use-local-llm";

export function UnsupportedFallbackExample() {
  const { status } = useLocalLLM("Llama-3.2-1B-Instruct-q4f16_1-MLC");

  if (status === "unsupported") {
    return (
      <p>
        Your browser doesn't support the local AI features on this page. Try the
        latest Chrome or Edge.
      </p>
    );
  }

  // ...the rest of your component
  return null;
}
```

## Cache status

`cacheStatus` tells you whether the model was already downloaded in a
previous session, so you can show a different message for "instant load"
vs. "first-time multi-gigabyte download":

```tsx
const { cacheStatus } = useLocalLLM("Llama-3.2-1B-Instruct-q4f16_1-MLC");
// "idle" | "checking" | "cached" | "downloading"
```

`cacheStatus` is available before `status` reaches `"ready"`, but for a
model that loads very quickly it can stay at `"checking"` if the load
finishes before the cache check itself resolves — check `status` first for
anything load-gating; `cacheStatus` is informational.

## Errors

- `HookNotReadyError` — rejected by `generate()` (immediately) or thrown
  from `streamGenerate()`'s async generator (on its first iteration —
  generators are lazy, so the check runs when you start consuming it, not
  when you call the function) when called before `status === "ready"`.
- `HookBusyError` — same timing as above, when calling `generate()`/
  `streamGenerate()` while one is already in flight.
- `UnsupportedError` — the `error` value when `status === "unsupported"`;
  has a `.reason` field (`"no-navigator-gpu"` | `"no-adapter"` |
  `"fallback-adapter"`).
- `WorkerCrashError` — the `error` value when `status === "error"` and the
  cause was the worker crashing or becoming unresponsive, rather than a
  normal model-load failure.

All are exported from `use-local-llm` for `instanceof` checks.

## API reference

```ts
function useLocalLLM(modelId: string | undefined): {
  status: "idle" | "loading" | "ready" | "error" | "unsupported";
  progress: number; // 0-1, meaningful only while status === "loading"
  error: Error | null; // set for "error" and "unsupported"
  cacheStatus: "idle" | "checking" | "cached" | "downloading";
  isGenerating: boolean;
  generationError: Error | null;
  generate(messages: ChatMessage[]): Promise<string>;
  streamGenerate(messages: ChatMessage[]): AsyncGenerator<string, void, void>;
  abort(): void;
};

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};
```

`ChatMessage` is a plain, self-contained type — e.g.
`{ role: "user", content: "..." }` — not a re-export of
`@mlc-ai/web-llm`'s own message type, so this package's public API never
requires you to know anything about the underlying engine.

## License

MIT — see [LICENSE](./LICENSE).
