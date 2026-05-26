import type {
  NormalizedUsageEvent,
  UsageModelSummary,
  UsageNormalizedTotals,
  UsageSessionModelSummary,
  UsageSessionSummary,
  UsageSource,
  UsageSummary,
} from "../types";

export type ExternalUsageEvent = NormalizedUsageEvent & {
  filePath: string;
  eventKey: string;
};

type ParsedClaudeUsage = ExternalUsageEvent & {
  stopReason?: string;
};

type TokenLike = {
  model?: unknown;
  inputTokens?: unknown;
  outputTokens?: unknown;
  totalTokens?: unknown;
  cacheCreationTokens?: unknown;
  cacheReadTokens?: unknown;
  input_tokens?: unknown;
  output_tokens?: unknown;
  total_tokens?: unknown;
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
  cache_creation_input_tokens?: unknown;
  cache_read_input_tokens?: unknown;
  cached_input_tokens?: unknown;
  input_token_details?: {
    cache_creation?: unknown;
    cache_read?: unknown;
  };
};

type TotalsInput = Partial<NormalizedUsageEvent> & Partial<UsageNormalizedTotals>;

export interface UsageTrendPoint {
  at: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

export interface UsageTrendAxisTick {
  pointIndex: number;
  at: number;
  position: number;
}

export interface UsageTrendYAxis {
  max: number;
  unitValue: number;
  unitLabel: string;
  ticks: Array<{ value: number; label: string }>;
}

const zeroTotals: UsageNormalizedTotals = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  totalTokens: 0,
  freshInputTokens: 0,
  realTotalTokens: 0,
  cacheHitRate: 0,
};

export function normalizeUsageTotals(input: TotalsInput | undefined): UsageNormalizedTotals {
  const inputTokens = safeToken(input?.inputTokens);
  const outputTokens = safeToken(input?.outputTokens);
  const cacheCreationTokens = safeToken(input?.cacheCreationTokens);
  const cacheReadTokens = safeToken(input?.cacheReadTokens);
  const totalTokens = safeToken(input?.totalTokens);
  const inputIncludesCacheRead = shouldDeductCacheRead(input);
  const freshInputTokens = inputIncludesCacheRead
    ? inputTokens >= cacheReadTokens
      ? inputTokens - cacheReadTokens
      : inputTokens
    : inputTokens;
  const computedRealTotalTokens = freshInputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;
  const realTotalTokens = totalTokens > 0 ? totalTokens : computedRealTotalTokens;
  const cacheBase = freshInputTokens + cacheCreationTokens + cacheReadTokens;
  return {
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    totalTokens,
    freshInputTokens,
    realTotalTokens,
    cacheHitRate: cacheBase > 0 ? cacheReadTokens / cacheBase : 0,
  };
}

export function summarizeUsage(events: NormalizedUsageEvent[]): UsageSummary {
  const totals = sumTotals(events);
  return {
    ...totals,
    eventCount: events.length,
    sessionCount: new Set(events.map((event) => event.sessionId || event.id)).size,
    modelCount: new Set(events.map((event) => `${event.source}:${event.providerId || event.providerKind || ""}:${event.model}`)).size,
  };
}

export function groupUsageByModel(events: NormalizedUsageEvent[]): UsageModelSummary[] {
  const groups = new Map<string, NormalizedUsageEvent[]>();
  for (const event of events) {
    const key = [
      event.source,
      event.providerKind || "",
      event.providerId || "",
      event.model || "",
      event.workspaceId || "",
    ].join("\u001f");
    groups.set(key, [...(groups.get(key) || []), event]);
  }
  return Array.from(groups.values())
    .map((group) => {
      const first = group[0];
      return {
        ...sumTotals(group),
        source: first.source,
        providerKind: first.providerKind,
        providerId: first.providerId,
        providerLabel: first.providerLabel,
        model: first.model,
        modelLabel: first.modelLabel,
        workspaceId: first.workspaceId,
        workspaceName: first.workspaceName,
        workspacePath: first.workspacePath,
        sessionCount: new Set(group.map((event) => event.sessionId || event.id)).size,
        eventCount: group.length,
      };
    })
    .sort((a, b) => b.realTotalTokens - a.realTotalTokens || a.model.localeCompare(b.model));
}

