import { memo } from "react";
import type { MessageActionsProps } from "./types";

export const MessageActions = memo(function MessageActions({
  className,
  children,
}: MessageActionsProps) {
  return (
    <div
      className={["message-actions", className].filter(Boolean).join(" ")}
      aria-label="消息操作"
    >
      {children}
    </div>
  );
});
