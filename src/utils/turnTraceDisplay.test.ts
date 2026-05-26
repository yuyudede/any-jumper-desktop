import { describe, expect, it } from "vitest";
import type { ThinkingTraceSection } from "./thinkingTrace";
import {
  formatTurnTraceDuration,
  turnTraceHeadline,
} from "./turnTraceDisplay";

function section(partial: Partial<ThinkingTraceSection>): ThinkingTraceSection {
  return {
    turnId: "turn-1",
    status: "running",
    summary: "",
    items: [],
    ...partial,
  };
}

describe("turn trace display", () => {
  it("shows a naturally growing processing duration while the turn is running", () => {
    expect(turnTraceHeadline(section({
      status: "running",
      startedAt: 1_000,
    }), 9_000)).toBe("处理中 8s");

    expect(turnTraceHeadline(section({
      status: "running",
      startedAt: 1_000,
    }), 536_000)).toBe("处理中 8m 55s");
  });

  it("shows completed turns as handled with the final full duration", () => {
    expect(turnTraceHeadline(section({
      status: "completed",
      durationLabel: "8m 54s",
    }))).toBe("已处理 8m 54s");

    expect(formatTurnTraceDuration(1_000, 80_000)).toBe("1m 19s");
  });
});
