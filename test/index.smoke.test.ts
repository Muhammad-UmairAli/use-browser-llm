import { describe, expect, it } from "vitest";
import { USE_BROWSER_LLM_VERSION, useBrowserLLM } from "../src/index.js";

describe("package scaffolding smoke test", () => {
  it("exports a version string", () => {
    expect(USE_BROWSER_LLM_VERSION).toBe("0.1.0");
  });

  it("exports useBrowserLLM as a function", () => {
    expect(typeof useBrowserLLM).toBe("function");
  });
});
