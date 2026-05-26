import { describe, expect, it } from "vitest";
import type { AgentEvent, SubagentTask } from "../types";
import { reduceSubagentTasks } from "./subagentTracker";

function event(partial: Partial<AgentEvent>): AgentEvent {
  return {
    event: "tool.delta",
    threadId: "thread-1",
    turnId: "turn-1",
    toolCallId: "task-1",
    payload: {
      name: "task",
      status: "started",
      input: { description: "分析项目结构", subagent_type: "general-purpose" },
    },
    createdAt: 1_000,
    ...partial,
  };
}

describe("subagent task tracker", () => {
  it("adds a running task from a task tool start event", () => {
    const tasks = reduceSubagentTasks([], event({}));

    expect(tasks).toEqual<SubagentTask[]>([
      {
        id: "task-1",
        title: "分析项目结构",
        status: "running",
        createdAt: 1_000,
      },
    ]);
  });

  it("extracts task titles from nested task input shapes", () => {
    const tasks = reduceSubagentTasks([], event({
      toolCallId: "task-2",
      payload: {
        name: "task",
        status: "started",
        input: {
          input: {
            description: "检查主题样式",
          },
        },
      },
    }));

    expect(tasks[0]).toMatchObject({
      id: "task-2",
      title: "检查主题样式",
    });
  });

  it("uses stable fallback titles when task input has no description", () => {
    let tasks = reduceSubagentTasks([], event({
      toolCallId: "task-1",
      payload: {
        name: "task",
        status: "started",
        input: { subagent_type: "general-purpose" },
      },
    }));
    tasks = reduceSubagentTasks(tasks, event({
      toolCallId: "task-2",
      createdAt: 2_000,
      payload: {
        name: "task",
        status: "started",
        input: { subagent_type: "general-purpose" },
      },
    }));

    expect(tasks.map((task) => task.title)).toEqual(["子代理 2", "子代理 1"]);
  });

  it("marks the matching running task completed and truncates the summary", () => {
    const longOutput = `${"找到 12 个文件。".repeat(30)}结尾内容`;
    let tasks = reduceSubagentTasks([], event({}));

    tasks = reduceSubagentTasks(tasks, event({
      event: "tool.delta",
      createdAt: 2_000,
      payload: {
        name: "task",
        status: "completed",
        output: longOutput,
      },
    }));

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      id: "task-1",
      title: "分析项目结构",
      status: "completed",
      completedAt: 2_000,
    });
    expect(tasks[0].summary).toHaveLength(200);
    expect(tasks[0].summary).toBe(longOutput.slice(0, 200));
  });

  it("summarizes structured task command outputs into readable file updates", () => {
    let tasks = reduceSubagentTasks([], event({
      payload: {
        name: "task",
        status: "started",
        input: JSON.stringify({ description: "修复浏览器技能" }),
      },
    }));

    tasks = reduceSubagentTasks(tasks, event({
      event: "tool.delta",
      createdAt: 2_000,
      payload: {
        name: "task",
        status: "completed",
        output: JSON.stringify({
          lg_name: "Command",
          update: {
            files: {
              "/skills/agent_bridge/SKILL.md": { content: "---\nname: agent-bridge" },
            },
          },
        }),
      },
    }));

    expect(tasks[0]).toMatchObject({
      title: "修复浏览器技能",
      summary: "Command 更新了 1 个文件：/skills/agent_bridge/SKILL.md",
    });
    expect(tasks[0].summary).not.toContain("\"content\"");
  });

  it("keeps the newest task first", () => {
    let tasks = reduceSubagentTasks([], event({
      toolCallId: "task-1",
      createdAt: 1_000,
      payload: {
        name: "task",
        status: "started",
        input: { description: "第一个任务" },
      },
    }));
    tasks = reduceSubagentTasks(tasks, event({
      toolCallId: "task-2",
      createdAt: 2_000,
      payload: {
        name: "task",
        status: "started",
        input: { description: "第二个任务" },
      },
    }));

    expect(tasks.map((task) => task.id)).toEqual(["task-2", "task-1"]);
  });

  it("marks running tasks failed when the turn fails", () => {
    let tasks = reduceSubagentTasks([], event({}));

    tasks = reduceSubagentTasks(tasks, event({
      event: "turn.failed",
      createdAt: 3_000,
      payload: { status: "failed" },
    }));

    expect(tasks[0]).toMatchObject({
      id: "task-1",
      status: "failed",
      completedAt: 3_000,
    });
  });

  it("clears stale tasks when a new turn starts", () => {
    const existing: SubagentTask[] = [
      {
        id: "task-1",
        title: "上一轮任务",
        status: "completed",
        createdAt: 1_000,
        completedAt: 2_000,
      },
    ];

    const tasks = reduceSubagentTasks(existing, event({
      event: "turn.started",
      createdAt: 3_000,
      payload: { status: "running" },
    }));

    expect(tasks).toEqual([]);
  });

  it("ignores non-task tool delta events", () => {
    const tasks = reduceSubagentTasks([], event({
      payload: {
        name: "shell",
        status: "started",
        input: { command: "pnpm test" },
      },
    }));

    expect(tasks).toEqual([]);
  });
});
