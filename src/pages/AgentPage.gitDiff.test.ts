import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readProjectFile(path: string) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("AgentPage Git diff experience", () => {
  it("does not mount the former right-rail Git diff viewer in the chat workbench", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");

    expect(source).not.toContain("<GitDiffViewer");
    expect(source).not.toContain("desktopApi.gitDiff");
    expect(source).not.toContain("desktopApi.gitStatus");
    expect(source).not.toContain('gitDiff ? <pre className="code-block">{gitDiff}</pre>');
  });
});
