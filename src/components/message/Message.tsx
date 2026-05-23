import { memo } from "react";
import type { MessageProps } from "./types";

function messageRoleClass(role: string) {
  if (role === "user" || role === "assistant" || role === "system") return role;
  return "assistant";
}

function messageStatusClass(status: string) {
  return status.replace(/[^a-z0-9_-]/gi, "-").toLowerCase() || "unknown";
}

export const Message = memo(function Message({
  role,
  status = "completed",
  isEmpty = false,
  className,
  children,
  id,
}: MessageProps) {
  const cls = [
    "message",
    `message-${messageRoleClass(role)}`,
    `message-status-${messageStatusClass(status)}`,
    isEmpty ? "is-empty" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={cls} data-message-role={role} data-message-id={id}>
      {children}
    </article>
  );
});
