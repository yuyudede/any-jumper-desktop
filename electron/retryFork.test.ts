import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readMainSource() {
  return readFileSync(resolve(process.cwd(), "electron/main.ts"), "utf8");
}

describe("retry and fork conversation controls", () => {
  it("edit retry reuses the edited user item instead of adding a duplicate user bubble", () => {
    const source = readMainSource();

    expect(source).toContain("retryItemId?: string");
    expect(source).toContain("retryItemId: item.id");
    expect(source).toContain("const retryItem = request.retryItemId ? storage.getItem(request.retryItemId) : undefined;");
    expect(source).toContain("storage.updateItemForRetry(retryItem.id,");
    expect(source).toContain("if (!retryItem) storage.insertItem(userItem);");
  });

  it("edit retry validates the target before mutating history", () => {
    const source = readMainSource();
    const editAndRerunStart = source.indexOf("editAndRerun(itemId: string");
    const getItem = source.indexOf("const item = storage.getItem(itemId)", editAndRerunStart);
    const roleGuard = source.indexOf('if (item.role !== "user")', editAndRerunStart);
    const updateContent = source.indexOf("storage.updateItemContent(item.id, content)", editAndRerunStart);

    expect(editAndRerunStart).toBeGreaterThan(-1);
    expect(getItem).toBeGreaterThan(editAndRerunStart);
    expect(roleGuard).toBeGreaterThan(getItem);
    expect(updateContent).toBeGreaterThan(roleGuard);
  });
});
