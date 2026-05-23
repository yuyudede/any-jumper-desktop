import { useState, useCallback, useMemo, useEffect } from "react";
import {
  PanelRightClose,
  RefreshCw,
  FolderOpen,
} from "lucide-react";
import { FileBrowser, type FileTreeNode } from "./FileBrowser";
import { PreviewPanel, type PreviewFile } from "./PreviewPanel";
import { desktopApi } from "../services/desktopApi";

type RightPanelTab = "files" | "preview";

interface RightPanelProps {
  rootPath: string;
  width: number;
  onClose: () => void;
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

export function RightPanel({ rootPath, width, onClose }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<RightPanelTab>("files");
  const [roots, setRoots] = useState<FileTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preview state
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);

  const loadRoot = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const entries = await desktopApi.listDirectory(rootPath);
      setRoots(entries.map(toTreeNode));
    } catch {
      setError("加载失败");
      setRoots([]);
    } finally {
      setLoading(false);
    }
  }, [rootPath]);

  // Lazy load on first render
  useEffect(() => {
    loadRoot();
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
        const content = await desktopApi.readFileContent(node.path);
        setPreviewFile({ path: node.path, content });
        setActiveTab("preview");
      } catch {
        // silent
      }
    },
    [],
  );

  const handlePreviewClose = useCallback(() => {
    setPreviewFile(null);
    setActiveTab("files");
  }, []);

  const breadcrumb = useMemo(() => {
    const parts = rootPath.split("/").filter(Boolean);
    return parts.length > 2
      ? `.../${parts.slice(-2).join("/")}`
      : rootPath;
  }, [rootPath]);

  return (
    <div
      className="agent-right-panel"
      style={{ width }}
    >
      {/* Tab Bar */}
      <div className="agent-right-panel-tabbar">
        <div className="agent-right-panel-tabs">
          <button
            type="button"
            onClick={() => setActiveTab("files")}
            className={`agent-right-panel-tab ${activeTab === "files" ? "is-active" : ""}`}
          >
            工作区文件
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
          title="折叠文件面板"
          aria-label="折叠文件面板"
        >
          <PanelRightClose size={16} />
        </button>
      </div>

      {/* Tab Content */}
      <div className="agent-right-panel-body">
        {activeTab === "files" ? (
          <div className="agent-right-panel-files">
            {/* Toolbar */}
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
                  disabled={loading}
                  title="刷新"
                  aria-label="刷新文件列表"
                >
                  <RefreshCw
                    size={13}
                    className={loading ? "is-spinning" : ""}
                  />
                </button>
              </div>
            </div>

            {/* File Tree */}
            <div className="agent-right-panel-tree">
              {error ? (
                <div className="agent-right-panel-error">{error}</div>
              ) : (
                <FileBrowser
                  roots={roots}
                  onExpand={handleExpand}
                  onOpen={handleOpenFile}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="agent-right-panel-preview">
            <PreviewPanel
              file={previewFile}
              diff={null}
              onClose={handlePreviewClose}
            />
          </div>
        )}
      </div>
    </div>
  );
}
