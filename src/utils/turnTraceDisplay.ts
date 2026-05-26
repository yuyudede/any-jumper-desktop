import type { ThinkingTraceSection } from "./thinkingTrace";

export function turnTraceHeadline(section: ThinkingTraceSection, now = Date.now()) {
  if (section.status === "running") {
    return section.startedAt === undefined
      ? "处理中"
      : `处理中 ${formatTurnTraceDuration(section.startedAt, now, 0)}`;
  }
  if (section.status === "error") return "处理失败";
  if (section.status === "pending") return "等待处理";
  return section.durationLabel ? `已处理 ${section.durationLabel}` : "已处理";
}

export function formatTurnTraceDuration(
  startedAt: number,
  completedAt: number,
  minimumSeconds = 1,
) {
  const seconds = Math.max(
    minimumSeconds,
    Math.floor(Math.max(0, completedAt - startedAt) / 1000),
  );
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}
