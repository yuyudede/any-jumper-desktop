import { useState, useCallback, useMemo, useEffect } from "react";
import {
  PanelRightClose,
  RefreshCw,
  FolderOpen,
  GitBranch,
  GitCommit,
  Undo2,
  FileText,
  ChevronDown,
  ArrowUp,
} from "lucide-react";
import { FileBrowser, type FileTreeNode } from "./FileBrowser";
import { PreviewPanel, type PreviewFile, type PreviewDiff } from "./PreviewPanel";
import { desktopApi } from "../services/desktopApi";
import { useGitService } from "../services/gitService";
import type { GitStatus } from "../types";

type RightPanelTab = "files" | "changes" | "preview";

interface RightPanelProps {
  rootPath: string;
  width: number;
  resizing?: boolean;
  onClose: () => void;
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

export function RightPanel({ rootPath, width, resizing = false, onClose }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<RightPanelTab>("files");
  const [roots, setRoots] = useState<FileTreeNode[]>([]);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setError] = useState<string | null>(null);

  // Preview state
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  const [previewDiff, setPreviewDiff] = useState<PreviewDiff | null>(null);

  // Git state
  const git = useGitService(rootPath);
  const [diffLoading, setDiffLoading] = useState(false);
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  const [commitLoading, setCommitLoading] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);

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

  const handleCommit = useCallback(async (message: string) => {
    if (!message.trim()) return;
    setCommitLoading(true);
    setDraftMessage(null);
    try {
      await desktopApi.gitStage(rootPath, git.changedFiles.filter((f) => f.worktreeStatus !== "D").map((f) => f.path));
      await desktopApi.gitCommit(rootPath, message.trim());
      await git.refresh();
    } catch (err) {
      window.alert(`提交失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setCommitLoading(false);
    }
  }, [rootPath, git]);

  const handlePush = useCallback(async () => {
    setPushLoading(true);
    try {
      await desktopApi.gitPush(rootPath);
      window.alert("推送成功");
    } catch (err) {
      window.alert(`推送失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setPushLoading(false);
    }
  }, [rootPath]);

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

  // Group changed files by directory
  const fileGroups = useMemo(() => {
    const dirMap = new Map<string, typeof git.changedFiles>();
    for (const f of git.changedFiles) {
      const parts = f.path.split("/");
      const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : ".";
      if (!dirMap.has(dir)) dirMap.set(dir, []);
      dirMap.get(dir)!.push(f);
    }
    return [...dirMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [git.changedFiles]);

  const toggleDir = useCallback((dir: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
  }, []);

  const statusLabel = (s: string) => {
    switch (s[0]) {
      case "M": return "已修改";
      case "A": return "新增";
      case "D": return "已删除";
      case "R": return "重命名";
      default: return "变更";
    }
  };

  const statusColor = (s: string) => {
    switch (s[0]) {
      case "M": return "text-amber-500";
      case "A": return "text-green-500";
      case "D": return "text-red-500";
      case "R": return "text-blue-500";
      default: return "text-muted-foreground";
    }
  };

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
            onClick={() => { setActiveTab("changes"); git.refresh(); }}
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
        <button
          type="button"
          className="agent-right-panel-close"
          onClick={onClose}
          title="折叠面板"
          aria-label="折叠面板"
        >
          <PanelRightClose size={16} />
        </button>
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
                <GitBranch size={13} />
                <span className="git-branch-name">{git.status.branch}</span>
                <span
                  className={`git-status-badge ${git.status.dirty ? "is-dirty" : "is-clean"}`}
                >
                  {git.status.dirty ? "dirty" : "clean"}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  {git.status.dirty && draftMessage === null && (
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
                    onClick={git.refresh}
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
                  placeholder="输入 commit message，按 Enter 提交"
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

            {git.error && (
              <div className="agent-right-panel-error">{git.error}</div>
            )}

            {!git.status && !git.loading && !git.error && (
              <div className="agent-right-panel-empty">
                当前目录不是 Git 仓库
              </div>
            )}

            {git.status && git.changedFiles.length === 0 && git.untrackedFiles.length === 0 && (
              <div className="agent-right-panel-empty">
                工作区干净
              </div>
            )}

            {/* Changed files grouped by directory */}
            {fileGroups.map(([dir, files]) => {
              const isCollapsed = collapsedDirs.has(dir);
              return (
                <div key={dir}>
                  {dir !== "." && (
                    <button
                      type="button"
                      onClick={() => toggleDir(dir)}
                      className="git-change-dir"
                    >
                      <ChevronDown
                        size={12}
                        className={`transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                      />
                      <span className="truncate">{dir}</span>
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {files.length} 个文件
                      </span>
                    </button>
                  )}
                  {!isCollapsed && files.map((file) => (
                    <div
                      key={file.path}
                      className="git-change-file group"
                    >
                      <button
                        type="button"
                        className="git-change-file-main"
                        onClick={() => {
                          if (file.worktreeStatus === "D") {
                            // Deleted file: show old content as preview
                            desktopApi.readFileContentAtRef(rootPath, file.path, "HEAD")
                              .then((content) => {
                                setPreviewFile({ path: `${file.path} (已删除)`, content });
                                setPreviewDiff(null);
                                setActiveTab("preview");
                              })
                              .catch(() => {});
                          } else {
                            handleOpenGitDiff(file.path);
                          }
                        }}
                        disabled={diffLoading}
                      >
                        <FileText size={13} className="shrink-0" />
                        <span className="truncate ml-1.5">
                          {file.path.split("/").pop()}
                        </span>
                        <span className={`text-[10px] ml-1.5 shrink-0 ${statusColor(file.status)}`}>
                          {statusLabel(file.status)}
                        </span>
                        {file.path.includes("/") && (
                          <span className="text-[10px] text-muted-foreground truncate ml-1">
                            {file.path.split("/").slice(0, -1).join("/")}
                          </span>
                        )}
                        <span className="ml-auto shrink-0 hidden group-hover:flex items-center">
                          <span
                            className="git-revert-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRevert(file.path);
                            }}
                            title="还原变更"
                          >
                            <Undo2 size={13} />
                          </span>
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}

            {/* Untracked files */}
            {git.untrackedFiles.length > 0 && (
              <div>
                <div className="git-change-section-header">
                  未追踪文件
                </div>
                {git.untrackedFiles.map((file) => (
                  <div key={file.path} className="git-change-file">
                    <button
                      type="button"
                      className="git-change-file-main"
                      onClick={() => handleOpenUntracked(file.path)}
                    >
                      <FileText size={13} className="shrink-0" />
                      <span className="truncate ml-1.5">
                        {file.path.split("/").pop()}
                      </span>
                      <span className="text-[10px] ml-1.5 shrink-0 text-amber-500">
                        新文件
                      </span>
                      {file.path.includes("/") && (
                        <span className="text-[10px] text-muted-foreground truncate ml-1">
                          {file.path.split("/").slice(0, -1).join("/")}
                        </span>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
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