export function groupUsageBySession(events: NormalizedUsageEvent[]): UsageSessionSummary[] {
  const groups = new Map<string, NormalizedUsageEvent[]>();
  for (const event of events) {
    const key = [event.source, event.workspaceId || "", event.sessionId || event.id].join("\u001f");
    groups.set(key, [...(groups.get(key) || []), event]);
  }
  return Array.from(groups.values())
    .map((group) => {
      const first = group[0];
      const modelBreakdown = groupSessionModels(group);
      const primary = modelBreakdown[0];
      return {
        ...sumTotals(group),
        source: first.source,
        sessionId: first.sessionId,
        sessionTitle: first.sessionTitle,
        workspaceId: first.workspaceId,
        workspaceName: first.workspaceName,
        workspacePath: first.workspacePath,
        providerKind: primary?.providerKind || first.providerKind,
        providerId: primary?.providerId || first.providerId,
        providerLabel: primary?.providerLabel || first.providerLabel,
        primaryModel: primary?.model || first.model || "unknown",
        modelCount: modelBreakdown.length,
        modelBreakdown,
        eventCount: group.length,
        lastOccurredAt: Math.max(...group.map((event) => event.occurredAt || 0)),
      };
    })
    .sort((a, b) => (b.lastOccurredAt || 0) - (a.lastOccurredAt || 0));
}

export function buildUsageTrendPoints(
  events: NormalizedUsageEvent[],
  from?: number,
  to?: number,
  bucketCount?: number,
): UsageTrendPoint[] {
  const sorted = [...events]
    .filter((event) => Number.isFinite(event.occurredAt))
    .sort((a, b) => a.occurredAt - b.occurredAt);
  if (sorted.length === 0) return [];
  const min = from ?? sorted[0].occurredAt;
  const max = to ?? sorted[sorted.length - 1].occurredAt ?? min + 1;
  const count = Math.max(1, bucketCount ?? Math.min(36, Math.max(8, sorted.length)));
  const span = Math.max(1, max - min);
  const buckets = Array.from({ length: count }, (_, index) => ({
    at: min + span * (index / Math.max(1, count - 1)),
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheCreation: 0,
  }));
  for (const event of sorted) {
    if (event.occurredAt < min || event.occurredAt > max) continue;
    const index = Math.min(count - 1, Math.max(0, Math.floor(((event.occurredAt - min) / span) * count)));
    buckets[index].input += safeToken(event.inputTokens);
    buckets[index].output += safeToken(event.outputTokens);
    buckets[index].cacheRead += safeToken(event.cacheReadTokens);
    buckets[index].cacheCreation += safeToken(event.cacheCreationTokens);
  }
  return buckets;
}

export function buildUsageTrendAxisTicks(points: UsageTrendPoint[], maxTicks = 6): UsageTrendAxisTick[] {
  if (points.length === 0 || maxTicks <= 0) return [];
  if (points.length === 1 || maxTicks === 1) return [{ pointIndex: 0, at: points[0].at, position: 0 }];
  const start = points[0].at;
  const end = points[points.length - 1].at;
  const span = Math.max(1, end - start);
  if (span < hourMs) return buildIndexedUsageTrendAxisTicks(points, maxTicks);
  const interval = chooseTimeTickInterval(span, maxTicks);
  const ticks: UsageTrendAxisTick[] = [];
  for (
    let at = firstTimeTickAt(start, interval);
    at <= end + 1;
    at = nextTimeTickAt(at, interval)
  ) {
    const position = clamp((at - start) / span, 0, 1);
    ticks.push({
      pointIndex: Math.min(points.length - 1, Math.max(0, Math.round(position * (points.length - 1)))),
      at,
      position,
    });
  }
  return ticks.length > 0 ? ticks : buildIndexedUsageTrendAxisTicks(points, maxTicks);
}

