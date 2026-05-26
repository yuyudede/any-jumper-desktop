import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readProjectFile(path: string) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

function cssBlock(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escaped}\\s*\\{(?<body>[^}]*)\\}`))?.groups?.body ?? "";
}

describe("TasksBar presentation", () => {
  it("uses a centered compact panel above the composer", () => {
    const source = readProjectFile("src/components/TasksBar.tsx");
    const css = readProjectFile("src/styles/theme.css");
    const barBlock = cssBlock(css, ".tasks-bar");

    expect(source).toContain("子代理任务");
    expect(barBlock).toContain("align-self: center;");
    expect(barBlock).toContain("width: 100%;");
    expect(barBlock).toContain("max-width: var(--composer-panel-max-width);");
    expect(barBlock).toContain("flex: 0 0 auto;");
    expect(barBlock).not.toContain("font-family: var(--mono);");
  });

  it("is rendered inside the composer so it shares the input box alignment", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const agentComposerBlock = source.match(/function AgentComposer[\s\S]*?AgentComposer\.displayName/)?.[0] ?? "";

    expect(agentComposerBlock).toContain("<TasksBar");
    expect(agentComposerBlock).toContain("tasks={subagentTasks}");
    expect(source).toContain("subagentTasks={subagentTasks}");
    expect(source).not.toContain("<TasksBar\n                tasks={subagentTasks}");
  });

  it("prevents long task summaries from stretching or overlapping the composer", () => {
    const source = readProjectFile("src/components/TasksBar.tsx");
    const css = readProjectFile("src/styles/theme.css");
    const listBlock = cssBlock(css, ".tasks-bar-list");
    const itemBlock = cssBlock(css, ".tasks-bar-item");
    const summaryBlock = cssBlock(css, ".tasks-bar-item-summary");

    expect(source).toContain("title={task.summary}");
    expect(listBlock).toContain("overflow-x: hidden;");
    expect(itemBlock).toContain("grid-template-columns:");
    expect(summaryBlock).toContain("-webkit-line-clamp: 2;");
    expect(summaryBlock).toContain("overflow-wrap: anywhere;");
    expect(summaryBlock).toContain("white-space: normal;");
  });
});
