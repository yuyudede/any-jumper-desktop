import { describe, expect, it } from "vitest";
import { parseGitStatusEntries } from "./gitStatus";

describe("parseGitStatusEntries", () => {
  it("preserves the first path character when the first status line starts with a leading space", () => {
    expect(parseGitStatusEntries(" M pom.xml\n?? AGENTS.md\n?? dept-yibu/")).toEqual([
      { indexStatus: " ", worktreeStatus: "M", path: "pom.xml" },
      { indexStatus: "?", worktreeStatus: "?", path: "AGENTS.md" },
      { indexStatus: "?", worktreeStatus: "?", path: "dept-yibu/" },
    ]);
  });

  it("keeps non-ASCII paths readable when git returns unquoted names", () => {
    expect(parseGitStatusEntries("?? 小诗.md")).toEqual([
      { indexStatus: "?", worktreeStatus: "?", path: "小诗.md" },
    ]);
  });
});
