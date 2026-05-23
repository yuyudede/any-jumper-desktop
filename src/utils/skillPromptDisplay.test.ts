import { describe, expect, it } from "vitest";
import { displaySkillPrompt } from "./skillPromptDisplay";

describe("displaySkillPrompt", () => {
  it("summarizes expanded skill prompts for chat display", () => {
    const content = [
      "请使用 Skill「agent-bridge」处理下面的用户请求。",
      "",
      "用户请求：查下我还剩多少额度https://platform.xiaomimimo.com/api/v1/tokenPlan/usage",
      "",
      "执行要求：",
      "1. 先阅读并遵循下面的 SKILL.md。",
      "",
      '<SKILL name="agent-bridge" path="/Users/yude/.codex/skills/agent-bridge/SKILL.md">',
      "```markdown",
      "# Agent Bridge",
      "```",
      "</SKILL>",
    ].join("\n");

    expect(displaySkillPrompt(content)).toBe(
      "使用 Skill「agent-bridge」：查下我还剩多少额度https://platform.xiaomimimo.com/api/v1/tokenPlan/usage",
    );
  });

  it("returns original content for regular user messages", () => {
    expect(displaySkillPrompt("你好")).toBe("你好");
  });
});
