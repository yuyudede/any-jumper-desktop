import { memo, useCallback } from "react";
import { File } from "lucide-react";

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
  className,
}: {
  filePath: string;
  className?: string;
}) {
  const handleClick = useCallback(() => {
    // In Electron, open file via IPC
    const api = (window as any).electronAPI;
    if (api?.openPath) {
      api.openPath(filePath);
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(filePath);
    }
  }, [filePath]);

  return (
    <button
      type="button"
      className={[
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs",
        "bg-primary/10 text-primary hover:underline cursor-pointer",
        "border border-primary/20",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={handleClick}
      title={filePath}
    >
      <File size={11} />
      <span>{filePath.split("/").pop() || filePath}</span>
    </button>
  );
});

export function detectFilePath(text: string): string | null {
  const trimmed = text.trim();
  if (looksLikeFilePath(trimmed)) return trimmed;
  return null;
}
