import type { ReactNode } from "react";
import type { ResultAction } from "../types";
import { Button } from "./ui/button";

interface ResultBlockProps {
  title: string;
  meta?: string;
  actions?: ResultAction[];
  children: ReactNode;
}

export function ResultBlock({ title, meta, actions = [], children }: ResultBlockProps) {
  return (
    <section className="result-block">
      <div className="result-header">
        <div>
          <div className="result-title">{title}</div>
          {meta ? <div className="result-meta">{meta}</div> : null}
        </div>
        {actions.length > 0 ? (
          <div className="result-actions">
            {actions.map((action) => (
              <Button key={action.label} type="button" variant="outline" onClick={action.onClick}>
                {action.icon}
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
      <div>{children}</div>
    </section>
  );
}
