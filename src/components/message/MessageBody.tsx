import { memo } from "react";
import type { MessageBodyProps } from "./types";

export const MessageBody = memo(function MessageBody({
  className,
  children,
}: MessageBodyProps) {
  return (
    <div className={["message-body", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
});
