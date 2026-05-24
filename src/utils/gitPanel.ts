export interface GitChangeFileLike {
  path: string;
  indexStatus: string;
  worktreeStatus: string;
  status: string;
}

export type GitChangeTreeNode = GitChangeTreeDirectory | GitChangeTreeFile;

export interface GitChangeTreeDirectory {
  id: string;
  type: "directory";
  name: string;
  path: string;
  fileCount: number;
  children: GitChangeTreeNode[];
}

export interface GitChangeTreeFile extends GitChangeFileLike {
  id: string;
  type: "file";
  name: string;
  tracked: boolean;
}

export interface GitRecentCommit {
  hash: string;
  refs: string[];
  subject: string;
  raw: string;
}

interface MutableDirectory extends GitChangeTreeDirectory {
  directoryMap: Map<string, MutableDirectory>;
}

export function buildGitChangeTree(
  changedFiles: GitChangeFileLike[],
  untrackedFiles: GitChangeFileLike[],
): GitChangeTreeNode[] {
  const root = createDirectory("", "");

  for (const file of changedFiles) {
    insertFile(root, file, true);
  }

  for (const file of untrackedFiles) {
    insertFile(root, file, false);
  }

  finalizeDirectory(root);
  return root.children;
}

export function parseGitLogLines(rawLog: string): GitRecentCommit[] {
  return rawLog
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const decorated = line.match(/^([0-9a-f]+)\s+\(([^)]*)\)\s+(.+)$/i);
      if (decorated) {
        return {
          hash: decorated[1],
          refs: decorated[2].split(",").map((ref) => ref.trim()).filter(Boolean),
          subject: decorated[3],
          raw: line,
        };
      }

      const plain = line.match(/^([0-9a-f]+)\s+(.+)$/i);
      if (plain) {
        return {
          hash: plain[1],
          refs: [],
          subject: plain[2],
          raw: line,
        };
      }

      return {
        hash: "",
        refs: [],
        subject: line,
        raw: line,
      };
    });
}

function insertFile(root: MutableDirectory, file: GitChangeFileLike, tracked: boolean) {
  const parts = file.path.split("/").filter(Boolean);
  if (parts.length === 0) return;

  let current = root;
  for (const part of parts.slice(0, -1)) {
    const childPath = current.path ? `${current.path}/${part}` : part;
    let child = current.directoryMap.get(childPath);
    if (!child) {
      child = createDirectory(part, childPath);
      current.directoryMap.set(childPath, child);
      current.children.push(child);
    }
    current = child;
  }

  const name = parts[parts.length - 1];
  current.children.push({
    ...file,
    id: `file:${file.path}`,
    type: "file",
    name,
    tracked,
  });
}

function createDirectory(name: string, path: string): MutableDirectory {
  return {
    id: path ? `dir:${path}` : "dir:",
    type: "directory",
    name,
    path,
    fileCount: 0,
    children: [],
    directoryMap: new Map(),
  };
}

function finalizeDirectory(directory: MutableDirectory): number {
  directory.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  directory.fileCount = directory.children.reduce((count, child) => {
    if (child.type === "file") return count + 1;
    return count + finalizeDirectory(child as MutableDirectory);
  }, 0);

  delete (directory as Partial<MutableDirectory>).directoryMap;
  return directory.fileCount;
}