function buildIndexedUsageTrendAxisTicks(points: UsageTrendPoint[], maxTicks: number): UsageTrendAxisTick[] {
  const tickCount = Math.min(maxTicks, points.length);
  const indexes = new Set<number>();
  for (let index = 0; index < tickCount; index += 1) {
    indexes.add(Math.round((index / Math.max(1, tickCount - 1)) * (points.length - 1)));
  }
  indexes.add(0);
  indexes.add(points.length - 1);
  return Array.from(indexes)
    .sort((a, b) => a - b)
    .map((pointIndex) => ({
      pointIndex,
      at: points[pointIndex].at,
      position: pointIndex / Math.max(1, points.length - 1),
    }));
}

export function buildUsageTrendYAxis(maxValue: number, tickCount = 5): UsageTrendYAxis {
  const unit = usageAxisUnit(maxValue);
  const max = niceAxisMax(maxValue);
  const count = Math.max(2, tickCount);
  const ticks = Array.from({ length: count }, (_, index) => {
    const value = (max / (count - 1)) * index;
    return {
      value,
      label: formatAxisTick(value / unit.value),
    };
  });
  return {
    max,
    unitValue: unit.value,
    unitLabel: unit.label,
    ticks,
  };
}

export function smoothUsageTrendPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${roundCoord(points[0].x)},${roundCoord(points[0].y)}`;
  const commands = [`M ${roundCoord(points[0].x)},${roundCoord(points[0].y)}`];
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const previous = points[index - 1] || current;
    const afterNext = points[index + 2] || next;
    const control1 = {
      x: current.x + (next.x - previous.x) / 6,
      y: current.y + (next.y - previous.y) / 6,
    };
    const control2 = {
      x: next.x - (afterNext.x - current.x) / 6,
      y: next.y - (afterNext.y - current.y) / 6,
    };
    const minY = Math.min(current.y, next.y);
    const maxY = Math.max(current.y, next.y);
    control1.y = clamp(control1.y, minY, maxY);
    control2.y = clamp(control2.y, minY, maxY);
    commands.push([
      "C",
      `${roundCoord(control1.x)},${roundCoord(control1.y)}`,
      `${roundCoord(control2.x)},${roundCoord(control2.y)}`,
      `${roundCoord(next.x)},${roundCoord(next.y)}`,
    ].join(" "));
  }
  return commands.join(" ");
}

function groupSessionModels(events: NormalizedUsageEvent[]): UsageSessionModelSummary[] {
  const groups = new Map<string, NormalizedUsageEvent[]>();
  for (const event of events) {
    const key = [event.providerKind || "", event.providerId || "", event.model || ""].join("\u001f");
    groups.set(key, [...(groups.get(key) || []), event]);
  }
  return Array.from(groups.values())
    .map((group) => {
      const first = group[0];
      return {
        ...sumTotals(group),
        source: first.source,
        providerKind: first.providerKind,
        providerId: first.providerId,
        providerLabel: first.providerLabel,
        model: first.model,
        modelLabel: first.modelLabel,
        eventCount: group.length,
      };
    })
    .sort((a, b) => b.realTotalTokens - a.realTotalTokens || a.model.localeCompare(b.model));
}

export function parseClaudeCodeUsageLine(
  line: string,
  context: { filePath: string; lineNumber: number },
): { event?: ExternalUsageEvent; error?: string } {
  const parsed = parseClaudeCodeUsageCandidate(line, context);
  if (parsed.event) return { event: parsed.event };
  return { error: parsed.error };
}

export function claudeCodeUsageEventsFromJsonl(content: string, filePath: string): {
  events: ExternalUsageEvent[];
  errors: string[];
} {
  const messages = new Map<string, ParsedClaudeUsage>();
  const errors: string[] = [];
  content.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const parsed = parseClaudeCodeUsageCandidate(line, { filePath, lineNumber: index + 1 });
    if (parsed.error) {
      errors.push(`${filePath}:${index + 1} ${parsed.error}`);
      return;
    }
    if (!parsed.event) return;
    const messageKey = parsed.event.eventKey;
    const current = messages.get(messageKey);
    if (!current || shouldReplaceClaudeUsage(current, parsed.event)) {
      messages.set(messageKey, parsed.event);
    }
  });
  return {
    events: Array.from(messages.values()).filter((event) => event.outputTokens > 0),
    errors,
  };
}

function parseClaudeCodeUsageCandidate(
  line: string,
  context: { filePath: string; lineNumber: number },
): { event?: ParsedClaudeUsage; error?: string } {
  const raw = parseJsonLine(line);
  if (!raw.ok) return { error: raw.error };
  if (raw.value?.type !== "assistant") return {};
  const message = raw.value?.message;
  if (!message || typeof message !== "object") return {};
  const usage = findUsageObject(raw.value);
  if (!usage) return {};
  const tokens = tokensFromUsage(usage);
  if (!hasTokenUsage(tokens)) return {};
  const messageId = stringValue(message.id)
    || stringValue(raw.value?.message_id)
    || stringValue(raw.value?.uuid);
  if (!messageId) return {};
  const stopReason = stringValue(message.stop_reason);
  if (!stopReason) return {};
  const model = stringValue(message.model)
    || stringValue(raw.value?.model)
    || stringValue(usage.model)
    || "unknown";
  const sessionId = stringValue(raw.value?.sessionId)
    || stringValue(raw.value?.session_id)
    || stringValue(raw.value?.sessionUuid)
    || stringValue(raw.value?.session_uuid)
    || pathSessionId(context.filePath);
  const eventKey = `message:${messageId}`;
  return {
    event: {
      id: `claude_code:${context.filePath}:${context.lineNumber}`,
      eventKey,
      filePath: context.filePath,
      source: "claude_code",
      providerKind: "anthropic",
      providerId: "claude_code",
      providerLabel: "Claude Code",
      model,
      sessionId,
      sessionTitle: sessionId,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      cacheCreationTokens: tokens.cacheCreationTokens,
      cacheReadTokens: tokens.cacheReadTokens,
      totalTokens: tokens.totalTokens,
      occurredAt: timestampMillis(raw.value?.timestamp) || timestampMillis(raw.value?.created_at) || 0,
      rawJson: raw.value,
      stopReason,
    },
  };
}

function shouldReplaceClaudeUsage(current: ParsedClaudeUsage, next: ParsedClaudeUsage) {
  if (next.stopReason && !current.stopReason) return true;
  if (!!next.stopReason === !!current.stopReason && next.outputTokens > current.outputTokens) return true;
  return false;
}

export function codexUsageEventsFromJsonl(content: string, filePath: string): {
  events: ExternalUsageEvent[];
  errors: string[];
} {
  const events: ExternalUsageEvent[] = [];
  const errors: string[] = [];
  let previousCumulative: UsageNormalizedTotals | undefined;
  let currentContext: { sessionId?: string; turnId?: string; model?: string; cwd?: string } = {};
  let eventIndex = 0;
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    const lineNumber = index + 1;
    const raw = parseJsonLine(line);
    if (!raw.ok) {
      errors.push(`${filePath}:${lineNumber} ${raw.error}`);
      return;
    }
    if (raw.value?.type === "session_meta" && raw.value?.payload) {
      currentContext = {
        ...currentContext,
        sessionId: stringValue(raw.value.payload.session_id)
          || stringValue(raw.value.payload.sessionId)
          || stringValue(raw.value.payload.id)
          || currentContext.sessionId,
      };
      return;
    }
    if (raw.value?.type === "turn_context" && raw.value?.payload) {
      currentContext = {
        ...currentContext,
        turnId: stringValue(raw.value.payload.turn_id) || currentContext.turnId,
        model: normalizeExternalModelName(stringValue(raw.value.payload.model) || stringValue(raw.value.payload.info?.model) || currentContext.model),
        cwd: stringValue(raw.value.payload.cwd) || currentContext.cwd,
      };
      return;
    }
    const tokenPayload = codexTokenPayload(raw.value);
    if (!tokenPayload) return;
    const current = tokensFromUsage(tokenPayload.usage);
    let tokens = tokenPayload.cumulative
      ? deltaTokens(current, previousCumulative)
      : current;
    if (tokenPayload.cumulative) previousCumulative = current;
    tokens = {
      ...tokens,
      cacheReadTokens: Math.min(tokens.cacheReadTokens, tokens.inputTokens),
    };
    if (!hasTokenUsage(tokens)) return;
    eventIndex += 1;
    const eventKey = `event:${eventIndex}`;
    const model = normalizeExternalModelName(stringValue(raw.value?.model)
      || stringValue(raw.value?.event_msg?.model)
      || stringValue(raw.value?.payload?.model)
      || stringValue(raw.value?.payload?.info?.model)
      || stringValue(raw.value?.payload?.info?.model_name)
      || stringValue(tokenPayload.usage.model)
      || currentContext.model
      || "unknown") || "unknown";
    const sessionId = stringValue(raw.value?.sessionId)
      || stringValue(raw.value?.session_id)
      || stringValue(raw.value?.conversation_id)
      || currentContext.sessionId
      || currentContext.turnId
      || pathSessionId(filePath);
    events.push({
      id: `codex_cli:${filePath}:${lineNumber}`,
      eventKey,
      filePath,
      source: "codex_cli",
      providerKind: "codex",
      providerId: "codex_cli",
      providerLabel: "Codex CLI",
      model,
      sessionId,
      sessionTitle: sessionId,
      workspacePath: currentContext.cwd,
      workspaceName: currentContext.cwd ? currentContext.cwd.split(/[\\/]/).pop() : undefined,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      cacheCreationTokens: tokens.cacheCreationTokens,
      cacheReadTokens: tokens.cacheReadTokens,
      totalTokens: tokens.totalTokens,
      occurredAt: timestampMillis(raw.value?.timestamp) || timestampMillis(raw.value?.created_at) || 0,
      rawJson: raw.value,
    });
  });
  return { events, errors };
}

export function tokensFromUsage(usage: TokenLike | undefined): UsageNormalizedTotals {
  if (!usage) return zeroTotals;
  const inputTokens = safeToken(usage.inputTokens ?? usage.input_tokens ?? usage.prompt_tokens);
  const outputTokens = safeToken(usage.outputTokens ?? usage.output_tokens ?? usage.completion_tokens);
  const cacheCreationTokens = safeToken(
    usage.cacheCreationTokens
      ?? usage.cache_creation_input_tokens
      ?? usage.input_token_details?.cache_creation,
  );
  const cacheReadTokens = safeToken(
    usage.cacheReadTokens
      ?? usage.cache_read_input_tokens
      ?? usage.cached_input_tokens
      ?? usage.input_token_details?.cache_read,
  );
  const totalTokens = safeToken(usage.totalTokens ?? usage.total_tokens)
    || inputTokens + outputTokens;
  return {
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    totalTokens,
    freshInputTokens: inputTokens,
    realTotalTokens: totalTokens,
    cacheHitRate: 0,
  };
}

function sumTotals(events: NormalizedUsageEvent[]): UsageNormalizedTotals {
  const totals = events.reduce(
    (acc, event) => {
      const normalized = normalizeUsageTotals(event);
      return {
        inputTokens: acc.inputTokens + safeToken(event.inputTokens),
        outputTokens: acc.outputTokens + safeToken(event.outputTokens),
        cacheCreationTokens: acc.cacheCreationTokens + safeToken(event.cacheCreationTokens),
        cacheReadTokens: acc.cacheReadTokens + safeToken(event.cacheReadTokens),
        totalTokens: acc.totalTokens + safeToken(event.totalTokens),
        freshInputTokens: acc.freshInputTokens + normalized.freshInputTokens,
        realTotalTokens: acc.realTotalTokens + normalized.realTotalTokens,
      };
    },
    {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 0,
      freshInputTokens: 0,
      realTotalTokens: 0,
    },
  );
  const cacheBase = totals.freshInputTokens + totals.cacheCreationTokens + totals.cacheReadTokens;
  return {
    ...totals,
    cacheHitRate: cacheBase > 0 ? totals.cacheReadTokens / cacheBase : 0,
  };
}

function shouldDeductCacheRead(input: TotalsInput | undefined) {
  const inputTokens = safeToken(input?.inputTokens);
  const outputTokens = safeToken(input?.outputTokens);
  const cacheCreationTokens = safeToken(input?.cacheCreationTokens);
  const cacheReadTokens = safeToken(input?.cacheReadTokens);
  const totalTokens = safeToken(input?.totalTokens);
  if (cacheReadTokens <= 0) return false;
  const totalWithoutCacheRead = inputTokens + outputTokens + cacheCreationTokens;
  const totalWithSeparateCacheRead = totalWithoutCacheRead + cacheReadTokens;
  if (totalTokens > 0) {
    if (totalTokens <= totalWithoutCacheRead) return true;
    if (totalTokens >= totalWithSeparateCacheRead) return false;
  }
  const providerKind = `${input?.providerKind || ""}`.toLowerCase();
  if (input?.source === "claude_code") return false;
  if (providerKind.includes("anthropic")) return false;
  return true;
}

function safeToken(value: unknown) {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.trunc(number);
}

function hasTokenUsage(tokens: UsageNormalizedTotals) {
  return tokens.inputTokens > 0
    || tokens.outputTokens > 0
    || tokens.cacheCreationTokens > 0
    || tokens.cacheReadTokens > 0
    || tokens.realTotalTokens > 0;
}

function parseJsonLine(line: string): { ok: true; value: any } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(line) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? `JSON parse failed: ${error.message}` : "JSON parse failed" };
  }
}

function findUsageObject(value: any): TokenLike | undefined {
  const candidates = [
    value?.usage,
    value?.message?.usage,
    value?.event_msg?.usage,
    value?.payload?.usage,
    value?.response?.usage,
  ];
  return candidates.find((candidate) => candidate && typeof candidate === "object" && hasTokenUsage(tokensFromUsage(candidate)));
}

function codexTokenPayload(value: any): { usage: TokenLike; cumulative: boolean } | undefined {
  const event = value?.event_msg ?? value?.payload ?? value?.msg ?? value;
  const isTokenCount = [value?.type, event?.type, value?.event, event?.event]
    .some((item) => String(item || "").toLowerCase() === "token_count");
  const total = event?.info?.total_token_usage ?? event?.total_token_usage ?? value?.total_token_usage;
  if (total && (isTokenCount || hasTokenUsage(tokensFromUsage(total)))) {
    return { usage: total, cumulative: true };
  }
  const last = event?.info?.last_token_usage ?? event?.last_token_usage ?? value?.last_token_usage;
  if (last && (isTokenCount || hasTokenUsage(tokensFromUsage(last)))) {
    return { usage: last, cumulative: false };
  }
  return undefined;
}

function deltaTokens(current: UsageNormalizedTotals, previous: UsageNormalizedTotals | undefined): UsageNormalizedTotals {
  if (!previous) return current;
  const delta = {
    inputTokens: positiveDelta(current.inputTokens, previous.inputTokens),
    outputTokens: positiveDelta(current.outputTokens, previous.outputTokens),
    cacheCreationTokens: positiveDelta(current.cacheCreationTokens, previous.cacheCreationTokens),
    cacheReadTokens: positiveDelta(current.cacheReadTokens, previous.cacheReadTokens),
    totalTokens: positiveDelta(current.realTotalTokens, previous.realTotalTokens),
  };
  return {
    ...normalizeUsageTotals(delta),
  };
}

function positiveDelta(current: number, previous: number) {
  if (current >= previous) return current - previous;
  return 0;
}

const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;

type TimeTickInterval = { unit: "hour" | "day" | "month"; step: number };

function chooseTimeTickInterval(span: number, maxTicks: number): TimeTickInterval {
  if (span <= dayMs) return { unit: "hour", step: chooseIntervalStep(span / hourMs, maxTicks, [1, 2, 3, 4, 6, 12]) };
  if (span <= 45 * dayMs) return { unit: "day", step: chooseIntervalStep(span / dayMs, maxTicks, [1, 2, 3, 7, 14]) };
  return { unit: "month", step: chooseIntervalStep(span / (30 * dayMs), maxTicks, [1, 2, 3, 6, 12]) };
}

function chooseIntervalStep(spanUnits: number, maxTicks: number, steps: number[]) {
  const limit = Math.max(2, maxTicks);
  return steps.find((step) => Math.floor(spanUnits / step) + 1 <= limit) || steps[steps.length - 1];
}

function firstTimeTickAt(start: number, interval: TimeTickInterval) {
  const date = new Date(start);
  if (interval.unit === "hour") {
    date.setMinutes(0, 0, 0);
    const remainder = date.getHours() % interval.step;
    if (remainder > 0) date.setHours(date.getHours() + interval.step - remainder);
    while (date.getTime() < start) date.setHours(date.getHours() + interval.step);
    return date.getTime();
  }
  if (interval.unit === "day") {
    date.setHours(0, 0, 0, 0);
    while (date.getTime() < start) date.setDate(date.getDate() + interval.step);
    return date.getTime();
  }
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  const remainder = date.getMonth() % interval.step;
  if (remainder > 0) date.setMonth(date.getMonth() + interval.step - remainder);
  while (date.getTime() < start) date.setMonth(date.getMonth() + interval.step);
  return date.getTime();
}

function nextTimeTickAt(current: number, interval: TimeTickInterval) {
  const date = new Date(current);
  if (interval.unit === "hour") date.setHours(date.getHours() + interval.step);
  if (interval.unit === "day") date.setDate(date.getDate() + interval.step);
  if (interval.unit === "month") date.setMonth(date.getMonth() + interval.step);
  return date.getTime();
}

function usageAxisUnit(value: number) {
  if (value >= 1_000_000) return { value: 1_000_000, label: "M tokens" };
  if (value >= 1_000) return { value: 1_000, label: "K tokens" };
  return { value: 1, label: "tokens" };
}

function niceAxisMax(value: number) {
  const safe = Math.max(1, safeToken(value));
  const exponent = Math.floor(Math.log10(safe));
  const magnitude = 10 ** exponent;
  const normalized = safe / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function formatAxisTick(value: number) {
  if (Number.isInteger(value)) return `${value}`;
  return value.toFixed(1).replace(/\.0$/, "");
}

function roundCoord(value: number) {
  return Number(value.toFixed(2));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function timestampMillis(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value > 10_000_000_000 ? value : value * 1000;
  if (typeof value !== "string" || !value.trim()) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeExternalModelName(value: string | undefined) {
  if (!value) return undefined;
  let name = value.trim().toLowerCase();
  const slashIndex = name.lastIndexOf("/");
  if (slashIndex >= 0) name = name.slice(slashIndex + 1);
  if (/-\d{4}-\d{2}-\d{2}$/.test(name)) name = name.slice(0, -11);
  if (/-\d{8}$/.test(name)) name = name.slice(0, -9);
  return name || undefined;
}

function pathSessionId(filePath: string) {
  const name = filePath.split(/[\\/]/).pop() || filePath;
  return name.replace(/\.jsonl$/i, "") || filePath;
}
