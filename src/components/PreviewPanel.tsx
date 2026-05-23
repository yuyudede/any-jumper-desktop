import { useState, useMemo, memo, useCallback, useEffect, useRef } from "react";
import { X, Columns2, Rows3, FileCode, FolderOpen } from "lucide-react";
import { codeToTokens } from "shiki";
import type { BundledLanguage, ThemedToken } from "shiki";

export interface PreviewFile {
  path: string;
  content: string;
  language?: string;
}

export interface PreviewDiff {
  oldPath: string;
  newPath: string;
  oldContent: string;
  newContent: string;
}

type DiffMode = "unified" | "split";

interface PreviewPanelProps {
  file: PreviewFile | null;
  diff: PreviewDiff | null;
  onClose: () => void;
  className?: string;
}

type DiffLineType = "add" | "del" | "context" | "header" | "hunk";

interface DiffLine {
  type: DiffLineType;
  oldNum?: number;
  newNum?: number;
  content: string;
}

function computeUnifiedDiff(oldContent: string, newContent: string): DiffLine[] {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const result: DiffLine[] = [];

  // Simple line-by-line diff
  result.push({ type: "header", content: `--- a/old` });
  result.push({ type: "header", content: `+++ b/new` });

  const maxLen = Math.max(oldLines.length, newLines.length);
  let contextStart = 0;
  let inHunk = false;

  const flushContext = (end: number) => {
    if (end > contextStart) {
      if (inHunk) {
        result.push({ type: "hunk", content: `@@ -${contextStart + 1},${end - contextStart} +${contextStart + 1},${end - contextStart} @@` });
      }
      for (let j = contextStart; j < end; j++) {
        result.push({
          type: "context",
          oldNum: j + 1,
          newNum: j + 1,
          content: (oldLines[j] ?? ""),
        });
      }
    }
    contextStart = end;
    inHunk = false;
  };

  let i = 0;
  while (i < maxLen) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined;
    const newLine = i < newLines.length ? newLines[i] : undefined;

    if (oldLine === newLine) {
      flushContext(i);
      contextStart = i + 1;
    } else {
      if (!inHunk) {
        // Start a new hunk — include 2 lines of context before
        const ctxStart = Math.max(0, i - 2);
        flushContext(ctxStart);
        contextStart = i;
        inHunk = true;
      }
      if (oldLine !== undefined) {
        result.push({ type: "del", oldNum: i + 1, content: oldLine });
      }
      if (newLine !== undefined) {
        // Check if line was deleted then added (modification)
        const wasDeleted = oldLine !== undefined;
        result.push({ type: "add", newNum: i + 1, content: newLine });
      }
    }
    i++;
  }
  flushContext(maxLen);

  return result;
}

function DiffUnifiedView({ diffLines }: { diffLines: DiffLine[] }) {
  return (
    <div className="preview-diff-unified">
      {diffLines.map((line, i) => (
        <div
          key={i}
          className={[
            "preview-diff-line",
            line.type === "add" ? "preview-diff-add" : "",
            line.type === "del" ? "preview-diff-del" : "",
            line.type === "header" ? "preview-diff-header" : "",
            line.type === "hunk" ? "preview-diff-hunk" : "",
          ].join(" ")}
        >
          <span className="preview-diff-ln-old">
            {line.oldNum ?? ""}
          </span>
          <span className="preview-diff-ln-new">
            {line.newNum ?? ""}
          </span>
          <span className="preview-diff-prefix">
            {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
          </span>
          <code className="preview-diff-code">{line.content}</code>
        </div>
      ))}
    </div>
  );
}

function DiffSplitView({ diffLines }: { diffLines: DiffLine[] }) {
  // Group lines into left (old) and right (new) pairs
  const rows: { left: DiffLine | null; right: DiffLine | null }[] = [];
  let i = 0;
  while (i < diffLines.length) {
    const line = diffLines[i];
    if (line.type === "del") {
      const nextLine = i + 1 < diffLines.length ? diffLines[i + 1] : null;
      if (nextLine?.type === "add") {
        rows.push({ left: line, right: nextLine });
        i += 2;
        continue;
      }
      rows.push({ left: line, right: null });
    } else if (line.type === "add") {
      rows.push({ left: null, right: line });
    } else {
      rows.push({ left: line, right: line });
    }
    i++;
  }

  return (
    <div className="preview-diff-split">
      {rows.map((row, i) => (
        <div key={i} className="preview-diff-split-row">
          <div
            className={[
              "preview-diff-split-cell",
              row.left?.type === "del" ? "preview-diff-del" : "",
              row.left?.type === "header" ? "preview-diff-header" : "",
              row.left?.type === "hunk" ? "preview-diff-hunk" : "",
            ].join(" ")}
          >
            <span className="preview-diff-ln-old">
              {row.left?.oldNum ?? ""}
            </span>
            <span className="preview-diff-prefix">
              {row.left?.type === "del" ? "-" : " "}
            </span>
            <code className="preview-diff-code">{row.left?.content ?? ""}</code>
          </div>
          <div
            className={[
              "preview-diff-split-cell",
              row.right?.type === "add" ? "preview-diff-add" : "",
              row.right?.type === "header" ? "preview-diff-header" : "",
              row.right?.type === "hunk" ? "preview-diff-hunk" : "",
            ].join(" ")}
          >
            <span className="preview-diff-ln-new">
              {row.right?.newNum ?? ""}
            </span>
            <span className="preview-diff-prefix">
              {row.right?.type === "add" ? "+" : " "}
            </span>
            <code className="preview-diff-code">{row.right?.content ?? ""}</code>
          </div>
        </div>
      ))}
    </div>
  );
}

function getLanguageFromPath(path: string): BundledLanguage {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const langMap: Record<string, BundledLanguage> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    json: "json",
    css: "css",
    scss: "scss",
    html: "html",
    md: "markdown",
    markdown: "markdown",
    py: "python",
    rs: "rust",
    go: "go",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    yml: "yaml",
    yaml: "yaml",
    toml: "toml",
    xml: "xml",
    sql: "sql",
    graphql: "graphql",
    vue: "vue",
    svelte: "svelte",
    rb: "ruby",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    dart: "dart",
    lua: "lua",
    r: "r",
    dockerfile: "dockerfile",
    tex: "latex",
    proto: "protobuf",
  };
  return langMap[ext] || "text";
}

