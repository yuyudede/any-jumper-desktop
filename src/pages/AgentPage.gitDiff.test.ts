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

  it("renders git changes as a nested file tree", () => {
    const source = readProjectFile("src/components/RightPanel.tsx");
    const css = readProjectFile("src/styles/theme.css");

    expect(source).toContain("buildGitChangeTree");
    expect(source).toContain("GitChangeTreeNode");
    expect(source).toContain("GitChangeTreeView");
    expect(source).toContain("git-change-tree");
    expect(source).toContain("git-change-tree-dir");
    expect(source).toContain("git-change-tree-file");
    expect(css).toContain(".git-change-tree");
    expect(css).toContain(".git-change-tree-children");
    expect(css).toContain(".git-change-tree-file");
  });

  it("loads recent git commits for the branch panel below changes", () => {
    const source = readProjectFile("src/components/RightPanel.tsx");
    const css = readProjectFile("src/styles/theme.css");

    expect(source).toContain("parseGitLogLines");
    expect(source).toContain("desktopApi.gitLog(rootPath, 6)");
    expect(source).toContain("gitBranchPanel");
    expect(source).toContain("git-branch-panel");
    expect(source).toContain("最近提交");
    expect(source).toContain("当前分支");
    expect(css).toContain(".git-branch-panel");
    expect(css).toContain(".git-recent-commit");
  });

  it("pins the recent commits panel below the scrollable changes tree", () => {
    const source = readProjectFile("src/components/RightPanel.tsx");
    const css = readProjectFile("src/styles/theme.css");
    const branchPanelBlock = css.match(/(?:^|\n)\.git-branch-panel\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

    expect(source).toContain("</div>\n\n            {gitBranchPanel}");
    expect(css).toContain(".git-change-scroll-area");
    expect(css).toContain("flex: 1 1 auto;");
    expect(css).toContain(".git-branch-panel");
    expect(branchPanelBlock).toContain("flex: 0 0 168px;");
    expect(branchPanelBlock).not.toContain("resize: vertical;");
    expect(branchPanelBlock).not.toContain("cursor: ns-resize;");
  });

  it("lets the recent commits panel collapse completely into a bottom bar", () => {
    const source = readProjectFile("src/components/RightPanel.tsx");
    const css = readProjectFile("src/styles/theme.css");

    expect(source).toContain("gitBranchPanelCollapsed");
    expect(source).toContain("setGitBranchPanelCollapsed");
    expect(source).toContain("useState(true)");
    expect(source).toContain('className={`git-branch-panel ${collapsed ? "is-collapsed" : ""}`}');
    expect(source).toContain("aria-expanded={!collapsed}");
    expect(source).toContain("git-branch-panel-content");
    expect(css).toContain(".git-branch-panel.is-collapsed");
    expect(css).toContain(".git-branch-panel.is-collapsed .git-branch-panel-content");
    expect(css).toContain("display: none;");
  });
});
