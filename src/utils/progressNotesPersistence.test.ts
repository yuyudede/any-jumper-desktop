import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readProjectFile(path: string) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("progress note persistence wiring", () => {
  it("stores progress notes and returns them with thread details", () => {
    const source = readProjectFile("electron/main.ts");

    expect(source).toContain("CREATE TABLE IF NOT EXISTS progress_notes");
    expect(source).toContain("kind TEXT NOT NULL DEFAULT 'progress'");
    expect(source).toContain('this.ensureColumn("progress_notes", "kind"');
    expect(source).toContain("insertProgressNote(note: ProgressNote)");
    expect(source).toContain("progressNotes: this.db.prepare(\"SELECT * FROM progress_notes WHERE thread_id=? ORDER BY created_at ASC\")");
    expect(source).toContain("function mapProgressNote");
  });

  it("exposes a dedicated progress_note tool for public work updates", () => {
    const source = readProjectFile("electron/main.ts");

    expect(source).toContain('name: "progress_note"');
    expect(source).toContain("公开进度");
    expect(source).toContain('event: "progress.note"');
  });

  it("records runtime lifecycle notes even when the model does not call progress_note", () => {
    const source = readProjectFile("electron/main.ts");

    expect(source).toContain("recordRuntimeProgress(ctx");
    expect(source).toContain("已接收用户输入");
    expect(source).toContain("正在构建模型上下文");
    expect(source).toContain("开始调用模型生成回复");
    expect(source).toContain("模型已经开始返回内容");
    expect(source).toContain("模型回复生成完成");
  });

  it("captures provider-exposed reasoning as intact Markdown without truncating it", () => {
    const source = readProjectFile("electron/main.ts");

    expect(source).toContain('import { extractModelOutputParts, stripExposedThinking } from "../src/utils/modelReasoning"');
    expect(source).toContain("recordModelReasoning(ctx");
    expect(source).toContain('kind === "reasoning"');
    expect(source).toContain("content.trim()");
    expect(source).toMatch(/kind === "reasoning"\s+\?\s+content\.trim\(\)/);
    expect(source).not.toContain("truncateTraceThoughtText");
    expect(source).toContain("extractFinalOutputParts");
  });

  it("requests visible reasoning summaries from capable model providers", () => {
    const source = readProjectFile("electron/main.ts");

    expect(source).toContain("createChatModel(modelConfig, ctx.model, ctx.reasoningEffort)");
    expect(source).toContain("reasoning: shouldUseOpenAIResponsesApi(model) ? openAIReasoningOptions(reasoningEffort) : undefined");
    expect(source).toContain("useResponsesApi: shouldUseOpenAIResponsesApi(model)");
    expect(source).toContain("const thinking = anthropicThinkingOptions(model, reasoningEffort)");
    expect(source).toContain("thinking,");
  });

  it("sanitizes exposed thinking before completing a message", () => {
    const source = readProjectFile("electron/main.ts");
    const pageSource = readProjectFile("src/pages/AgentPage.tsx");

    expect(source).toContain("this.sanitizeAssistantContent(ctx)");
    expect(source).toContain("stripExposedThinking(item.content)");
    expect(source).toContain("storage.updateItemContent(ctx.assistantItemId, exposedThinking.content)");
    expect(source).toContain('event: "message.replaced"');
    expect(pageSource).toContain('event.event === "message.replaced"');
  });

  it("classifies pending model text through the runtime protocol instead of appending every delta", () => {
    const source = readProjectFile("electron/main.ts");

    expect(source).toContain('import { TurnOutputClassifier');
    expect(source).toContain("const outputClassifier = new TurnOutputClassifier()");
    expect(source).toContain("outputClassifier.appendModelText(parts.content)");
    expect(source).toContain("flushTurnOutputSegments(ctx, outputClassifier.flushBeforeToolCall())");
    expect(source).toContain("flushTurnOutputSegments(ctx, outputClassifier.finish())");
  });

  it("invokes the DeepAgents runtime only once for a single turn", () => {
    const source = readProjectFile("electron/main.ts");

    expect(source.match(/this\.runDeepAgents\(ctx\)/g) || []).toHaveLength(1);
    expect(source).toContain("const turnTokenUsage = await this.runDeepAgents(ctx)");
  });

  it("recovers stale running turns left by a previous process on startup", () => {
    const source = readProjectFile("electron/main.ts");

    expect(source).toContain("this.recoverStaleRunningTurns()");
    expect(source).toContain("UPDATE turns SET status='interrupted'");
    expect(source).toContain("UPDATE items SET status='error'");
    expect(source).toContain("UPDATE threads SET status='interrupted'");
  });
});
