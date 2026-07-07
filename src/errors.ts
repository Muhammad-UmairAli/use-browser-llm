export class HookNotReadyError extends Error {
  constructor() {
    super("useLocalLLM: cannot generate before the model is ready");
    this.name = "HookNotReadyError";
  }
}

export class HookBusyError extends Error {
  constructor() {
    super("useLocalLLM: a generation is already in progress");
    this.name = "HookBusyError";
  }
}
