export const TRACE_THOUGHT_STORAGE_LIMIT = 2_000;
export const TRACE_THOUGHT_TRUNCATED_MARKER = "…（公开推理已截断）";

export interface TraceThoughtTextBlock {
  kind: "paragraph" | "truncation";
  text: string;
}

export function truncateTraceThoughtText(text: string, limit = TRACE_THOUGHT_STORAGE_LIMIT) {
  const normalized = normalizeTraceThoughtText(text);
  if (normalized.length <= limit) return { content: normalized, truncated: false };

  const contentLimit = Math.max(0, limit - TRACE_THOUGHT_TRUNCATED_MARKER.length);
  return {
    content: `${normalized.slice(0, contentLimit).trimEnd()}${TRACE_THOUGHT_TRUNCATED_MARKER}`,
    truncated: true,
  };
}

export function formatTraceThoughtText(text: string, maxBlockLength = 180): TraceThoughtTextBlock[] {
  const normalized = normalizeTraceThoughtText(text);
  if (!normalized) return [];

  const truncated = isTraceThoughtTruncated(normalized);
  const content = normalized.replaceAll(TRACE_THOUGHT_TRUNCATED_MARKER, "").trim();
  const blocks: TraceThoughtTextBlock[] = splitTraceThoughtParagraphs(content, maxBlockLength).map((paragraph) => ({
    kind: "paragraph" as const,
    text: paragraph,
  }));

  if (truncated) {
    blocks.push({
      kind: "truncation",
      text: "公开推理已截断，后续内容未保存。",
    });
  }

  return blocks;
}

export function isTraceThoughtTruncated(text: string) {
  return text.includes(TRACE_THOUGHT_TRUNCATED_MARKER);
}

function splitTraceThoughtParagraphs(text: string, maxBlockLength: number) {
  return text
    .replace(/\s+(?=(?:\d+|[一二三四五六七八九十]+)[.、)]\s*)/gu, "\n")
    .split(/\n+/)
    .flatMap((paragraph) => splitLongParagraph(paragraph.trim(), maxBlockLength))
    .filter(Boolean);
}

function splitLongParagraph(text: string, maxBlockLength: number) {
  const sentences = text.match(/[^。！？；;]+[。！？；;]?/gu) ?? [text];
  const paragraphs: string[] = [];
  let current = "";

  for (const sentence of sentences.map((item) => item.trim()).filter(Boolean)) {
    if (current && current.length + sentence.length + 1 > maxBlockLength) {
      paragraphs.push(current);
      current = "";
    }

    if (sentence.length > maxBlockLength) {
      if (current) {
        paragraphs.push(current);
        current = "";
      }
      paragraphs.push(...chunkLongText(sentence, maxBlockLength));
      continue;
    }

    current = current ? `${current} ${sentence}` : sentence;
  }

  if (current) paragraphs.push(current);
  return paragraphs;
}

function chunkLongText(text: string, maxBlockLength: number) {
  const chunks: string[] = [];
  let rest = text;

  while (rest.length > maxBlockLength) {
    const breakpoint = findSoftBreakpoint(rest, maxBlockLength);
    chunks.push(rest.slice(0, breakpoint).trimEnd());
    rest = rest.slice(breakpoint).trimStart();
  }

  if (rest) chunks.push(rest);
  return chunks;
}

function findSoftBreakpoint(text: string, maxBlockLength: number) {
  const window = text.slice(0, maxBlockLength + 1);
  const candidates = [window.lastIndexOf("，"), window.lastIndexOf(","), window.lastIndexOf(" ")];
  const breakpoint = Math.max(...candidates);
  return breakpoint > Math.floor(maxBlockLength * 0.45) ? breakpoint + 1 : maxBlockLength;
}

function normalizeTraceThoughtText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}
