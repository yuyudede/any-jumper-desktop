import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function readProjectFile(path: string) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("Conversation resize behavior", () => {
  it("does not smooth-scroll on layout resize from external panels", () => {
    const source = readProjectFile("src/components/conversation/Conversation.tsx");

    expect(source).toContain('resize="instant"');
    expect(source).not.toContain('resize="smooth"');
  });
});
