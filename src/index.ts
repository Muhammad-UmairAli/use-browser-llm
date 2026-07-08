export const USE_LOCAL_LLM_VERSION = "0.1.0";

// Public API surface. useLocalLLM() now covers model-loading state
// (P1-04), generate/streamGenerate/abort (P1-05), the unsupported-browser
// fallback path (P1-07), and cache-status exposure (P1-06).
export {
  useLocalLLM,
  type CacheStatus,
  type GenerationState,
  type ModelLoadState,
  type ModelLoadStatus,
  type UseLocalLLMResult,
} from "./use-local-llm.js";
export {
  HookBusyError,
  HookNotReadyError,
  UnsupportedError,
  WorkerCrashError,
} from "./errors.js";
export { type ChatMessage, type ChatRole } from "./types.js";
