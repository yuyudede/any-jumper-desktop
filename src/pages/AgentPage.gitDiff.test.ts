import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readProjectFile(path: string) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("AgentPage Git diff experience", () => {
  it("does not mount the former right-rail Git diff viewer in the chat workbench", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");

    expect(source).not.toContain("<GitDiffViewer");
    expect(source).not.toContain("desktopApi.gitDiff");
    expect(source).not.toContain("desktopApi.gitStatus");
    expect(source).not.toContain('gitDiff ? <pre className="code-block">{gitDiff}</pre>');
  });

  it("lets untracked files be staged from the changes panel", () => {
    const source = readProjectFile("src/components/RightPanel.tsx");

    expect(source).toContain("Plus");
    expect(source).toContain("handleStageFile");
    expect(source).toContain('title="暂存文件"');
    expect(source).toContain('aria-label={`暂存 ${file.path}`}');
  });

  it("includes untracked files when committing all visible changes", () => {
    const source = readProjectFile("src/components/RightPanel.tsx");

    expect(source).toContain("const committablePaths = [");
    expect(source).toContain("...git.changedFiles");
    expect(source).toContain("...git.untrackedFiles");
    expect(source).toContain("await desktopApi.gitStage(rootPath, committablePaths);");
  });

  it("can generate a commit message from the changes panel", () => {
    const source = readProjectFile("src/components/RightPanel.tsx");

    expect(source).toContain("WandSparkles");
    expect(source).toContain("commitMessageLoading");
    expect(source).toContain("handleGenerateCommitMessage");
    expect(source).toContain("desktopApi.gitGenerateCommitMessage(rootPath)");
    expect(source).toContain('title="智能生成 Commit Message"');
    expect(source).toContain('aria-label="智能生成 Commit Message"');
  });
});
