import type { ActivityStatus } from "../types";
import type { ReactNode } from "react";

interface StatusPillProps {
  status: ActivityStatus | "neutral";
  children: ReactNode;
}

export function StatusPill({ status, children }: StatusPillProps) {
  return <span className={`status-pill is-${status}`}>{children}</span>;
}
