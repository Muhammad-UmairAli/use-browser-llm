import { afterEach, describe, expect, it, vi } from "vitest";
import { detectWebGPUSupport } from "../src/detect-webgpu.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("detectWebGPUSupport", () => {
  it("reports no-navigator-gpu when navigator.gpu is absent", async () => {
    vi.stubGlobal("navigator", {});

    const result = await detectWebGPUSupport();

    expect(result).toEqual({ supported: false, reason: "no-navigator-gpu" });
  });

  it("reports no-adapter when requestAdapter resolves null", async () => {
    vi.stubGlobal("navigator", {
      gpu: { requestAdapter: vi.fn().mockResolvedValue(null) },
    });

    const result = await detectWebGPUSupport();

    expect(result).toEqual({ supported: false, reason: "no-adapter" });
  });

  it("reports no-adapter when requestAdapter rejects", async () => {
    vi.stubGlobal("navigator", {
      gpu: {
        requestAdapter: vi.fn().mockRejectedValue(new Error("boom")),
      },
    });

    const result = await detectWebGPUSupport();

    expect(result).toEqual({ supported: false, reason: "no-adapter" });
  });

  it("reports fallback-adapter when the adapter is software-only", async () => {
    vi.stubGlobal("navigator", {
      gpu: {
        requestAdapter: vi
          .fn()
          .mockResolvedValue({ info: { isFallbackAdapter: true } }),
      },
    });

    const result = await detectWebGPUSupport();

    expect(result).toEqual({ supported: false, reason: "fallback-adapter" });
  });

  it("reports supported when a real adapter is available", async () => {
    vi.stubGlobal("navigator", {
      gpu: {
        requestAdapter: vi
          .fn()
          .mockResolvedValue({ info: { isFallbackAdapter: false } }),
      },
    });

    const result = await detectWebGPUSupport();

    expect(result).toEqual({ supported: true });
  });
});
