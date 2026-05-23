import {
  useState,
  useCallback,
  useRef,
  useEffect,
  memo,
  type KeyboardEvent,
} from "react";
import {
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  FileImage,
  FileJson,
  Check,
  X,
} from "lucide-react";

export interface FileTreeNode {
  id: string;
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
  /** When true, children haven't been loaded yet (lazy) */
  hasChildren?: boolean;
}

interface FileBrowserProps {
  roots: FileTreeNode[];
  selectedIds?: Set<string>;
  onSelect?: (ids: Set<string>) => void;
  onOpen?: (node: FileTreeNode) => void;
  onExpand?: (node: FileTreeNode) => Promise<FileTreeNode[]>;
  onRename?: (node: FileTreeNode, newName: string) => void;
  /** File path to auto-reveal and highlight */
  revealPath?: string;
  className?: string;
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return <FileCode size={15} className="filebrowser-icon filebrowser-icon-code" />;
    case "json":
      return <FileJson size={15} className="filebrowser-icon filebrowser-icon-json" />;
    case "md":
    case "txt":
    case "log":
    case "csv":
    case "yaml":
    case "yml":
    case "toml":
      return <FileText size={15} className="filebrowser-icon filebrowser-icon-text" />;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
    case "webp":
    case "ico":
      return <FileImage size={15} className="filebrowser-icon filebrowser-icon-image" />;
    default:
      return <File size={15} className="filebrowser-icon filebrowser-icon-file" />;
  }
}