function fontStyleToCSS(style: unknown): string | undefined {
  if (style === undefined || style === null) return undefined;
  const s = style as number;
  const parts: string[] = [];
  if (s & 1) parts.push("italic");
  if (s & 2) parts.push("bold");
  if (s & 4) parts.push("underline");
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function FilePreview({ file }: { file: PreviewFile }) {
  const [tokens, setTokens] = useState<ThemedToken[][]>([]);
  const abortRef = useRef(false);

  const lines = useMemo(() => file.content.split("\n"), [file.content]);
  const lang = file.language || getLanguageFromPath(file.path);

  useEffect(() => {
    let cancelled = false;
    abortRef.current = false;

    async function run() {
      try {
        const isDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
        const result = await codeToTokens(file.content, {
          lang: lang as BundledLanguage,
          theme: isDark ? "github-dark" : "github-light",
        });
        if (!cancelled && !abortRef.current) {
          setTokens(result.tokens);
        }
      } catch {
        if (!cancelled && !abortRef.current) {
          setTokens([]);
        }
      }
    }

    void run();

    const onThemeChange = () => {
      void run();
    };
    window.addEventListener("any-jumper-theme-change", onThemeChange);
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener("change", onThemeChange);

    return () => {
      cancelled = true;
      abortRef.current = true;
      window.removeEventListener("any-jumper-theme-change", onThemeChange);
      media?.removeEventListener("change", onThemeChange);
    };
  }, [file.content, lang]);

  const highlighted = tokens.length > 0;

  return (
    <div className="preview-file-content">
      <div className="preview-file-header">
        <FileCode size={14} />
        <span className="preview-file-path">{file.path}</span>
        <span className="preview-file-lang">{lang}</span>
        <span className="preview-file-meta">{lines.length} 行</span>
      </div>
      <pre className="preview-file-code">
        <code>
          {lines.map((rawLine, i) => {
            const lineTokens = tokens[i];
            return (
              <div key={i} className="preview-file-line">
                <span className="preview-file-ln">{i + 1}</span>
                <span className="preview-file-line-content">
                  {highlighted && lineTokens ? (
                    lineTokens.map((token, j) => (
                      <span
                        key={j}
                        style={{
                          color: token.color,
                          fontStyle: fontStyleToCSS(token.fontStyle),
                          fontWeight: fontStyleToCSS(token.fontStyle)?.includes("bold")
                            ? "bold"
                            : undefined,
                        }}
                      >
                        {token.content}
                      </span>
                    ))
                  ) : (
                    rawLine
                  )}
                </span>
              </div>
            );
          })}
        </code>
      </pre>
    </div>
  );
}

export const PreviewPanel = memo(function PreviewPanel({
  file,
  diff,
  onClose,
  className,
}: PreviewPanelProps) {
  const [diffMode, setDiffMode] = useState<DiffMode>("unified");

  const diffLines = useMemo(() => {
    if (!diff) return null;
    return computeUnifiedDiff(diff.oldContent, diff.newContent);
  }, [diff]);

  const hasContent = file || diff;

  if (!hasContent) return null;

  return (
    <div className={["preview-panel", className].filter(Boolean).join(" ")}>
      <div className="preview-panel-toolbar">
        <div className="preview-panel-title">
          <FolderOpen size={14} />
          <span className="preview-panel-path">
            {diff ? diff.newPath : file?.path ?? ""}
          </span>
        </div>
        <div className="preview-panel-actions">
          {diff && (
            <div className="preview-diff-mode-toggle">
              <button
                type="button"
                className={`preview-mode-btn ${diffMode === "unified" ? "is-active" : ""}`}
                onClick={() => setDiffMode("unified")}
                aria-label="统一视图"
              >
                <Rows3 size={14} />
              </button>
              <button
                type="button"
                className={`preview-mode-btn ${diffMode === "split" ? "is-active" : ""}`}
                onClick={() => setDiffMode("split")}
                aria-label="分栏视图"
              >
                <Columns2 size={14} />
              </button>
            </div>
          )}
          <button
            type="button"
            className="preview-close-btn"
            onClick={onClose}
            aria-label="关闭预览"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="preview-panel-body">
        {diff && diffLines ? (
          diffMode === "unified" ? (
            <DiffUnifiedView diffLines={diffLines} />
          ) : (
            <DiffSplitView diffLines={diffLines} />
          )
        ) : file ? (
          <FilePreview file={file} />
        ) : null}
      </div>
    </div>
  );
});
