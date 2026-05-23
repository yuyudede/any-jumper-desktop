import type { GitStatusEntry } from "../types";

export function parseGitStatusEntries(rawStatus: string): GitStatusEntry[] {
  return rawStatus
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => ({
      indexStatus: line[0] || " ",
      worktreeStatus: line[1] || " ",
      path: line.length > 3 ? line.slice(3) : "",
    }));
}
