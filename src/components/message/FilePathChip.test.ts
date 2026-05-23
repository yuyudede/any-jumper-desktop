import { describe, expect, it } from "vitest";
import { detectFilePath, filePathChipTone } from "./FilePathChip";

describe("FilePathChip helpers", () => {
  it("detects generated markdown documents as file paths", () => {
    expect(detectFilePath("workspace-overview.md")).toBe("workspace-overview.md");
  });

  it("assigns semantic color tones by file type", () => {
    expect(filePathChipTone("workspace-overview.md")).toBe("document");
    expect(filePathChipTone("src/pages/AgentPage.tsx")).toBe("code");
    expect(filePathChipTone("schema.json")).toBe("data");
    expect(filePathChipTone("screenshot.png")).toBe("media");
    expect(filePathChipTone("README")).toBe("file");
  });
});
