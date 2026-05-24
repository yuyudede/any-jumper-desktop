import { describe, expect, it } from "vitest";
import { buildGitChangeTree, parseGitLogLines } from "./gitPanel";

describe("git panel utilities", () => {
  it("builds a nested file tree from changed and untracked files", () => {
    const tree = buildGitChangeTree(
      [
        { path: "src/pages/AgentPage.tsx", status: "M", indexStatus: " ", worktreeStatus: "M" },
        { path: "README.md", status: "A", indexStatus: "A", worktreeStatus: " " },
      ],
      [
        { path: "src/utils/gitPanel.ts", status: "??", indexStatus: "?", worktreeStatus: "?" },
      ],
    );

    expect(tree).toMatchObject([
      {
        type: "directory",
        name: "src",
        fileCount: 2,
        children: [
          {
            type: "directory",
            name: "pages",
            fileCount: 1,
            children: [{ type: "file", name: "AgentPage.tsx", path: "src/pages/AgentPage.tsx", tracked: true }],
          },
          {
            type: "directory",
            name: "utils",
            fileCount: 1,
            children: [{ type: "file", name: "gitPanel.ts", path: "src/utils/gitPanel.ts", tracked: false }],
          },
        ],
      },
      { type: "file", name: "README.md", path: "README.md", tracked: true },
    ]);
  });

  it("parses recent git log lines with decorated branch refs", () => {
    expect(parseGitLogLines("a1b2c3d (HEAD -> main, origin/main) Improve Git panel\n9f8e7d6 Previous change")).toEqual([
      {
        hash: "a1b2c3d",
        refs: ["HEAD -> main", "origin/main"],
        subject: "Improve Git panel",
        raw: "a1b2c3d (HEAD -> main, origin/main) Improve Git panel",
      },
      {
        hash: "9f8e7d6",
        refs: [],
        subject: "Previous change",
        raw: "9f8e7d6 Previous change",
      },
    ]);
  });
});
