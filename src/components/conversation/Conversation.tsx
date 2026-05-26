import { memo, type ReactNode } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { ArrowDown } from "lucide-react";
import { Button } from "../ui/button";
import { StickyUserMessage } from "./StickyUserMessage";
import { ScrollMinimap } from "./ScrollMinimap";

export const Conversation = memo(function Conversation({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <StickToBottom
      className={["relative flex-1 overflow-y-hidden focus:outline-none", className]
        .filter(Boolean)
        .join(" ")}
      initial="instant"
      resize="instant"
      role="log"
    >
      <StickyUserMessage />
      <StickToBottom.Content className="flex flex-col gap-1 py-4 px-8">
        {children}
      </StickToBottom.Content>
      <ScrollMinimap />
    </StickToBottom>
  );
});

export function ConversationScrollButton() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  if (isAtBottom) return null;

  return (
    <Button
      className="absolute bottom-[26px] left-1/2 -translate-x-1/2 rounded-full size-9 shadow-lg"
      size="icon"
      variant="secondary"
      onClick={() => scrollToBottom()}
      aria-label="滚动到底部"
    >
      <ArrowDown className="size-4" />
    </Button>
  );
}
