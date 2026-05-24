const PATCH_MARKER = "__anyJumperDeepSeekReasoningRoundTripPatched";

type AnyRecord = Record<string, any>;
type CompletionRequest = { messages?: unknown };
type CompletionModel = {
  completions?: AnyRecord & {
    completionWithRetry?: (...args: any[]) => unknown;
    _generate?: (...args: any[]) => unknown;
    _streamResponseChunks?: (...args: any[]) => AsyncGenerator<unknown>;
  };
};

export function addDeepSeekReasoningContentToCompletionsMessages(
  requestMessages: unknown,
  sourceMessages?: unknown[],
) {
  if (!Array.isArray(requestMessages)) return;
  requestMessages.forEach((message, index) => {
    const requestMessage = asRecord(message);
    if (!requestMessage || requestMessage.role !== "assistant") return;
    if (hasOwn(requestMessage, "reasoning_content")) return;
    requestMessage.reasoning_content = reasoningContentFromMessage(sourceMessages?.[index]) ?? "";
  });
}

export function enableDeepSeekReasoningRoundTrip<T extends CompletionModel>(model: T): T {
  const completions = model.completions;
  if (!completions || completions[PATCH_MARKER] || typeof completions.completionWithRetry !== "function") {
    return model;
  }

  let activeSourceMessages: unknown[] | undefined;
  const originalCompletionWithRetry = completions.completionWithRetry.bind(completions);
  completions.completionWithRetry = (request: CompletionRequest, ...rest: any[]) => {
    addDeepSeekReasoningContentToCompletionsMessages(request?.messages, activeSourceMessages);
    return originalCompletionWithRetry(request, ...rest);
  };

  if (typeof completions._generate === "function") {
    const originalGenerate = completions._generate.bind(completions);
    completions._generate = (messages: unknown[], ...rest: any[]) => {
      const previous = activeSourceMessages;
      activeSourceMessages = Array.isArray(messages) ? messages : undefined;
      const result = originalGenerate(messages, ...rest);
      if (isPromiseLike(result)) {
        return result.finally(() => {
          activeSourceMessages = previous;
        });
      }
      activeSourceMessages = previous;
      return result;
    };
  }

  if (typeof completions._streamResponseChunks === "function") {
    const originalStreamResponseChunks = completions._streamResponseChunks.bind(completions);
    completions._streamResponseChunks = async function* (messages: unknown[], ...rest: any[]) {
      const previous = activeSourceMessages;
      activeSourceMessages = Array.isArray(messages) ? messages : undefined;
      try {
        yield* originalStreamResponseChunks(messages, ...rest);
      } finally {
        activeSourceMessages = previous;
      }
    };
  }

  completions[PATCH_MARKER] = true;
  return model;
}

function reasoningContentFromMessage(message: unknown) {
  const record = asRecord(message);
  if (!record) return undefined;
  const direct = stringProperty(record, "reasoning_content");
  if (direct !== undefined) return direct;
  const camel = stringProperty(record, "reasoningContent");
  if (camel !== undefined) return camel;
  const additional = asRecord(record.additional_kwargs ?? record.additionalKwargs);
  return stringProperty(additional, "reasoning_content");
}

function stringProperty(record: AnyRecord | undefined, key: string) {
  if (!record || !hasOwn(record, key)) return undefined;
  const value = record[key];
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
}

function asRecord(value: unknown): AnyRecord | undefined {
  return value && typeof value === "object" ? value as AnyRecord : undefined;
}

function hasOwn(record: AnyRecord, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return Boolean(value && typeof (value as Promise<unknown>).finally === "function");
}
