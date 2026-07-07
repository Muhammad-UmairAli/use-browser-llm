export const USE_LOCAL_LLM_VERSION = "0.1.0";

// Public API surface. useLocalLLM() currently covers only model-loading
// state (P1-04) — generate/streamGenerate (P1-05), cache-status (P1-06),
// and the unsupported-browser path (P1-07) extend it in later tasks.
export {
  useLocalLLM,
  type ModelLoadState,
  type ModelLoadStatus,
  type UseLocalLLMResult,
} from "./use-local-llm.js";
