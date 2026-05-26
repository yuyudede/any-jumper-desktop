import { ListTodo } from "lucide-react";
import type { SubagentTask } from "../types";

interface SubagentTaskIndicatorProps {
  tasks: SubagentTask[];
  onClick: () => void;
  expanded: boolean;
}

export default function SubagentTaskIndicator({ tasks, onClick, expanded }: SubagentTaskIndicatorProps) {
  if (tasks.length === 0) return null;

  const runningCount = tasks.filter((t) => t.status === "running").length;
  const failedCount = tasks.filter((t) => t.status === "failed").length;
  const completedCount = tasks.filter((t) => t.status === "completed").length;

  return (
    <span
      className={`agent-meta-pill subagent-task-indicator${expanded ? " is-expanded" : ""}`}
      onClick={onClick}
      title="子代理任务"
      style={{ cursor: "pointer" }}
    >
      <ListTodo size={12} />
      {runningCount > 0 ? (
        <>
          <span className="subagent-dot running" />
          {runningCount} running
        </>
      ) : failedCount > 0 ? (
        <>{failedCount} failed</>
      ) : completedCount > 0 ? (
        <>{completedCount} done</>
      ) : (
        <>idle</>
      )}
    </span>
  );
}
