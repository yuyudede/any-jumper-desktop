import { CheckCircle, ChevronRight, Clock, LoaderCircle, XCircle } from "lucide-react";
import type { ActivityItem } from "../types";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";

interface ActivityPanelProps {
  collapsed?: boolean;
  items: ActivityItem[];
  onToggle?: () => void;
}

const iconByStatus = {
  idle: <Clock size={16} />,
  running: <LoaderCircle className="is-spinning" size={16} />,
  success: <CheckCircle size={16} />,
  error: <XCircle size={16} />,
};

export function ActivityPanel({ collapsed = false, items, onToggle }: ActivityPanelProps) {
  if (collapsed) {
    return null;
  }

  return (
    <aside className="activity-panel">
      <div className="panel-heading">
        <div>
          <div className="panel-title">Activity</div>
          <div className="panel-subtitle">最近执行记录</div>
        </div>
        <TooltipProvider delayDuration={160}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button aria-label="收起活动栏" className="panel-icon-button" size="icon" type="button" variant="ghost" onClick={onToggle}>
                <ChevronRight size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>收起活动栏</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      {items.length === 0 ? (
        <div className="mini-empty">暂无执行记录</div>
      ) : (
        <div className="activity-list">
          {items.map((item) => (
            <div className={`activity-item is-${item.status}`} key={item.id}>
              <div className="activity-icon">{iconByStatus[item.status]}</div>
              <div className="activity-body">
                <div className="activity-row">
                  <span className="activity-title">{item.title}</span>
                  <span className="activity-time">{item.timestamp}</span>
                </div>
                {item.detail ? (
                  <pre className="activity-detail">{item.detail}</pre>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
