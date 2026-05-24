import { useState, useCallback, useMemo, useEffect } from "react";
import {
  RefreshCw,
  FolderOpen,
  GitBranch,
  GitCommit,
  Undo2,
  FileText,
  ChevronDown,
  ArrowUp,
  Plus,
  WandSparkles,
} from "lucide-react";
import { FileBrowser, type FileTreeNode } from "./FileBrowser";
import { PreviewPanel, type PreviewFile, type PreviewDiff } from "./PreviewPanel";
import { desktopApi } from "../services/desktopApi";
import { useGitService } from "../services/gitService";
import {
  buildGitChangeTree,
  parseGitLogLines,
  type GitChangeTreeFile,
  type GitChangeTreeNode,
  type GitRecentCommit,
} from "../utils/gitPanel";

type RightPanelTab = "files" | "changes" | "preview";

interface RightPanelProps {
  rootPath: string;
  width: number;
  resizing?: boolean;
  externalPreviewFile?: PreviewFile | null;
  onOpenFiles?: (files: PreviewFile[]) => void;
}

function toTreeNode(entry: {
  path: string;
  name: string;
  type: "file" | "directory";
  hasChildren?: boolean;
}): FileTreeNode {
  return {
    id: entry.path,
    name: entry.name,
    path: entry.path,
    type: entry.type,
    hasChildren: entry.type === "directory" ? (entry.hasChildren ?? true) : false,
  };
}

const IMAGE_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico",
]);

function isImageFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext);
}

