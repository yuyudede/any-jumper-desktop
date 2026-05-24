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
  reasoningByToolCallId = new Map<string, string>(),
) {
  if (!Array.isArray(requestMessages)) return;
  requestMessages.forEach((message, index) => {
    const requestMessage = asRecord(message);
    if (!requestMessage || requestMessage.role !== "assistant") return;
    if (hasOwn(requestMessage, "reasoning_content")) return;
    const toolCallReasoning = toolCallIdsFromMessage(requestMessage)
      .map((id) => reasoningByToolCallId.has(id) ? reasoningByToolCallId.get(id) : undefined)
      .find((value) => value !== undefined);
    requestMessage.reasoning_content = reasoningContentFromMessage(sourceMessages?.[index]) ?? toolCallReasoning ?? "";
  });
}

export function enableDeepSeekReasoningRoundTrip<T extends CompletionModel>(model: T): T {
  const completions = model.completions;
  if (!completions || completions[PATCH_MARKER] || typeof completions.completionWithRetry !== "function") {
    return model;
  }

  let activeSourceMessages: unknown[] | undefined;
  const reasoningByToolCallId = new Map<string, string>();
  const originalCompletionWithRetry = completions.completionWithRetry.bind(completions);
  completions.completionWithRetry = (request: CompletionRequest, ...rest: any[]) => {
    addDeepSeekReasoningContentToCompletionsMessages(request?.messages, activeSourceMessages, reasoningByToolCallId);
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
      let responseReasoning = "";
      const responseToolCallIds = new Set<string>();
      try {
        for await (const chunk of originalStreamResponseChunks(messages, ...rest)) {
          const message = asRecord(chunk)?.message ?? chunk;
          responseReasoning += reasoningContentFromMessage(message) ?? "";
          for (const id of toolCallIdsFromMessage(message)) responseToolCallIds.add(id);
          yield chunk;
        }
      } finally {
        for (const id of responseToolCallIds) reasoningByToolCallId.set(id, responseReasoning);
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

function toolCallIdsFromMessage(message: unknown): string[] {
  const record = asRecord(message);
  if (!record) return [];
  const ids = [
    ...toolCallIdsFromArray(record.tool_calls),
    ...toolCallIdsFromArray(record.tool_call_chunks),
    ...toolCallIdsFromArray(asRecord(record.additional_kwargs)?.tool_calls),
    ...toolCallIdsFromArray(asRecord(record.additional_kwargs)?.tool_call_chunks),
    ...toolCallIdsFromArray(record.contentBlocks),
  ];
  return Array.from(new Set(ids));
}

function toolCallIdsFromArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = asRecord(item);
      return typeof record?.id === "string" ? record.id : undefined;
    })
    .filter((id): id is string => Boolean(id));
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
