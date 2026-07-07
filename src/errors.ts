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

export class UnsupportedError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`useLocalLLM: WebGPU is unsupported in this browser (${reason})`);
    this.name = "UnsupportedError";
    this.reason = reason;
  }
}

export class WorkerCrashError extends Error {
  constructor(message: string) {
    super(`useLocalLLM: the worker crashed or stopped responding (${message})`);
    this.name = "WorkerCrashError";
  }
}
