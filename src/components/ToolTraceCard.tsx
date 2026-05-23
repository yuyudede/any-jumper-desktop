import { ChevronDown, TerminalSquare } from "lucide-react";
import { useState } from "react";
import type { ToolTraceCardModel } from "../utils/toolTrace";
import { getToolResultRenderer } from "./tool-results";

export function ToolTraceGroup({ cards }: { cards: ToolTraceCardModel[] }) {
  if (cards.length === 0) return null;
  return (
    <div className="tool-trace-group">
      {cards.map((card) => (
        <ToolTraceCard card={card} key={card.id} />
      ))}
    </div>
  );
}

export function compactToolCards(cards: ToolTraceCardModel[]): string {
  if (cards.length === 0) return "";
  if (cards.length === 1) return `1 个工具调用`;
  // 按 kind 分组统计
  const groups = new Map<string, number>();
  for (const card of cards) {
    const k = kindLabel(card.kind);
    groups.set(k, (groups.get(k) ?? 0) + 1);
  }
  return [...groups.entries()].map(([k, n]) => `${k} ×${n}`).join(" · ");
}

function ToolTraceCard({ card }: { card: ToolTraceCardModel }) {
  const [expanded, setExpanded] = useState(card.defaultExpanded);
  return (
    <section className={`tool-trace-card is-${card.status}`}>
      <button
        aria-expanded={expanded}
        className="tool-trace-toggle"
        type="button"
        onClick={() => setExpanded((value) => !value)}
      >
        <TerminalSquare className="tool-trace-icon" size={16} />
        <span className="tool-trace-title">{card.title}</span>
        <span className="tool-trace-status">{statusLabel(card.status)}</span>
        <ChevronDown className="tool-trace-chevron" size={15} />
      </button>
      {expanded ? (
        <div className="tool-trace-body">
          <div className="tool-trace-meta">
            <span>{kindLabel(card.kind)}</span>
            {card.inputSummary ? <span>{card.inputSummary}</span> : null}
          </div>
          {card.progress.length > 0 ? (
            <ul className="tool-trace-progress">
              {card.progress.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          ) : null}
          {card.outputPreview ? (
            <ToolResultOutput card={card} />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function kindLabel(kind: ToolTraceCardModel["kind"]) {
  if (kind === "shell") return "Shell";
  if (kind === "git") return "Git";
  if (kind === "file") return "File";
  if (kind === "search") return "Search";
  if (kind === "mcp") return "MCP";
  if (kind === "task") return "Task";
  return "Tool";
}

function statusLabel(status: ToolTraceCardModel["status"]) {
  if (status === "running") return "运行中";
  if (status === "waiting_approval") return "等待审批";
  if (status === "error") return "失败";
  if (status === "cancelled") return "已取消";
  if (status === "rejected") return "已拒绝";
  if (status === "pending") return "等待中";
  return "成功";
}

function ToolResultOutput({ card }: { card: ToolTraceCardModel }) {
  const Renderer = getToolResultRenderer(card.name);

  if (Renderer) {
    return <Renderer card={card} />;
  }

  return <pre className="tool-trace-output">{card.outputPreview}</pre>;
}
