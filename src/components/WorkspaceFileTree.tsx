import { useState, useCallback, useEffect, memo } from "react";
import { FolderGit2, RefreshCw, Loader2 } from "lucide-react";
import { FileBrowser, type FileTreeNode } from "./FileBrowser";
import { desktopApi } from "../services/desktopApi";

interface WorkspaceFileTreeProps {
  rootPath: string;
  onFileOpen?: (filePath: string) => void;
  className?: string;
}

function ipcEntryToTreeNode(entry: {
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

export const WorkspaceFileTree = memo(function WorkspaceFileTree({
  rootPath,
  onFileOpen,
  className,
}: WorkspaceFileTreeProps) {
  const [roots, setRoots] = useState<FileTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRoot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const entries = await desktopApi.listDirectory(rootPath);
      setRoots(entries.map(ipcEntryToTreeNode));
    } catch (e) {
      setError("加载目录失败");
      setRoots([]);
    } finally {
      setLoading(false);
    }
  }, [rootPath]);

  useEffect(() => {
    loadRoot();
  }, [loadRoot]);

  const handleExpand = useCallback(async (node: FileTreeNode) => {
    if (node.type !== "directory") return [];
    try {
      const entries = await desktopApi.listDirectory(node.path);
      node.children = entries.map(ipcEntryToTreeNode);
      return node.children;
    } catch {
      return [];
    }
  }, []);

  const handleOpen = useCallback(
    (node: FileTreeNode) => {
      if (node.type === "file" && onFileOpen) {
        onFileOpen(node.path);
      }
    },
    [onFileOpen],
  );

  return (
    <div className={["workspace-file-tree", className].filter(Boolean).join(" ")}>
      <div className="workspace-file-tree-header">
        <FolderGit2 size={14} className="workspace-file-tree-header-icon" />
        <span className="workspace-file-tree-header-label">Files</span>
        <button
          type="button"
          className="workspace-file-tree-refresh"
          onClick={loadRoot}
          aria-label="刷新文件列表"
          disabled={loading}
        >
          {loading ? (
            <Loader2 size={13} className="is-spinning" />
          ) : (
            <RefreshCw size={13} />
          )}
        </button>
      </div>
      {error ? (
        <div className="workspace-file-tree-error">{error}</div>
      ) : (
        <FileBrowser
          roots={roots}
          onExpand={handleExpand}
          onOpen={handleOpen}
        />
      )}
    </div>
  );
});
