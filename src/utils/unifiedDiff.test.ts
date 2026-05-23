import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "./unifiedDiff";

const sampleDiff = `diff --git a/src/styles/theme.css b/src/styles/theme.css
index 1234567..89abcde 100644
--- a/src/styles/theme.css
+++ b/src/styles/theme.css
@@ -15,6 +15,6 @@
   --text: #242424;
-  --font-weight-ui: 560;
+  --font-weight-ui: 500;
   --success: #0f8a4b;
@@ -203,3 +203,3 @@
 .brand-title {
-  font-weight: 680;
+  font-weight: var(--font-weight-strong);
 }
diff --git a/pom.xml b/pom.xml
index b603f4d..23e2148 100644
--- a/pom.xml
+++ b/pom.xml
@@ -221,2 +221,6 @@
   </dependency>
+  <dependency>
+    <groupId>org.xerial.snappy</groupId>
+  </dependency>
 </dependencies>
`;

describe("parseUnifiedDiff", () => {
  it("parses files, hunks, line numbers, and additions/deletions", () => {
    const result = parseUnifiedDiff(sampleDiff);

    expect(result.totalAdditions).toBe(5);
    expect(result.totalDeletions).toBe(2);
    expect(result.files).toHaveLength(2);
    expect(result.files[0]).toMatchObject({
      path: "src/styles/theme.css",
      additions: 2,
      deletions: 2,
    });
    expect(result.files[0].hunks[0].hiddenBefore).toBe(14);
    expect(result.files[0].hunks[1].hiddenBefore).toBe(185);
    expect(result.files[0].hunks[0].lines.map((line) => [line.kind, line.oldNumber, line.newNumber])).toEqual([
      ["context", 15, 15],
      ["delete", 16, undefined],
      ["add", undefined, 16],
      ["context", 17, 17],
    ]);
  });

  it("returns an empty result for no diff text", () => {
    expect(parseUnifiedDiff("暂无 diff")).toMatchObject({
      files: [],
      totalAdditions: 0,
      totalDeletions: 0,
    });
  });
});
