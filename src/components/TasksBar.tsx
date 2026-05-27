import { CheckCircle2, XCircle, Loader2, ChevronDown, ChevronUp, ListTodo } from "lucide-react";
import type { SubagentTask, SubagentTaskStatus } from "../types";

interface TasksBarProps {
  tasks: SubagentTask[];
  expanded: boolean;
  onToggle: () => void;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return "刚刚";
  if (sec < 60) return `${sec}s 前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m 前`;
  const hrs = Math.floor(min / 60);
  return `${hrs}h 前`;
}

function elapsedText(start: number, end = Date.now()): string {
  const diff = Math.max(0, end - start);
  const sec = Math.floor(diff / 1000);
  if (sec < 1) return "<1s";
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hrs = Math.floor(min / 60);
  return `${hrs}h ${min % 60}m`;
}

function durationLabel(task: SubagentTask): string {
  const elapsed = elapsedText(task.createdAt, task.completedAt ?? Date.now());
  return task.status === "running" ? `运行 ${elapsed}` : `耗时 ${elapsed}`;
}

function statusLabel(status: SubagentTaskStatus): string {
  if (status === "running") return "运行中";
  if (status === "completed") return "已完成";
  return "失败";
}

export default function TasksBar({ tasks, expanded, onToggle }: TasksBarProps) {
  if (tasks.length === 0) return null;

  const running = tasks.filter((t) => t.status === "running").length;
  const completed = tasks.filter((t) => t.status === "completed").length;
  const failed = tasks.filter((t) => t.status === "failed").length;

  return (
    <div className="tasks-bar">
      <button
        className="tasks-bar-header"
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <div className="tasks-bar-header-left">
          <ListTodo size={14} />
          <span className="tasks-bar-title">子代理任务</span>
          <span className="tasks-bar-summary">
            {running > 0 && <span className="tasks-stat running">{running} 运行中</span>}
            {completed > 0 && <span className="tasks-stat completed">{completed} 完成</span>}
            {failed > 0 && <span className="tasks-stat failed">{failed} 失败</span>}
          </span>
        </div>
        <span className="tasks-bar-toggle" aria-hidden="true">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>
      {expanded && (
        <div className="tasks-bar-list">
          {tasks.map((task) => (
            <div key={task.id} className={`tasks-bar-item ${task.status}`}>
              <span className="tasks-bar-item-icon">
                {task.status === "running" && <Loader2 size={13} className="spin" />}
                {task.status === "completed" && <CheckCircle2 size={13} />}
                {task.status === "failed" && <XCircle size={13} />}
              </span>
              <span className="tasks-bar-item-main">
                <span className="tasks-bar-item-title-row">
                  <span className="tasks-bar-item-title" title={task.title}>{task.title}</span>
                  <span className={`tasks-bar-item-status ${task.status}`}>{statusLabel(task.status)}</span>
                </span>
                <span className="tasks-bar-item-meta">
                  {task.agentType && <span>类型 {task.agentType}</span>}
                  <span>{durationLabel(task)}</span>
                  <span>{task.completedAt ? `完成 ${relativeTime(task.completedAt)}` : `开始 ${relativeTime(task.createdAt)}`}</span>
                </span>
                {task.summary && <span className="tasks-bar-item-summary" title={task.summary}>{task.summary}</span>}
              </span>
              <span className="tasks-bar-item-time">
                {task.completedAt ? relativeTime(task.completedAt) : relativeTime(task.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
