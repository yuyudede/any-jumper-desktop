import { describe, expect, it } from "vitest";
import { TurnOutputClassifier } from "./turnOutputClassifier";

describe("turn output classifier", () => {
  it("holds model text as pending until the turn can classify it as final answer", () => {
    const classifier = new TurnOutputClassifier();

    classifier.appendModelText("最终结论：问题在流式渲染。");

    expect(classifier.finish()).toEqual([
      { phase: "final_answer", text: "最终结论：问题在流式渲染。" },
    ]);
  });

  it("classifies model narration before a tool call as commentary", () => {
    const classifier = new TurnOutputClassifier();

    classifier.appendModelText("好问题。我先深入看看流式模式下的渲染逻辑。");

    expect(classifier.flushBeforeToolCall()).toEqual([
      { phase: "commentary", text: "好问题。我先深入看看流式模式下的渲染逻辑。" },
    ]);

    classifier.appendModelText("修复方案：把最终回答和工具过程分开。");

    expect(classifier.finish()).toEqual([
      { phase: "final_answer", text: "修复方案：把最终回答和工具过程分开。" },
    ]);
  });

  it("classifies text between repeated tool calls as commentary", () => {
    const classifier = new TurnOutputClassifier();

    classifier.appendModelText("Step 1: 查看 stream 模式下渲染逻辑。");
    expect(classifier.flushBeforeToolCall()).toEqual([
      { phase: "commentary", text: "Step 1: 查看 stream 模式下渲染逻辑。" },
    ]);

    classifier.appendModelText("现在继续检查 IPC 事件。");
    expect(classifier.flushBeforeToolCall()).toEqual([
      { phase: "commentary", text: "现在继续检查 IPC 事件。" },
    ]);

    classifier.appendModelText("完整诊断：需要引入运行时分类协议。");
    expect(classifier.finish()).toEqual([
      { phase: "final_answer", text: "完整诊断：需要引入运行时分类协议。" },
    ]);
  });

  it("ignores whitespace-only pending text", () => {
    const classifier = new TurnOutputClassifier();

    classifier.appendModelText("\n\n ");

    expect(classifier.flushBeforeToolCall()).toEqual([]);
    expect(classifier.finish()).toEqual([]);
  });
});
