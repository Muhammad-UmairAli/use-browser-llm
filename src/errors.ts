export class HookNotReadyError extends Error {
  constructor() {
    super("useBrowserLLM: cannot generate before the model is ready");
    this.name = "HookNotReadyError";
  }
}

export class HookBusyError extends Error {
  constructor() {
    super("useBrowserLLM: a generation is already in progress");
    this.name = "HookBusyError";
  }
}

export class UnsupportedError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(`useBrowserLLM: WebGPU is unsupported in this browser (${reason})`);
    this.name = "UnsupportedError";
    this.reason = reason;
  }
}

export class WorkerCrashError extends Error {
  constructor(message: string) {
    super(`useBrowserLLM: the worker crashed or stopped responding (${message})`);
    this.name = "WorkerCrashError";
  }
}
