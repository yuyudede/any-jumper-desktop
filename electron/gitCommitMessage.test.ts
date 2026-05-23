import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readMainSource() {
  return readFileSync(resolve(process.cwd(), "electron/main.ts"), "utf8");
}

describe("smart git commit message generation", () => {
  it("registers an IPC command for generating commit messages", () => {
    const source = readMainSource();

    expect(source).toContain('case "git_generate_commit_message": return generateGitCommitMessage(args.rootPath);');
  });

  it("builds commit context from staged, unstaged, and untracked changes", () => {
    const source = readMainSource();

    expect(source).toContain("function buildGitCommitMessageContext");
    expect(source).toContain('gitDiff(root, true)');
    expect(source).toContain('gitDiff(root, false)');
    expect(source).toContain("untrackedSummaries");
  });

  it("uses the configured model with a deterministic fallback", () => {
    const source = readMainSource();

    expect(source).toContain("function fallbackCommitMessage");
    expect(source).toContain("function selectCommitMessageModel");
    expect(source).toContain("createChatModel(selection.config, selection.model)");
    expect(source).toContain("sanitizeGeneratedCommitMessage");
  });

  it("asks the model and fallback path to produce Chinese messages", () => {
    const source = readMainSource();

    expect(source).toContain("使用中文生成");
    expect(source).not.toContain("Prefer English");
    expect(source).toContain("更新 Git 变更面板");
    expect(source).toContain("更新文档");
  });

  it("rejects model generated commit subjects that contain no Chinese text", () => {
    const source = readMainSource();

    expect(source).toContain("function containsChineseCommitSubject");
    expect(source).toContain("containsChineseCommitSubject(limited) ? limited : \"\"");
  });
});
