import { describe, expect, it } from "vitest";
import { stripProgressChatter } from "./progressChatter";

describe("progress chatter stripping", () => {
  it("removes model work-progress chatter from the assistant answer", () => {
    const result = stripProgressChatter(`让我更深入地分析这个项目。我来全面分析这个项目的架构。首先创建任务列表，然后按步骤深入分析。
Now let me read the core files - controllers, services, and configurations:
Now let me read the configuration files, domain entities, and other key files:
Let me also check the FeignClient interfaces and the OpenApiController:
Now I have enough information to write the comprehensive analysis report. Let me update the todo list and write the report.
---

项目分析报告：userauth（用户认证中心）

这是最终报告内容。`);

    expect(result.content).toBe("项目分析报告：userauth（用户认证中心）\n\n这是最终报告内容。");
    expect(result.notes).toEqual([
      "让我更深入地分析这个项目。我来全面分析这个项目的架构。首先创建任务列表，然后按步骤深入分析。",
      "Now let me read the core files - controllers, services, and configurations:",
      "Now let me read the configuration files, domain entities, and other key files:",
      "Let me also check the FeignClient interfaces and the OpenApiController:",
      "Now I have enough information to write the comprehensive analysis report.",
      "Let me update the todo list and write the report.",
    ]);
  });

  it("removes concatenated progress chatter before the final report", () => {
    const result = stripProgressChatter(`让我更深入地分析这个项目。我来全面分析这个项目的架构。首先创建任务列表，然后按步骤深入分析。Now let me read the core files - controllers, services, and configurations:Now let me read the configuration files, domain entities, and other key files:Now let me read the remaining key files:Now let me read the domain entities, producer/consumer, job, and remaining important files:Now let me read the remaining key files:Now let me read the remaining important files for a comprehensive understanding:Now let me read a few more files to complete the picture:Let me also check the FeignClient interfaces and the OpenApiController:Now I have enough information to write the comprehensive analysis report. Let me update the todo list and write the report.---

项目分析报告：userauth（用户认证中心）`);

    expect(result.content).toBe("项目分析报告：userauth（用户认证中心）");
    expect(result.notes).toEqual([
      "让我更深入地分析这个项目。我来全面分析这个项目的架构。首先创建任务列表，然后按步骤深入分析。",
      "Now let me read the core files - controllers, services, and configurations:",
      "Now let me read the configuration files, domain entities, and other key files:",
      "Now let me read the remaining key files:",
      "Now let me read the domain entities, producer/consumer, job, and remaining important files:",
      "Now let me read the remaining key files:",
      "Now let me read the remaining important files for a comprehensive understanding:",
      "Now let me read a few more files to complete the picture:",
      "Let me also check the FeignClient interfaces and the OpenApiController:",
      "Now I have enough information to write the comprehensive analysis report.",
      "Let me update the todo list and write the report.",
    ]);
  });

  it("keeps the final answer when a markdown separator is glued to it", () => {
    const result = stripProgressChatter("Now let me read the core files:---项目分析报告：userauth（用户认证中心）");

    expect(result.content).toBe("项目分析报告：userauth（用户认证中心）");
    expect(result.notes).toEqual(["Now let me read the core files:"]);
  });

  it("removes markdown step-by-step work narration from the visible answer", () => {
    const result = stripProgressChatter("**Step 1：读取 AgentPage 核心渲染逻辑**...现在我来读取 IPC 事件处理和 MarkdownRenderer，以及主进程的事件推送到渲染进程的方式。\n\n最终结论：trace 应该只展示公开进度。");

    expect(result.content).toBe("最终结论：trace 应该只展示公开进度。");
    expect(result.notes).toEqual([
      "Step 1：读取 AgentPage 核心渲染逻辑...现在我来读取 IPC 事件处理和 MarkdownRenderer，以及主进程的事件推送到渲染进程的方式。",
    ]);
  });

  it("does not strip matching text inside fenced code blocks", () => {
    const result = stripProgressChatter("```text\nNow let me read this literal line\n```\n\n项目分析报告");

    expect(result.content).toBe("```text\nNow let me read this literal line\n```\n\n项目分析报告");
    expect(result.notes).toEqual([]);
  });

  it("removes execution-process details blocks from final assistant content", () => {
    const result = stripProgressChatter(`结论：可以通过 RPC 管道复用登录态。

<details>
<summary>执行过程</summary>

\`\`\`javascript
const rpcCall = (method, params) => fetch("http://127.0.0.1:9528/rpc", {
  method: "POST",
  body: JSON.stringify({ method, params })
});
\`\`\`
</details>

目前 B 站返回了 \`code: -101\`，说明登录态不可用。`);

    expect(result.content).toContain("结论：可以通过 RPC 管道复用登录态。");
    expect(result.content).toContain("目前 B 站返回了 `code: -101`");
    expect(result.content).not.toContain("<details>");
    expect(result.content).not.toContain("执行过程");
    expect(result.content).not.toContain("rpcCall");
  });

  it("removes inline and adjacent execution details blocks", () => {
    const result = stripProgressChatter(`结论保留。

<details> <summary>执行过程</summary>
\`\`\`javascript
const rpcCall = () => fetch("http://127.0.0.1:9528/rpc");
\`\`\`
</details> <details> <summary>执行过程</summary>
\`\`\`javascript
console.log("second process block");
\`\`\`
</details>

最终判断保留。`);

    expect(result.content).toContain("结论保留。");
    expect(result.content).toContain("最终判断保留。");
    expect(result.content).not.toContain("<summary>执行过程</summary>");
    expect(result.content).not.toContain("rpcCall");
    expect(result.content).not.toContain("second process block");
  });

  it("keeps execution details examples inside fenced code blocks", () => {
    const result = stripProgressChatter("```html\n<details> <summary>执行过程</summary>\n</details>\n```\n\n结论保留。");

    expect(result.content).toContain("<summary>执行过程</summary>");
    expect(result.content).toContain("结论保留。");
  });
});
