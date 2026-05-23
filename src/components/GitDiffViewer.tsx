import { ChevronDown, Code2, FileText, GitBranch, RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import type { GitStatus, GitStatusEntry } from "../types";
import { parseUnifiedDiff, type UnifiedDiffFile, type UnifiedDiffHunk, type UnifiedDiffLine } from "../utils/unifiedDiff";

interface GitDiffViewerProps {
  gitDiff: string;
  gitStatus?: GitStatus;
  onRefreshGit: () => void;
  onRefreshGitDiff: () => void;
}

export function GitDiffViewer({
  gitDiff,
  gitStatus,
  onRefreshGit,
  onRefreshGitDiff,
}: GitDiffViewerProps) {
  const diff = useMemo(() => parseUnifiedDiff(gitDiff), [gitDiff]);
  const hasDiffText = gitDiff.trim().length > 0 && gitDiff.trim() !== "暂无 diff";
  const showStatusList = diff.files.length === 0 && (gitStatus?.entries.length || 0) > 0;

  return (
    <div className="diff-page">
      <div className="diff-page-header">
        <div className="diff-page-title">
          <span>当前变更</span>
          <DiffStats additions={diff.totalAdditions} deletions={diff.totalDeletions} />
        </div>
        <div className="diff-page-actions">
          <Button aria-label="刷新 Git 状态" size="icon" type="button" variant="ghost" onClick={onRefreshGit}>
            <RefreshCw size={16} />
          </Button>
          <Button aria-label="加载 Diff" size="icon" type="button" variant="ghost" onClick={onRefreshGitDiff}>
            <Code2 size={16} />
          </Button>
        </div>
      </div>

      {gitStatus ? (
        <div className="diff-branch-row">
          <GitBranch size={14} />
          <span>{gitStatus.branch}</span>
          <Badge tone={gitStatus.dirty ? "warning" : "success"}>{gitStatus.dirty ? "dirty" : "clean"}</Badge>
        </div>
      ) : null}

      {diff.files.length > 0 ? (
        <div className="diff-file-stack">
          {diff.files.map((file) => (
            <DiffFileView file={file} key={`${file.oldPath}-${file.newPath}`} />
          ))}
        </div>
      ) : showStatusList ? (
        <div className="diff-status-list">
          {gitStatus?.entries.map((entry) => (
            <GitStatusRow entry={entry} key={`${entry.path}-${entry.indexStatus}-${entry.worktreeStatus}`} />
          ))}
          <div className="diff-empty-inline">点击代码图标加载可阅读 Diff。</div>
        </div>
      ) : hasDiffText ? (
        <pre className="diff-raw-fallback">{gitDiff}</pre>
      ) : (
        <div className="diff-empty-state">
          <FileText size={18} />
          <span>{gitStatus?.dirty ? "暂无可显示 Diff" : "工作区干净"}</span>
        </div>
      )}
    </div>
  );
}

function DiffStats({ additions, deletions }: { additions: number; deletions: number }) {
  return (
    <span className="diff-stats" aria-label={`新增 ${additions} 行，删除 ${deletions} 行`}>
      <span className="diff-stat is-add">+{additions}</span>
      <span className="diff-stat is-delete">-{deletions}</span>
    </span>
  );
}

function DiffFileView({ file }: { file: UnifiedDiffFile }) {
  return (
    <details className="diff-file" open>
      <summary className="diff-file-header">
        <span className="diff-file-title">
          <FileText size={15} />
          <span>{file.path}</span>
        </span>
        <span className="diff-file-actions">
          <DiffStats additions={file.additions} deletions={file.deletions} />
          <ChevronDown className="diff-file-chevron" size={15} />
        </span>
      </summary>
      <div className="diff-file-body">
        {file.binary ? (
          <div className="diff-empty-inline">Binary file changed</div>
        ) : (
          file.hunks.map((hunk, index) => (
            <DiffHunkView hunk={hunk} key={`${hunk.oldStart}-${hunk.newStart}-${index}`} />
          ))
        )}
      </div>
    </details>
  );
}

function DiffHunkView({ hunk }: { hunk: UnifiedDiffHunk }) {
  return (
    <div className="diff-hunk" aria-label={hunk.header}>
      {hunk.hiddenBefore > 0 ? (
        <div className="diff-skip-row">{hunk.hiddenBefore} unmodified lines</div>
      ) : null}
      <div className="diff-line-list">
        {hunk.lines.map((line, index) => (
          <DiffLineView line={line} key={`${line.kind}-${line.oldNumber || 0}-${line.newNumber || 0}-${index}`} />
        ))}
      </div>
    </div>
  );
}

function DiffLineView({ line }: { line: UnifiedDiffLine }) {
  const lineNumber = line.oldNumber ?? line.newNumber ?? "";
  return (
    <div className={`diff-line is-${line.kind}`}>
      <span className="diff-line-number">{lineNumber}</span>
      <code className="diff-line-code">{line.content || " "}</code>
    </div>
  );
}

function GitStatusRow({ entry }: { entry: GitStatusEntry }) {
  const status = `${entry.indexStatus}${entry.worktreeStatus}`.trim() || "M";
  return (
    <div className="diff-status-row">
      <span className="diff-status-code">{status}</span>
      <code>{entry.path}</code>
    </div>
  );
}
