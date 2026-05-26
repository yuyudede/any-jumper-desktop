import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { errorDetail, errorMessage } from "./desktopApi";

function readDesktopApiSource() {
  return readFileSync(resolve(process.cwd(), "src/services/desktopApi.ts"), "utf8");
}

describe("desktopApi error helpers", () => {
  it("reads message and detail from Electron IPC style errors", () => {
    const error = { message: "失败", detail: "detail" };
    expect(errorMessage(error)).toBe("失败");
    expect(errorDetail(error)).toBe("detail");
  });

  it("parses structured errors serialized through Electron IPC", () => {
    const error = {
      message: "Error invoking remote method 'any-jumper:invoke': Error: ANY_JUMPER_ERROR:{\"message\":\"缺少 API Key\",\"detail\":\"provider=foo\"}",
    };
    expect(errorMessage(error)).toBe("缺少 API Key");
    expect(errorDetail(error)).toBe("provider=foo");
  });

  it("exposes a renderer API for smart git commit message generation", () => {
    const source = readDesktopApiSource();

    expect(source).toContain("gitGenerateCommitMessage(rootPath: string)");
    expect(source).toContain('invoke<string>("git_generate_commit_message", { rootPath })');
  });

  it("does not expose renderer APIs for removed Codex model sync", () => {
    const source = readDesktopApiSource();

    expect(source).not.toContain("CodexModelSyncRequest");
    expect(source).not.toContain("CodexModelSyncResult");
    expect(source).not.toContain("codexModelSyncSave");
    expect(source).not.toContain("codexModelSyncValidate");
    expect(source).not.toContain("codex_model_sync_save");
    expect(source).not.toContain("codex_model_sync_validate");
  });
});
