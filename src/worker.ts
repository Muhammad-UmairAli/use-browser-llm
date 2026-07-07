// Placeholder worker entry. Task P1-03 wires this up to @mlc-ai/web-llm via
// Comlink.expose(); this task only proves the worker chunk builds separately
// from the main entry and is loadable as a module worker.
export const WORKER_READY = true as const;
