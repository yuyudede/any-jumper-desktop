import { describe, expect, it } from "vitest";
import {
  TRACE_THOUGHT_TRUNCATED_MARKER,
  formatTraceThoughtText,
  isTraceThoughtTruncated,
  truncateTraceThoughtText,
} from "./traceThoughtText";

describe("trace thought text formatting", () => {
  it("formats long reasoning into readable paragraphs without losing content", () => {
    const text = "用户问我是怎么查出浏览器中所有有 Cookie 的域名的。我之前的方法是通过 chrome.cookies.getAll 获取指定域名的 Cookie，但这个 API 需要指定一个域名参数，不能直接列出所有域名。让我回忆一下我做了什么。1. 先测试了用户提到的域名。2. 然后通过 tabs.list 获取所有打开标签页的 URL。3. 再从这些 URL 中提取域名逐个查询。";

    const blocks = formatTraceThoughtText(text, 72);

    expect(blocks.length).toBeGreaterThan(3);
    expect(blocks.map((block) => block.text).join(" ")).toContain("chrome.cookies.getAll");
    expect(blocks.map((block) => block.text).join(" ")).toContain("1. 先测试了用户提到的域名");
    expect(blocks.every((block) => block.text.length > 0)).toBe(true);
  });

  it("chunks very long unpunctuated text without truncating it", () => {
    const text = "a".repeat(260);

    const blocks = formatTraceThoughtText(text, 80);

    expect(blocks.map((block) => block.text).join("")).toBe(text);
    expect(blocks).toHaveLength(4);
  });

  it("marks stored reasoning truncation explicitly", () => {
    const truncated = truncateTraceThoughtText("我".repeat(2100), 120);

    expect(truncated.truncated).toBe(true);
    expect(truncated.content).toContain(TRACE_THOUGHT_TRUNCATED_MARKER);
    expect(truncated.content.length).toBeLessThanOrEqual(120);
    expect(isTraceThoughtTruncated(truncated.content)).toBe(true);
    expect(formatTraceThoughtText(truncated.content).at(-1)).toMatchObject({
      kind: "truncation",
      text: "公开推理已截断，后续内容未保存。",
    });
  });
});
