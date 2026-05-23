export type UnifiedDiffLineKind = "context" | "add" | "delete" | "meta";

export interface UnifiedDiffLine {
  kind: UnifiedDiffLineKind;
  content: string;
  oldNumber?: number;
  newNumber?: number;
}

export interface UnifiedDiffHunk {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  hiddenBefore: number;
  lines: UnifiedDiffLine[];
}

export interface UnifiedDiffFile {
  path: string;
  oldPath: string;
  newPath: string;
  additions: number;
  deletions: number;
  hunks: UnifiedDiffHunk[];
  binary: boolean;
}

export interface UnifiedDiffResult {
  files: UnifiedDiffFile[];
  totalAdditions: number;
  totalDeletions: number;
}

const hunkPattern = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parseUnifiedDiff(diffText: string): UnifiedDiffResult {
  if (!diffText || !diffText.includes("diff --git")) {
    return emptyDiff();
  }

  const files: UnifiedDiffFile[] = [];
  const rows = diffText.replace(/\r\n/g, "\n").split("\n");
  let currentFile: UnifiedDiffFile | undefined;
  let currentHunk: UnifiedDiffHunk | undefined;
  let oldCursor = 0;
  let newCursor = 0;
  let previousOldEnd = 0;

  function closeHunk() {
    if (!currentHunk) return;
    previousOldEnd = Math.max(previousOldEnd, oldCursor - 1);
    currentHunk = undefined;
  }

  for (const row of rows) {
    if (row.startsWith("diff --git ")) {
      closeHunk();
      const paths = parseDiffPaths(row);
      currentFile = {
        path: stripGitPrefix(paths.newPath === "/dev/null" ? paths.oldPath : paths.newPath),
        oldPath: stripGitPrefix(paths.oldPath),
        newPath: stripGitPrefix(paths.newPath),
        additions: 0,
        deletions: 0,
        hunks: [],
        binary: false,
      };
      files.push(currentFile);
      previousOldEnd = 0;
      oldCursor = 0;
      newCursor = 0;
      continue;
    }

    if (!currentFile) continue;

    if (row.startsWith("Binary files ")) {
      currentFile.binary = true;
      continue;
    }

    if (row.startsWith("--- ")) {
      currentFile.oldPath = stripGitPrefix(row.slice(4).trim());
      continue;
    }

    if (row.startsWith("+++ ")) {
      currentFile.newPath = stripGitPrefix(row.slice(4).trim());
      currentFile.path = currentFile.newPath === "/dev/null" ? currentFile.oldPath : currentFile.newPath;
      continue;
    }

    const hunkMatch = row.match(hunkPattern);
    if (hunkMatch) {
      closeHunk();
      const oldStart = Number(hunkMatch[1]);
      const oldCount = Number(hunkMatch[2] || "1");
      const newStart = Number(hunkMatch[3]);
      const newCount = Number(hunkMatch[4] || "1");
      currentHunk = {
        header: row,
        oldStart,
        oldCount,
        newStart,
        newCount,
        hiddenBefore: Math.max(0, oldStart - previousOldEnd - 1),
        lines: [],
      };
      currentFile.hunks.push(currentHunk);
      oldCursor = oldStart;
      newCursor = newStart;
      continue;
    }

    if (!currentHunk) continue;

    if (row.startsWith("\\ No newline")) {
      currentHunk.lines.push({ kind: "meta", content: row });
      continue;
    }

    if (row.startsWith("+")) {
      currentFile.additions += 1;
      currentHunk.lines.push({ kind: "add", content: row.slice(1), newNumber: newCursor });
      newCursor += 1;
      continue;
    }

    if (row.startsWith("-")) {
      currentFile.deletions += 1;
      currentHunk.lines.push({ kind: "delete", content: row.slice(1), oldNumber: oldCursor });
      oldCursor += 1;
      continue;
    }

    currentHunk.lines.push({
      kind: "context",
      content: row.startsWith(" ") ? row.slice(1) : row,
      oldNumber: oldCursor,
      newNumber: newCursor,
    });
    oldCursor += 1;
    newCursor += 1;
  }

  closeHunk();

  return {
    files,
    totalAdditions: files.reduce((sum, file) => sum + file.additions, 0),
    totalDeletions: files.reduce((sum, file) => sum + file.deletions, 0),
  };
}

function emptyDiff(): UnifiedDiffResult {
  return {
    files: [],
    totalAdditions: 0,
    totalDeletions: 0,
  };
}

function parseDiffPaths(row: string) {
  const match = row.match(/^diff --git ("?a\/.+?"?) ("?b\/.+?"?)$/);
  if (!match) {
    const [, , oldPath = "", newPath = ""] = row.split(" ");
    return { oldPath, newPath };
  }
  return {
    oldPath: unquotePath(match[1]),
    newPath: unquotePath(match[2]),
  };
}

function stripGitPrefix(path: string) {
  const normalized = unquotePath(path);
  if (normalized === "/dev/null") return normalized;
  return normalized.replace(/^[ab]\//, "");
}

function unquotePath(path: string) {
  return path.replace(/^"|"$/g, "");
}
