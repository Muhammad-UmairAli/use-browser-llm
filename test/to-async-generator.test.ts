import { describe, expect, it } from "vitest";
import { toAsyncGenerator } from "../src/to-async-generator.js";

async function collect(gen: AsyncGenerator<string, void, void>) {
  const values: string[] = [];
  for await (const value of gen) {
    values.push(value);
  }
  return values;
}

describe("toAsyncGenerator", () => {
  it("yields tokens pushed before run's promise resolves", async () => {
    const gen = toAsyncGenerator(async (onToken) => {
      onToken("a");
      onToken("b");
      onToken("c");
    });

    expect(await collect(gen)).toEqual(["a", "b", "c"]);
  });

  it("yields a token pushed synchronously before any await, without loss", async () => {
    // Regression guard: run()'s executor fires onToken before the .then()
    // chain below it has attached — the queue must still catch it.
    const gen = toAsyncGenerator((onToken) => {
      onToken("immediate");
      return Promise.resolve();
    });

    expect(await collect(gen)).toEqual(["immediate"]);
  });

  it("yields tokens that arrive across separate microtask ticks", async () => {
    const gen = toAsyncGenerator(async (onToken) => {
      onToken("first");
      await new Promise((resolve) => setTimeout(resolve, 0));
      onToken("second");
    });

    expect(await collect(gen)).toEqual(["first", "second"]);
  });

  it("propagates a rejection from run() as a thrown error on the generator", async () => {
    const gen = toAsyncGenerator(async () => {
      throw new Error("run failed");
    });

    await expect(collect(gen)).rejects.toThrow("run failed");
  });

  it("does not lose already-queued tokens even if run() then rejects", async () => {
    const gen = toAsyncGenerator(async (onToken) => {
      onToken("before-failure");
      throw new Error("run failed");
    });

    const values: string[] = [];
    await expect(
      (async () => {
        for await (const value of gen) {
          values.push(value);
        }
      })(),
    ).rejects.toThrow("run failed");
    expect(values).toEqual(["before-failure"]);
  });
});
