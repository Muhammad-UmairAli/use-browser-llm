/**
 * Public message shape for generate()/streamGenerate() — deliberately a
 * narrower, self-contained re-declaration of the common case from
 * @mlc-ai/web-llm's ChatCompletionMessageParam (system/user/assistant with
 * plain string content), not an import of it. Importing web-llm's type
 * directly would put `@mlc-ai/web-llm` in this package's public .d.ts
 * output, which the package's own architecture rule (only worker.ts ever
 * references web-llm at the type OR value level) exists to prevent.
 *
 * This covers the vast majority of real usage (see README). It's
 * structurally assignable to ChatCompletionMessageParam[] wherever this
 * package passes messages into the real engine, so nothing is lost at the
 * call site — a consumer just doesn't see web-llm's richer (tool-call,
 * image-content-part) variants reflected in their editor, since this
 * package doesn't expose them.
 */
export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}
