export type WebGPUSupportResult =
  | { supported: true }
  | {
      supported: false;
      reason: "no-navigator-gpu" | "no-adapter" | "fallback-adapter";
    };

/**
 * Detects whether the current browser/device can run WebGPU-backed
 * inference. Necessarily async — `navigator.gpu.requestAdapter()` is a
 * Promise — even though it takes no other async dependency and should be
 * called once, up front, before any model load is attempted.
 *
 * A fallback (software) adapter is treated as unsupported: it exists but
 * delivers unusably slow LLM inference, so surfacing it as "supported"
 * would be misleading for this package's purpose.
 */
export async function detectWebGPUSupport(): Promise<WebGPUSupportResult> {
  if (typeof navigator === "undefined" || !("gpu" in navigator)) {
    return { supported: false, reason: "no-navigator-gpu" };
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return { supported: false, reason: "no-adapter" };
    }
    if (adapter.info.isFallbackAdapter) {
      return { supported: false, reason: "fallback-adapter" };
    }
    return { supported: true };
  } catch {
    return { supported: false, reason: "no-adapter" };
  }
}
