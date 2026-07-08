import { afterEach, describe, expect, it, vi } from "vitest";
import { createEngineClient } from "../src/engine-client.js";
import { WorkerCrashError } from "../src/errors.js";

class MockWorker {
  static instances: MockWorker[] = [];
  url: string;
  options: WorkerOptions | undefined;
  terminated = false;
  listenersByType = new Map<string, Set<(event: unknown) => void>>();

  constructor(url: string | URL, options?: WorkerOptions) {
    this.url = String(url);
    this.options = options;
    MockWorker.instances.push(this);
  }

  postMessage(): void {
    // No calls are made in this test — Comlink.wrap() only sets up
    // listeners at construction time, it doesn't message the worker yet.
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    if (!this.listenersByType.has(type)) {
      this.listenersByType.set(type, new Set());
    }
    this.listenersByType.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: (event: unknown) => void) {
    this.listenersByType.get(type)?.delete(listener);
  }

  terminate(): void {
    this.terminated = true;
  }

  dispatch(type: string, event: unknown): void {
    for (const listener of this.listenersByType.get(type) ?? []) {
      listener(event);
    }
  }
}

afterEach(() => {
  MockWorker.instances = [];
  vi.unstubAllGlobals();
});

describe("createEngineClient", () => {
  it("loads the worker via new Worker(...), not a direct import", () => {
    vi.stubGlobal("Worker", MockWorker);

    createEngineClient();

    expect(MockWorker.instances).toHaveLength(1);
    const worker = MockWorker.instances[0]!;
    expect(worker.url).toContain("worker.js");
    expect(worker.options).toEqual({ type: "module" });
  });

  it("terminate() terminates the underlying worker, not just the proxy", () => {
    vi.stubGlobal("Worker", MockWorker);

    const client = createEngineClient();
    client.terminate();

    expect(MockWorker.instances[0]!.terminated).toBe(true);
  });

  describe("onCrash", () => {
    it("calls the listener with a WorkerCrashError on a worker error event", () => {
      vi.stubGlobal("Worker", MockWorker);
      const client = createEngineClient();
      const worker = MockWorker.instances[0]!;
      const listener = vi.fn();

      client.onCrash(listener);
      worker.dispatch("error", { message: "boom" });

      expect(listener).toHaveBeenCalledOnce();
      const error = listener.mock.calls[0]![0];
      expect(error).toBeInstanceOf(WorkerCrashError);
      expect(error.message).toContain("boom");
    });

    it("calls the listener with a WorkerCrashError on a messageerror event", () => {
      vi.stubGlobal("Worker", MockWorker);
      const client = createEngineClient();
      const worker = MockWorker.instances[0]!;
      const listener = vi.fn();

      client.onCrash(listener);
      worker.dispatch("messageerror", {});

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0]![0]).toBeInstanceOf(WorkerCrashError);
    });

    it("stops calling the listener after the returned unsubscribe is called", () => {
      vi.stubGlobal("Worker", MockWorker);
      const client = createEngineClient();
      const worker = MockWorker.instances[0]!;
      const listener = vi.fn();

      const unsubscribe = client.onCrash(listener);
      unsubscribe();
      worker.dispatch("error", { message: "boom" });

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