export const FileBrowser = memo(function FileBrowser({
  roots,
  selectedIds,
  onSelect,
  onOpen,
  onExpand,
  onRename,
  revealPath,
  className,
}: FileBrowserProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (revealPath) {
      // Expand ancestors of revealPath
      const parts = revealPath.split("/").filter(Boolean);
      let current = "";
      for (const part of parts.slice(0, -1)) {
        current += "/" + part;
        initial.add(current);
      }
    }
    return initial;
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);

  // Auto-reveal: scroll to the target node
  useEffect(() => {
    if (!revealPath || !treeRef.current) return;
    const timer = setTimeout(() => {
      const el = treeRef.current?.querySelector(`[data-path="${revealPath}"]`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.classList.add("filebrowser-reveal-flash");
        setTimeout(() => el.classList.remove("filebrowser-reveal-flash"), 1500);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [revealPath]);

  const toggleExpand = useCallback(
    async (node: FileTreeNode) => {
      const next = new Set(expandedIds);
      if (next.has(node.path)) {
        next.delete(node.path);
        setExpandedIds(next);
      } else {
        next.add(node.path);
        setExpandedIds(next);
        if (node.hasChildren && onExpand && (!node.children || node.children.length === 0)) {
          await onExpand(node);
        }
      }
    },
    [expandedIds, onExpand],
  );

  const handleSelect = useCallback(
    (node: FileTreeNode, e: React.MouseEvent) => {
      if (!onSelect) return;
      const next = new Set(selectedIds);
      if (e.metaKey || e.ctrlKey) {
        if (next.has(node.path)) {
          next.delete(node.path);
        } else {
          next.add(node.path);
        }
      } else if (e.shiftKey && selectedIds && selectedIds.size > 0) {
        // Range select (simplified: just toggle)
        next.add(node.path);
      } else {
        next.clear();
        next.add(node.path);
      }
      onSelect(next);
    },
    [selectedIds, onSelect],
  );

  const handleDoubleClick = useCallback(
    (node: FileTreeNode) => {
      if (node.type === "directory") {
        toggleExpand(node);
      } else if (onOpen) {
        onOpen(node);
      }
    },
    [toggleExpand, onOpen],
  );

  const startRename = useCallback((node: FileTreeNode) => {
    setEditingId(node.path);
    setEditValue(node.name);
    // Focus after render
    setTimeout(() => editInputRef.current?.focus(), 0);
  }, []);

  const commitRename = useCallback(() => {
    if (!editingId || !onRename) return;
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== editingId.split("/").pop()) {
      const node = findNodeByPath(roots, editingId);
      if (node) onRename(node, trimmed);
    }
    setEditingId(null);
  }, [editingId, editValue, onRename, roots]);

  const cancelRename = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent, node: FileTreeNode) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (node.type === "directory") {
          toggleExpand(node);
        } else if (onOpen) {
          onOpen(node);
        }
      } else if (e.key === "F2") {
        e.preventDefault();
        startRename(node);
      }
    },
    [toggleExpand, onOpen, startRename],
  );

  const handleEditKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitRename();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancelRename();
      }
    },
    [commitRename, cancelRename],
  );

  const renderNode = useCallback(
    (node: FileTreeNode, depth: number) => {
      const isExpanded = expandedIds.has(node.path);
      const isSelected = selectedIds?.has(node.path);
      const isEditing = editingId === node.path;
      const isReveal = revealPath === node.path;

      return (
        <div key={node.path}>
          <div
            className={[
              "filebrowser-row",
              isSelected ? "filebrowser-row-selected" : "",
              isReveal ? "filebrowser-row-reveal" : "",
            ].join(" ")}
            style={{ paddingLeft: `${depth * 16 + 4}px` }}
            data-path={node.path}
            role="treeitem"
            aria-selected={isSelected}
            aria-expanded={node.type === "directory" ? isExpanded : undefined}
            tabIndex={0}
            onClick={(e) => handleSelect(node, e)}
            onDoubleClick={() => handleDoubleClick(node)}
            onKeyDown={(e) => handleKeyDown(e, node)}
          >
            {node.type === "directory" ? (
              <button
                type="button"
                className="filebrowser-chevron"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(node);
                }}
                tabIndex={-1}
              >
                <ChevronRight
                  size={14}
                  className={isExpanded ? "filebrowser-chevron-open" : ""}
                />
              </button>
            ) : (
              <span className="filebrowser-chevron-spacer" />
            )}

            {node.type === "directory" ? (
              isExpanded ? (
                <FolderOpen size={15} className="filebrowser-icon filebrowser-icon-folder" />
              ) : (
                <Folder size={15} className="filebrowser-icon filebrowser-icon-folder" />
              )
            ) : (
              getFileIcon(node.name)
            )}

            {isEditing ? (
              <div className="filebrowser-rename-input-wrap">
                <input
                  ref={editInputRef}
                  className="filebrowser-rename-input"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={handleEditKeyDown}
                />
                <span className="filebrowser-rename-actions">
                  <button
                    type="button"
                    className="filebrowser-rename-btn filebrowser-rename-confirm"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      commitRename();
                    }}
                  >
                    <Check size={12} />
                  </button>
                  <button
                    type="button"
                    className="filebrowser-rename-btn filebrowser-rename-cancel"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      cancelRename();
                    }}
                  >
                    <X size={12} />
                  </button>
                </span>
              </div>
            ) : (
              <span className="filebrowser-name">{node.name}</span>
            )}
          </div>

          {node.type === "directory" && isExpanded && node.children && (
            <div role="group">
              {node.children.map((child) => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    },
    [
      expandedIds,
      selectedIds,
      editingId,
      revealPath,
      handleSelect,
      handleDoubleClick,
      handleKeyDown,
      toggleExpand,
      editValue,
      commitRename,
      cancelRename,
      handleEditKeyDown,
    ],
  );

  return (
    <div
      ref={treeRef}
      className={["filebrowser", className].filter(Boolean).join(" ")}
      role="tree"
    >
      {roots.length === 0 ? (
        <div className="filebrowser-empty">暂无文件</div>
      ) : (
        roots.map((root) => renderNode(root, 0))
      )}
    </div>
  );
});

function findNodeByPath(nodes: FileTreeNode[], path: string): FileTreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.children) {
      const found = findNodeByPath(node.children, path);
      if (found) return found;
    }
  }
  return null;
}
