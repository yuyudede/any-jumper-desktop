import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, children, className }: EmptyStateProps) {
  return (
    <div className={cn("agent-empty-state", className)}>
      {icon ? <div className="agent-empty-state-icon">{icon}</div> : null}
      <div className="agent-empty-state-copy">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {children ? <div className="agent-empty-state-actions">{children}</div> : null}
    </div>
  );
}
