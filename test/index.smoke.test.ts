import { describe, expect, it } from "vitest";
import { USE_LOCAL_LLM_VERSION, useLocalLLM } from "../src/index.js";

describe("package scaffolding smoke test", () => {
  it("exports a version string", () => {
    expect(USE_LOCAL_LLM_VERSION).toBe("0.1.0");
  });

  it("exports useLocalLLM as a callable placeholder", () => {
    expect(() => useLocalLLM()).toThrow("not implemented yet");
  });
});
