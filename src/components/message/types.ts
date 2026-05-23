import type { ReactNode } from "react";

export type MessageRole = "user" | "assistant" | "system";
export type MessageStatus = "running" | "completed" | "error" | "queued" | "interrupted" | "cancelled" | "idle";

export interface MessageProps {
  role: MessageRole;
  status?: MessageStatus;
  isEmpty?: boolean;
  className?: string;
  children?: ReactNode;
  id?: string;
}

export interface MessageBodyProps {
  streaming?: boolean;
  className?: string;
  children?: ReactNode;
}

export interface MessageActionsProps {
  className?: string;
  children?: ReactNode;
}
