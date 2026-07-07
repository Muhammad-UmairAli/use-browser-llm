import { afterEach, describe, expect, it, vi } from "vitest";
import { createEngineClient } from "../src/engine-client.js";

class MockWorker {
  static instances: MockWorker[] = [];
  url: string;
  options: WorkerOptions | undefined;
  terminated = false;
  listeners: Array<(event: MessageEvent) => void> = [];

  constructor(url: string | URL, options?: WorkerOptions) {
    this.url = String(url);
    this.options = options;
    MockWorker.instances.push(this);
  }

  postMessage(): void {
    // No calls are made in this test — Comlink.wrap() only sets up
    // listeners at construction time, it doesn't message the worker yet.
  }

  addEventListener(_type: string, listener: (event: MessageEvent) => void) {
    this.listeners.push(listener);
  }

  removeEventListener(): void {}

  terminate(): void {
    this.terminated = true;
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
});
