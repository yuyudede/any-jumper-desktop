export interface ModelOutputParts {
  content: string;
  reasoning: string;
}

export function extractModelOutputParts(chunk: unknown): ModelOutputParts {
  const record = asRecord(chunk);
  const content = extractContentValue(record?.content);
  const reasoning = uniqueTextParts([
    content.reasoning,
    ...extractReasoningCandidates(chunk),
    ...extractReasoningCandidates(readProperty(record, "contentBlocks")),
  ]).join("");

  return {
    content: content.content,
    reasoning,
  };
}

export function stripExposedThinking(text: string): ModelOutputParts {
  if (!text) return { content: "", reasoning: "" };
  let reasoning = "";
  const content = text.replace(/<think>([\s\S]*?)<\/think>/gi, (_match, captured) => {
    reasoning += captured;
    return "";
  });
  return { content, reasoning };
}

function extractContentValue(value: unknown): ModelOutputParts {
  if (typeof value === "string") return stripExposedThinking(value);
  if (!Array.isArray(value)) return { content: "", reasoning: "" };
  let content = "";
  let reasoning = "";
  for (const part of value) {
    if (typeof part === "string") {
      const stripped = stripExposedThinking(part);
      content += stripped.content;
      reasoning += stripped.reasoning;
      continue;
    }
    const record = asRecord(part);
    const type = stringValue(record?.type).toLowerCase();
    if (isReasoningBlockType(type)) {
      reasoning += reasoningTextFromRecord(record);
      continue;
    }
    const text = stringValue(record?.text ?? record?.content ?? record?.output_text);
    const stripped = stripExposedThinking(text);
    content += stripped.content;
    reasoning += stripped.reasoning;
  }
  return { content, reasoning };
}

function extractReasoningCandidates(value: unknown, depth = 0, seen = new Set<object>()): string[] {
  if (depth > 5 || value === undefined || value === null) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractReasoningCandidates(item, depth + 1, seen));
  }
  const record = asRecord(value);
  if (!record) return [];
  if (seen.has(record)) return [];
  seen.add(record);

  const type = stringValue(record.type).toLowerCase();
  const direct = [
    stringValue(record.reasoning_content),
    stringValue(record.reasoningContent),
    isReasoningBlockType(type) ? reasoningTextFromRecord(record) : stringValue(record.reasoning),
    stringValue(record.thinking),
    extractReasoningSummary(record.summary),
  ];

  const nestedKeys = [
    "content",
    "contentBlocks",
    "additional_kwargs",
    "response_metadata",
    "raw_response",
    "output",
    "choices",
    "delta",
    "message",
    "reasoning",
    "kwargs",
    "lc_kwargs",
  ];

  return uniqueTextParts([
    ...direct,
    ...nestedKeys.flatMap((key) => extractReasoningCandidates(readProperty(record, key), depth + 1, seen)),
  ]);
}

function reasoningTextFromRecord(record: Record<string, unknown> | undefined) {
  if (!record) return "";
  return stringValue(record.reasoning ?? record.thinking ?? record.text ?? record.content)
    || extractReasoningSummary(record.summary);
}

function extractReasoningSummary(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      const record = asRecord(item);
      return stringValue(record?.text ?? record?.content ?? item);
    })
    .filter(Boolean)
    .join("");
}

function isReasoningBlockType(type: string) {
  return type === "reasoning" || type === "thinking" || type === "thinking_delta" || type === "redacted_thinking";
}

function uniqueTextParts(parts: string[]) {
  const seen = new Set<string>();
  return parts.filter((part) => {
    if (!part || seen.has(part)) return false;
    seen.add(part);
    return true;
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function readProperty(record: Record<string, unknown> | undefined, key: string) {
  if (!record) return undefined;
  try {
    return record[key];
  } catch {
    return undefined;
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
