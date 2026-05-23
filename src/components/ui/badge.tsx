import * as React from "react";
import { cn } from "../../lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: "default" | "success" | "warning" | "danger" | "muted";
}

export function Badge({ className, tone = "default", ...props }: BadgeProps) {
  return <span className={cn("shadcn-badge", `is-${tone}`, className)} {...props} />;
}
