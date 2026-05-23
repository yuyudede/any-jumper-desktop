const PROGRESS_CHATTER_PATTERNS = [
  /^让我(?:更深入地|先|来|继续|再|也)?(?:分析|检查|读取|查看|创建|更新|写|整理|确认|探索|搜索|梳理|生成|完成)/u,
  /^首先(?:创建|分析|检查|读取|查看|整理|确认)\b/u,
  /^现在(?:我)?(?:已经)?(?:有足够|开始|继续|读取|查看|分析|检查|更新|写|整理)\b/u,
  /^Now let me\b/i,
  /^Now I (?:have|will|can|need|should)\b/i,
  /^Let me (?:also |now )?(?:read|check|inspect|analyze|analyse|create|update|write|look|review|explore|search|complete)\b/i,
  /^I (?:now )?(?:have enough information|will|need to|should|can now)\b/i,
  /^First,? (?:I(?:'ll| will)|let me)\b/i,
  /^Step\s*\d+[:：][\s\S]*(?:读取|查看|检查|定位|分析|搜索|探索|确认|开始|准备|现在我|让我|let me|now)/iu,
  /^第\s*\d+\s*步[:：]?[\s\S]*(?:读取|查看|检查|定位|分析|搜索|探索|确认|开始|准备|现在我|让我)/u,
];

const ENGLISH_PROGRESS_STARTER =
  /Now let me\b|Now I (?:have|will|can|need|should)\b|Let me (?:also |now )?(?:read|check|inspect|analyze|analyse|create|update|write|look|review|explore|search|complete)\b|I (?:now )?(?:have enough information|will|need to|should|can now)\b|First,? (?:I(?:'ll| will)|let me)\b/gi;

const MARKDOWN_SEPARATOR = /-{3,}|\*{3,}|_{3,}/u;
const ANSWER_START_MARKERS = ["项目分析报告", "分析报告：", "综合分析报告", "# "];
const PROCESS_DETAILS_SUMMARY =
  /<summary>\s*(?:执行过程|执行日志|操作过程|调用过程|运行过程|Execution process|Execution log|Process log)\s*<\/summary>/iu;
const DETAILS_OPEN_PATTERN = /<details\b/i;
const DETAILS_CLOSE_TAG = "</details>";

export interface ProgressChatterStripResult {
  content: string;
  notes: string[];
}

export function stripProgressChatter(text: string): ProgressChatterStripResult {
  const notes: string[] = [];
  const kept: string[] = [];
  let inFence = false;

  for (const line of stripProcessDetailsBlocks(text).split(/\r?\n/)) {
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      kept.push(line);
      continue;
    }

    if (!inFence && isProgressChatterLine(line)) {
      const stripped = stripProgressChatterLine(line);
      notes.push(...stripped.notes);
      if (stripped.remainder) kept.push(stripped.remainder);
      continue;
    }

    kept.push(line);
  }

  return {
    content: trimAssistantContent(kept.join("\n"), notes.length > 0),
    notes,
  };
}

function stripProcessDetailsBlocks(text: string) {
  const kept: string[] = [];
  let inFence = false;
  let pendingDetails: string[] | undefined;

  function finishDetailsBlock(block: string) {
    if (!PROCESS_DETAILS_SUMMARY.test(block)) kept.push(block);
  }

  function processOutsideLine(line: string) {
    let rest = line;
    let pushedAnything = false;

    for (;;) {
      const startMatch = rest.match(DETAILS_OPEN_PATTERN);
      const start = startMatch?.index ?? -1;
      if (start < 0) {
        if (rest || !pushedAnything) kept.push(rest);
        return;
      }

      const prefix = rest.slice(0, start);
      if (prefix) {
        kept.push(prefix);
        pushedAnything = true;
      }

      rest = rest.slice(start);
      const closeIndex = rest.toLowerCase().indexOf(DETAILS_CLOSE_TAG);
      if (closeIndex < 0) {
        pendingDetails = [rest];
        return;
      }

      const closeEnd = closeIndex + DETAILS_CLOSE_TAG.length;
      finishDetailsBlock(rest.slice(0, closeEnd));
      pushedAnything = true;
      rest = rest.slice(closeEnd).trimStart();
      if (!rest) return;
    }
  }

  for (const line of text.split(/\r?\n/)) {
    if (pendingDetails) {
      const closeIndex = line.toLowerCase().indexOf(DETAILS_CLOSE_TAG);
      if (closeIndex < 0) {
        pendingDetails.push(line);
        continue;
      }

      const closeEnd = closeIndex + DETAILS_CLOSE_TAG.length;
      pendingDetails.push(line.slice(0, closeEnd));
      finishDetailsBlock(pendingDetails.join("\n"));
      pendingDetails = undefined;
      const tail = line.slice(closeEnd).trimStart();
      if (tail) processOutsideLine(tail);
      continue;
    }

    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      kept.push(line);
      continue;
    }

    if (inFence) {
      kept.push(line);
      continue;
    }

    processOutsideLine(line);
  }

  if (pendingDetails) kept.push(...pendingDetails);
  return kept.join("\n");
}

function isProgressChatterLine(line: string) {
  const normalized = normalizeProgressChatterLine(line);
  if (!normalized) return false;
  return PROGRESS_CHATTER_PATTERNS.some((pattern) => pattern.test(normalized));
}

function stripProgressChatterLine(line: string) {
  const boundary = findProgressBoundary(line);
  const progressPart = boundary
    ? line.slice(0, boundary.index)
    : line;
  const remainder = boundary
    ? line.slice(boundary.index + boundary.length).trimStart()
    : "";
  return {
    notes: splitProgressNotes(progressPart),
    remainder,
  };
}

function findProgressBoundary(line: string): { index: number; length: number } | undefined {
  const separator = line.match(MARKDOWN_SEPARATOR);
  const separatorIndex = separator?.index;
  const answerMarker = ANSWER_START_MARKERS
    .map((marker) => ({ marker, index: line.indexOf(marker) }))
    .filter((item) => item.index > 0)
    .sort((a, b) => a.index - b.index)[0];

  if (separatorIndex !== undefined && separatorIndex >= 0) {
    if (!answerMarker || separatorIndex <= answerMarker.index) {
      return { index: separatorIndex, length: separator?.[0].length ?? 0 };
    }
  }

  if (answerMarker) return { index: answerMarker.index, length: 0 };
  return undefined;
}

function splitProgressNotes(text: string) {
  const cleaned = text
    .replace(MARKDOWN_SEPARATOR, "")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .trim();
  if (!cleaned) return [];

  const starts = Array.from(cleaned.matchAll(ENGLISH_PROGRESS_STARTER))
    .map((match) => match.index ?? 0)
    .filter((index) => index >= 0);
  const indices = Array.from(new Set([0, ...starts.filter((index) => index > 0)])).sort((a, b) => a - b);

  return indices
    .map((index, position) => {
      const nextIndex = indices[position + 1] ?? cleaned.length;
      return cleaned.slice(index, nextIndex).trim();
    })
    .filter(Boolean);
}

function normalizeProgressChatterLine(line: string) {
  return line
    .trim()
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/^[-*]\s+/u, "")
    .trim();
}

function trimAssistantContent(content: string, removedProgress: boolean) {
  let next = content.trim();
  if (removedProgress) {
    next = next.replace(/^(?:-{3,}|\*{3,}|_{3,})\s*\n+/u, "").trim();
  }
  return next;
}
