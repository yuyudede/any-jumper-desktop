import type { ReactNode } from "react";
import { StatusPill } from "./StatusPill";

export interface WorkbenchContextItem {
  label: string;
  value?: ReactNode;
  status?: "neutral" | "success" | "error" | "running";
}

interface WorkbenchPageProps {
  title: string;
  description: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  contextItems?: WorkbenchContextItem[];
  children: ReactNode;
  className?: string;
}

interface WorkbenchSectionProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function WorkbenchPage({
  title,
  description,
  eyebrow = "工作台",
  actions,
  contextItems = [],
  children,
  className,
}: WorkbenchPageProps) {
  return (
    <div className={["workbench-page", className].filter(Boolean).join(" ")}>
      <header className="workbench-hero">
        <div className="workbench-hero-copy">
          <div className="workbench-eyebrow">{eyebrow}</div>
          <h2>{title}</h2>
          <p className="workbench-description">{description}</p>
        </div>
        {actions ? <div className="workbench-hero-actions">{actions}</div> : null}
      </header>

      {contextItems.length > 0 ? (
        <div className="workbench-context">
          {contextItems.map((item) => (
            <div className="workbench-context-item" key={item.label}>
              <span>{item.label}</span>
              {item.status ? (
                <StatusPill status={item.status}>{item.value || "-"}</StatusPill>
              ) : (
                <strong>{item.value || "-"}</strong>
              )}
            </div>
          ))}
        </div>
      ) : null}

      <div className="workbench-layout">
        <div className="workbench-main">{children}</div>
      </div>
    </div>
  );
}

export function WorkbenchSection({
  title,
  description,
  actions,
  children,
}: WorkbenchSectionProps) {
  return (
    <section className="workbench-section">
      <div className="workbench-section-head">
        <div>
          <div className="section-title">{title}</div>
          {description ? <div className="panel-subtitle">{description}</div> : null}
        </div>
        {actions ? <div className="workbench-section-actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
