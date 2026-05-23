import { memo, useCallback } from "react";
import { File, FileCode, FileImage, FileJson, FileText } from "lucide-react";

export type FilePathChipTone = "document" | "code" | "data" | "media" | "file";

const DOCUMENT_EXTENSIONS = new Set(["md", "markdown", "mdx", "txt", "log"]);
const CODE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "css",
  "scss",
  "html",
  "vue",
  "svelte",
  "java",
  "kt",
  "go",
  "rs",
  "py",
  "rb",
  "php",
  "sh",
  "sql",
]);
const DATA_EXTENSIONS = new Set(["json", "yaml", "yml", "toml", "xml", "csv"]);
const MEDIA_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"]);

function extensionOf(filePath: string): string {
  return filePath.split(/[\\/]/).pop()?.split(".").pop()?.toLowerCase() ?? "";
}

export function filePathChipTone(filePath: string): FilePathChipTone {
  const ext = extensionOf(filePath);
  if (DOCUMENT_EXTENSIONS.has(ext)) return "document";
  if (CODE_EXTENSIONS.has(ext)) return "code";
  if (DATA_EXTENSIONS.has(ext)) return "data";
  if (MEDIA_EXTENSIONS.has(ext)) return "media";
  return "file";
}

function chipIconForTone(tone: FilePathChipTone) {
  if (tone === "document") return <FileText size={13} />;
  if (tone === "code") return <FileCode size={13} />;
  if (tone === "data") return <FileJson size={13} />;
  if (tone === "media") return <FileImage size={13} />;
  return <File size={13} />;
}

function isAbsoluteFilePath(text: string): boolean {
  // Unix absolute: /xxx
  if (text.startsWith("/")) return true;
  // Windows absolute: C:\xxx or D:\xxx or \\server\share
  if (/^[A-Za-z]:[\\/]/.test(text)) return true;
  if (text.startsWith("\\\\")) return true;
  return false;
}

function isRelativeFilePath(text: string): boolean {
  return text.startsWith("./") || text.startsWith("../");
}

function looksLikeFilePath(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Skip URLs and shell commands
  if (/^(https?|ftp|ws|wss):\/\//.test(trimmed)) return false;
  // Must match file path patterns
  if (isAbsoluteFilePath(trimmed)) return true;
  if (isRelativeFilePath(trimmed)) return true;
  // Filename with common code extension in inline code position
  if (/^[\w./-]+\.[a-zA-Z]{1,8}$/.test(trimmed) && /[./]/.test(trimmed)) return true;
  return false;
}

export const FilePathChip = memo(function FilePathChip({
  filePath,
  onOpen,
  className,
}: {
  filePath: string;
  onOpen?: (filePath: string) => void;
  className?: string;
}) {
  const handleClick = useCallback(() => {
    if (onOpen) {
      onOpen(filePath);
      return;
    }
    void navigator.clipboard.writeText(filePath);
  }, [filePath, onOpen]);

  const tone = filePathChipTone(filePath);

  return (
    <button
      type="button"
      className={[
        "file-path-chip",
        `is-${tone}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={handleClick}
      title={onOpen ? `预览 ${filePath}` : `复制 ${filePath}`}
      aria-label={onOpen ? `预览文件 ${filePath}` : `复制文件路径 ${filePath}`}
    >
      {chipIconForTone(tone)}
      <span>{filePath.split(/[\\/]/).pop() || filePath}</span>
    </button>
  );
});

export function detectFilePath(text: string): string | null {
  const trimmed = text.trim();
  if (looksLikeFilePath(trimmed)) return trimmed;
  return null;
}