export function RightPanel({ rootPath, width, resizing = false, externalPreviewFile }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<RightPanelTab>(() => externalPreviewFile ? "preview" : "files");
  const [roots, setRoots] = useState<FileTreeNode[]>([]);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setError] = useState<string | null>(null);

  // Preview state
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(() => externalPreviewFile ?? null);
  const [previewDiff, setPreviewDiff] = useState<PreviewDiff | null>(null);

  // Git state
  const git = useGitService(rootPath);
  const [diffLoading, setDiffLoading] = useState(false);
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  const [commitLoading, setCommitLoading] = useState(false);
  const [commitMessageLoading, setCommitMessageLoading] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [recentCommitLog, setRecentCommitLog] = useState("");
  const [commitLogLoading, setCommitLogLoading] = useState(false);
  const [commitLogError, setCommitLogError] = useState<string | null>(null);
  const [commitLogPanelOpen, setCommitLogPanelOpen] = useState(false);

  const loadRoot = useCallback(async () => {
    setFileLoading(true);
    setError(null);
    try {
      const entries = await desktopApi.listDirectory(rootPath);
      setRoots(entries.map(toTreeNode));
    } catch {
      setError("加载失败");
      setRoots([]);
    } finally {
      setFileLoading(false);
    }
  }, [rootPath]);

  useEffect(() => {
    if (rootPath) loadRoot();
  }, [loadRoot]);

  useEffect(() => {
    if (!externalPreviewFile) return;
    setPreviewFile(externalPreviewFile);
    setPreviewDiff(null);
    setActiveTab("preview");
  }, [externalPreviewFile]);

  useEffect(() => {
    setRecentCommitLog("");
    setCommitLogError(null);
    setCommitLogPanelOpen(false);
  }, [rootPath]);

  const handleExpand = useCallback(async (node: FileTreeNode) => {
    if (node.type !== "directory") return [];
    try {
      const entries = await desktopApi.listDirectory(node.path);
      node.children = entries.map(toTreeNode);
      return node.children;
    } catch {
      return [];
    }
  }, []);

  const handleOpenFile = useCallback(
    async (node: FileTreeNode) => {
      if (node.type !== "file") return;
      try {
        if (isImageFile(node.path)) {
          const dataUrl = await desktopApi.readFileBase64(node.path);
          setPreviewFile({ path: node.path, content: dataUrl, isImage: true });
        } else {
          const content = await desktopApi.readFileContent(node.path);
          setPreviewFile({ path: node.path, content });
        }
        setPreviewDiff(null);
        setActiveTab("preview");
      } catch {
        // silent
      }
    },
    [],
  );

  // Open a git-changed file as diff view
  const handleOpenGitDiff = useCallback(
    async (filePath: string) => {
      setDiffLoading(true);
      try {
        const [oldContent, newContent] = await Promise.all([
          desktopApi.readFileContentAtRef(rootPath, filePath, "HEAD").catch(() => ""),
          desktopApi.readFileContent(`${rootPath}/${filePath}`.replace(/\/+/g, "/")).catch((err) => {
            // File might be deleted
            if (err instanceof Error && err.message.includes("FILE_NOT_FOUND")) return "";
            throw err;
          }),
        ]);
        setPreviewFile(null);
        setPreviewDiff({
          oldPath: `${filePath} (HEAD)`,
          newPath: filePath,
          oldContent,
          newContent,
        });
        setActiveTab("preview");
      } catch {
        // fallback: open as plain file
        try {
          const content = await desktopApi.readFileContent(`${rootPath}/${filePath}`.replace(/\/+/g, "/"));
          setPreviewFile({ path: filePath, content });
          setPreviewDiff(null);
          setActiveTab("preview");
        } catch {
          // silent
        }
      } finally {
        setDiffLoading(false);
      }
    },
    [rootPath],
  );

  // Open untracked file as plain preview
  const handleOpenUntracked = useCallback(
    async (filePath: string) => {
      try {
        const absPath = `${rootPath}/${filePath}`.replace(/\/+/g, "/");
        if (isImageFile(filePath)) {
          const dataUrl = await desktopApi.readFileBase64(absPath);
          setPreviewFile({ path: filePath, content: dataUrl, isImage: true });
        } else {
          const content = await desktopApi.readFileContent(absPath);
          setPreviewFile({ path: filePath, content });
        }
        setPreviewDiff(null);
        setActiveTab("preview");
      } catch {
        // silent
      }
    },
    [rootPath],
  );

  const handleRevert = useCallback(
    async (filePath: string) => {
      if (!window.confirm(`确定要还原 ${filePath} 的所有变更吗？`)) return;
      try {
        await git.revertFile(filePath);
      } catch (err) {
        window.alert(`还原失败：${err instanceof Error ? err.message : "未知错误"}`);
      }
    },
    [git],
  );

  const handleStageFile = useCallback(
    async (filePath: string) => {
      try {
        await desktopApi.gitStage(rootPath, [filePath]);
        await git.refresh();
      } catch (err) {
        window.alert(`暂存失败：${err instanceof Error ? err.message : "未知错误"}`);
      }
    },
    [rootPath, git],
  );

  const loadRecentGitLog = useCallback(async () => {
    if (!rootPath) return;
    setCommitLogLoading(true);
    setCommitLogError(null);
    try {
      const log = await desktopApi.gitLog(rootPath, 6);
      setRecentCommitLog(log);
    } catch (err) {
      setRecentCommitLog("");
      setCommitLogError(err instanceof Error ? err.message : "加载最近提交失败");
    } finally {
      setCommitLogLoading(false);
    }
  }, [rootPath]);

  useEffect(() => {
    if (activeTab === "changes" && commitLogPanelOpen) {
      void loadRecentGitLog();
    }
  }, [activeTab, commitLogPanelOpen, loadRecentGitLog]);

  const handleCommitLogToggle = useCallback(() => {
    setCommitLogPanelOpen((open) => !open);
  }, []);

  const handleCommit = useCallback(async (message: string) => {
    if (!message.trim()) return;
    setCommitLoading(true);
    setDraftMessage(null);
    try {
      const committablePaths = [
        ...git.changedFiles.filter((f) => f.worktreeStatus !== "D").map((f) => f.path),
        ...git.untrackedFiles.map((f) => f.path),
      ];
      await desktopApi.gitStage(rootPath, committablePaths);
      await desktopApi.gitCommit(rootPath, message.trim());
      await git.refresh();
      if (commitLogPanelOpen) {
        await loadRecentGitLog();
      }
    } catch (err) {
      window.alert(`提交失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setCommitLoading(false);
    }
  }, [rootPath, git, commitLogPanelOpen, loadRecentGitLog]);

  const handleGenerateCommitMessage = useCallback(async () => {
    setDraftMessage("");
    setCommitMessageLoading(true);
    try {
      const message = await desktopApi.gitGenerateCommitMessage(rootPath);
      setDraftMessage(message);
    } catch (err) {
      window.alert(`生成失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setCommitMessageLoading(false);
    }
  }, [rootPath]);

  const handlePush = useCallback(async () => {
    setPushLoading(true);
    try {
      await desktopApi.gitPush(rootPath);
      window.alert("推送成功");
      if (commitLogPanelOpen) {
        await loadRecentGitLog();
      }
    } catch (err) {
      window.alert(`推送失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setPushLoading(false);
    }
  }, [rootPath, commitLogPanelOpen, loadRecentGitLog]);

  const handlePreviewClose = useCallback(() => {
    setPreviewFile(null);
    setPreviewDiff(null);
    setActiveTab("files");
  }, []);

  const breadcrumb = useMemo(() => {
    const parts = rootPath.split("/").filter(Boolean);
    return parts.length > 2
      ? `.../${parts.slice(-2).join("/")}`
      : rootPath;
  }, [rootPath]);

  const gitChangeTree = useMemo(
    () => buildGitChangeTree(git.changedFiles, git.untrackedFiles),
    [git.changedFiles, git.untrackedFiles],
  );

  const recentCommits = useMemo(
    () => parseGitLogLines(recentCommitLog),
    [recentCommitLog],
  );

  const toggleDir = useCallback((dir: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
  }, []);

  const handleOpenGitChange = useCallback((file: GitChangeTreeFile) => {
    if (!file.tracked) {
      void handleOpenUntracked(file.path);
      return;
    }

    if (file.worktreeStatus === "D") {
      void desktopApi.readFileContentAtRef(rootPath, file.path, "HEAD")
        .then((content) => {
          setPreviewFile({ path: `${file.path} (已删除)`, content });
          setPreviewDiff(null);
          setActiveTab("preview");
        })
        .catch(() => {});
      return;
    }

    void handleOpenGitDiff(file.path);
  }, [handleOpenGitDiff, handleOpenUntracked, rootPath]);

  const gitBranchPanel = git.status ? (
    <GitBranchPanel
      branch={git.status.branch}
      clean={!git.status.dirty}
      commits={recentCommits}
      loading={commitLogLoading}
      error={commitLogError}
      onRefresh={loadRecentGitLog}
    />
  ) : null;

  return (
    <div
      className="agent-right-panel"
      style={{ width, transition: resizing ? "none" : "width 300ms ease-in-out" }}
    >
      {/* Tab Bar */}
      <div className="agent-right-panel-tabbar">
        <div className="agent-right-panel-tabs">
          <button
            type="button"
            onClick={() => setActiveTab("files")}
            className={`agent-right-panel-tab ${activeTab === "files" ? "is-active" : ""}`}
          >
            文件
          </button>
          <button
            type="button"
            onClick={() => {
              void git.refresh();
              if (activeTab === "changes" && commitLogPanelOpen) {
                void loadRecentGitLog();
              } else {
                setActiveTab("changes");
              }
            }}
            className={`agent-right-panel-tab ${activeTab === "changes" ? "is-active" : ""}`}
          >
            变更
            {git.status?.dirty ? (
              <span className="ml-1.5 inline-flex size-1.5 rounded-full bg-primary" />
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("preview")}
            className={`agent-right-panel-tab ${activeTab === "preview" ? "is-active" : ""}`}
          >
            预览
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="agent-right-panel-body">
        {/* Files Tab */}
        {activeTab === "files" && (
          <div className="agent-right-panel-files">
            <div className="agent-right-panel-toolbar">
              <FolderOpen size={13} className="agent-right-panel-toolbar-icon" />
              <span className="agent-right-panel-breadcrumb" title={rootPath}>
                {breadcrumb}
              </span>
              <div className="agent-right-panel-toolbar-actions">
                <button
                  type="button"
                  className="agent-right-panel-toolbar-btn"
                  onClick={loadRoot}
                  disabled={fileLoading}
                  title="刷新"
                  aria-label="刷新文件列表"
                >
                  <RefreshCw
                    size={13}
                    className={fileLoading ? "is-spinning" : ""}
                  />
                </button>
              </div>
            </div>

            <div className="agent-right-panel-tree">
              {fileError ? (
                <div className="agent-right-panel-error">{fileError}</div>
              ) : (
                <FileBrowser
                  roots={roots}
                  onExpand={handleExpand}
                  onOpen={handleOpenFile}
                />
              )}
            </div>
          </div>
        )}

        {/* Changes Tab */}
        {activeTab === "changes" && (
          <div className="agent-right-panel-changes">
            {/* Git status bar */}
            {git.status && (
              <div className="agent-right-panel-git-bar">
                <button
                  type="button"
                  className={`agent-right-panel-toolbar-btn git-branch-toggle ${commitLogPanelOpen ? "is-active" : ""}`}
                  onClick={handleCommitLogToggle}
                  title={commitLogPanelOpen ? "隐藏提交记录" : "显示提交记录"}
                  aria-label={commitLogPanelOpen ? "隐藏提交记录" : "显示提交记录"}
                  aria-expanded={commitLogPanelOpen}
                  aria-controls="git-commit-history-panel"
                >
                  <GitBranch size={13} />
                </button>
                <span className="git-branch-name">{git.status.branch}</span>
                <span
                  className={`git-status-badge ${git.status.dirty ? "is-dirty" : "is-clean"}`}
                >
                  {git.status.dirty ? "dirty" : "clean"}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  {git.status.dirty && draftMessage === null && (
                    <>
                      <button
                        type="button"
                        className="agent-right-panel-toolbar-btn"
                        onClick={handleGenerateCommitMessage}
                        disabled={commitMessageLoading || commitLoading}
                        title="智能生成 Commit Message"
                        aria-label="智能生成 Commit Message"
                      >
                        <WandSparkles size={13} className={commitMessageLoading ? "is-spinning" : ""} />
                      </button>
                      <button
                        type="button"
                        className="agent-right-panel-toolbar-btn"
                        onClick={() => setDraftMessage("")}
                        disabled={commitLoading}
                        title="暂存全部变更并提交"
                        aria-label="提交 Git Commit"
                      >
                        <GitCommit size={13} />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="agent-right-panel-toolbar-btn"
                    onClick={handlePush}
                    disabled={pushLoading}
                    title="推送"
                    aria-label="推送到远程仓库"
                  >
                    <ArrowUp size={13} className={pushLoading ? "is-spinning" : ""} />
                  </button>
                  <button
                    type="button"
                    className="agent-right-panel-toolbar-btn"
                    onClick={() => {
                      void git.refresh();
                      if (commitLogPanelOpen) {
                        void loadRecentGitLog();
                      }
                    }}
                    disabled={git.loading}
                    title="刷新"
                    aria-label="刷新 Git 状态"
                  >
                    <RefreshCw
                      size={13}
                      className={git.loading ? "is-spinning" : ""}
                    />
                  </button>
                </div>
              </div>
            )}

            {/* Inline commit message input */}
            {draftMessage !== null && (
              <div className="agent-right-panel-commit-form">
                <input
                  type="text"
                  className="agent-right-panel-commit-input"
                  placeholder={commitMessageLoading ? "正在生成 commit message..." : "输入 commit message，按 Enter 提交"}
                  value={draftMessage}
                  onChange={(e) => setDraftMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && draftMessage.trim()) {
                      handleCommit(draftMessage);
                    } else if (e.key === "Escape") {
                      setDraftMessage(null);
                    }
                  }}
                  autoFocus
                  disabled={commitLoading}
                />
                <button
                  type="button"
                  className="agent-right-panel-toolbar-btn"
                  onClick={handleGenerateCommitMessage}
                  disabled={commitMessageLoading || commitLoading}
                  title="智能生成 Commit Message"
                  aria-label="智能生成 Commit Message"
                >
                  <WandSparkles size={13} className={commitMessageLoading ? "is-spinning" : ""} />
                </button>
                <button
                  type="button"
                  className="agent-right-panel-toolbar-btn"
                  onClick={() => handleCommit(draftMessage)}
                  disabled={!draftMessage.trim() || commitLoading}
                  title="提交"
                >
                  <GitCommit size={13} />
                </button>
                <button
                  type="button"
                  className="agent-right-panel-toolbar-btn"
                  onClick={() => setDraftMessage(null)}
                  disabled={commitLoading}
                  title="取消"
                >
                  ×
                </button>
              </div>
            )}

            <div className="git-change-scroll-area">
              {git.error && (
                <div className="agent-right-panel-error">{git.error}</div>
              )}

              {!git.status && !git.loading && !git.error && (
                <div className="agent-right-panel-empty">
                  当前目录不是 Git 仓库
                </div>
              )}

              {git.status && gitChangeTree.length === 0 && (
                <div className="agent-right-panel-empty">
                  工作区干净
                </div>
              )}

              {gitChangeTree.length > 0 && (
                <GitChangeTreeView
                  nodes={gitChangeTree}
                  collapsedDirs={collapsedDirs}
                  diffLoading={diffLoading}
                  gitLoading={git.loading}
                  onOpenFile={handleOpenGitChange}
                  onRevert={handleRevert}
                  onStageFile={handleStageFile}
                  onToggleDir={toggleDir}
                />
              )}
            </div>

            {commitLogPanelOpen ? gitBranchPanel : null}
          </div>
        )}

        {/* Preview Tab */}
        {activeTab === "preview" && (
          <div className="agent-right-panel-preview">
            <PreviewPanel
              file={previewFile}
              diff={previewDiff}
              onClose={handlePreviewClose}
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface GitChangeTreeViewProps {
  nodes: GitChangeTreeNode[];
  collapsedDirs: Set<string>;
  diffLoading: boolean;
  gitLoading: boolean;
  depth?: number;
  onOpenFile: (file: GitChangeTreeFile) => void;
  onRevert: (filePath: string) => void;
  onStageFile: (filePath: string) => void;
  onToggleDir: (dir: string) => void;
}

function GitChangeTreeView({
  nodes,
  collapsedDirs,
  diffLoading,
  gitLoading,
  depth = 0,
  onOpenFile,
  onRevert,
  onStageFile,
  onToggleDir,
}: GitChangeTreeViewProps) {
  return (
    <div className={depth === 0 ? "git-change-tree" : "git-change-tree-children"}>
      {nodes.map((node) => {
        if (node.type === "directory") {
          const isCollapsed = collapsedDirs.has(node.path);
          return (
            <div className="git-change-tree-node" key={node.id}>
              <button
                type="button"
                className="git-change-tree-dir"
                style={{ paddingLeft: 10 + depth * 14 }}
                onClick={() => onToggleDir(node.path)}
              >
                <ChevronDown className={`git-change-tree-chevron ${isCollapsed ? "is-collapsed" : ""}`} size={12} />
                <FolderOpen size={13} className="git-change-tree-icon" />
                <span className="git-change-tree-name">{node.name}</span>
                <span className="git-change-tree-count">{node.fileCount}</span>
              </button>
              {!isCollapsed && (
                <GitChangeTreeView
                  nodes={node.children}
                  collapsedDirs={collapsedDirs}
                  diffLoading={diffLoading}
                  gitLoading={gitLoading}
                  depth={depth + 1}
                  onOpenFile={onOpenFile}
                  onRevert={onRevert}
                  onStageFile={onStageFile}
                  onToggleDir={onToggleDir}
                />
              )}
            </div>
          );
        }

        return (
          <GitChangeTreeFileRow
            file={node}
            depth={depth}
            diffLoading={diffLoading}
            gitLoading={gitLoading}
            key={node.id}
            onOpenFile={onOpenFile}
            onRevert={onRevert}
            onStageFile={onStageFile}
          />
        );
      })}
    </div>
  );
}

function GitChangeTreeFileRow({
  file,
  depth,
  diffLoading,
  gitLoading,
  onOpenFile,
  onRevert,
  onStageFile,
}: {
  file: GitChangeTreeFile;
  depth: number;
  diffLoading: boolean;
  gitLoading: boolean;
  onOpenFile: (file: GitChangeTreeFile) => void;
  onRevert: (filePath: string) => void;
  onStageFile: (filePath: string) => void;
}) {
  const parentPath = file.path.includes("/") ? file.path.split("/").slice(0, -1).join("/") : "";

  return (
    <div className="git-change-tree-file" style={{ paddingLeft: 22 + depth * 14 }}>
      <button
        type="button"
        className="git-change-file-main"
        onClick={() => onOpenFile(file)}
        disabled={diffLoading}
      >
        <FileText size={13} className="git-change-tree-icon" />
        <span className="git-change-tree-name">{file.name}</span>
        <span className={`git-change-status ${statusToneClass(file)}`}>
          {statusLabel(file)}
        </span>
        {parentPath ? (
          <span className="git-change-tree-path">{parentPath}</span>
        ) : null}
      </button>
      <div className="git-change-tree-actions">
        {file.tracked ? (
          <button
            type="button"
            className="git-change-file-action"
            onClick={() => onRevert(file.path)}
            title="还原变更"
            aria-label={`还原 ${file.path}`}
          >
            <Undo2 size={13} />
          </button>
        ) : (
          <button
            type="button"
            className="git-change-file-action git-stage-btn"
            onClick={() => onStageFile(file.path)}
            disabled={gitLoading}
            title="暂存文件"
            aria-label={`暂存 ${file.path}`}
          >
            <Plus size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function GitBranchPanel({
  branch,
  clean,
  commits,
  loading,
  error,
  onRefresh,
}: {
  branch: string;
  clean: boolean;
  commits: GitRecentCommit[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <section className="git-branch-panel" id="git-commit-history-panel">
      <div className="git-branch-panel-header">
        <div>
          <div className="git-branch-panel-kicker">提交记录</div>
          <div className="git-branch-panel-branch">
            <GitBranch size={13} />
            <span>{branch}</span>
            <span className={`git-status-badge ${clean ? "is-clean" : "is-dirty"}`}>
              {clean ? "clean" : "dirty"}
            </span>
          </div>
        </div>
        <div className="git-branch-panel-actions">
          <button
            type="button"
            className="agent-right-panel-toolbar-btn"
            onClick={onRefresh}
            disabled={loading}
            title="刷新最近提交"
            aria-label="刷新最近提交"
          >
            <RefreshCw size={13} className={loading ? "is-spinning" : ""} />
          </button>
        </div>
      </div>

      <div className="git-branch-panel-content">
        <div className="git-branch-panel-title">最近提交</div>
        {error ? (
          <div className="git-branch-panel-empty">{error}</div>
        ) : loading && commits.length === 0 ? (
          <div className="git-branch-panel-empty">加载中...</div>
        ) : commits.length > 0 ? (
          <div className="git-recent-commit-list">
            {commits.map((commit) => (
              <GitRecentCommitRow commit={commit} key={`${commit.hash}-${commit.subject}`} />
            ))}
          </div>
        ) : (
          <div className="git-branch-panel-empty">暂无提交记录</div>
        )}
      </div>
    </section>
  );
}

function GitRecentCommitRow({ commit }: { commit: GitRecentCommit }) {
  return (
    <div className="git-recent-commit" title={commit.raw}>
      <span className="git-recent-commit-hash">{commit.hash || "----"}</span>
      <span className="git-recent-commit-subject">{commit.subject}</span>
      {commit.refs.slice(0, 2).map((ref) => (
        <span className="git-recent-commit-ref" key={ref}>{ref}</span>
      ))}
    </div>
  );
}

function statusLabel(file: GitChangeTreeFile) {
  if (!file.tracked) return "新文件";
  switch (file.status[0]) {
    case "M": return "已修改";
    case "A": return "新增";
    case "D": return "已删除";
    case "R": return "重命名";
    default: return "变更";
  }
}

function statusToneClass(file: GitChangeTreeFile) {
  if (!file.tracked) return "is-untracked";
  switch (file.status[0]) {
    case "M": return "is-modified";
    case "A": return "is-added";
    case "D": return "is-deleted";
    case "R": return "is-renamed";
    default: return "is-changed";
  }
}
