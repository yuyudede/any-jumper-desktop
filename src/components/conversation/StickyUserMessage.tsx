import { useEffect, useRef, useState, useCallback, memo } from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import { User, ArrowUp } from "lucide-react";

interface StickyUserMessageData {
  id: string;
  text: string;
}

function stripCodeBlocks(text: string): string {
  // Replace fenced code blocks with [code] placeholder
  let result = text.replace(/```[\s\S]*?```/g, "[code]");
  // Replace inline code with truncated version
  result = result.replace(/`([^`]+)`/g, "`…`");
  // Truncate to ~150 chars
  if (result.length > 150) {
    result = result.slice(0, 150) + "…";
  }
  return result;
}

function getLastUserMessageAboveViewport(
  container: HTMLElement,
): StickyUserMessageData | null {
  const userMessages = container.querySelectorAll<HTMLElement>(
    '[data-message-role="user"]',
  );
  if (userMessages.length === 0) return null;

  const containerRect = container.getBoundingClientRect();
  const containerTop = containerRect.top;

  let lastAbove: HTMLElement | null = null;
  for (const el of userMessages) {
    const rect = el.getBoundingClientRect();
    if (rect.bottom < containerTop) {
      lastAbove = el;
    } else {
      break;
    }
  }

  if (!lastAbove) return null;

  const id = lastAbove.dataset.messageId || "";
  const textContent = lastAbove.textContent || "";

  return {
    id,
    text: stripCodeBlocks(textContent),
  };
}

export const StickyUserMessage = memo(function StickyUserMessage() {
  const { contentRef, scrollRef } = useStickToBottomContext();
  const [stickyData, setStickyData] = useState<StickyUserMessageData | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const rafRef = useRef<number>(0);

  const checkSticky = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const container = contentRef.current;
      if (!container) return;
      const data = getLastUserMessageAboveViewport(container);
      setStickyData(data);
      setIsVisible(data !== null);
    });
  }, [contentRef]);

  useEffect(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;

    scrollEl.addEventListener("scroll", checkSticky, { passive: true });
    const ro = new ResizeObserver(checkSticky);
    if (contentRef.current) ro.observe(contentRef.current);

    checkSticky();

    return () => {
      scrollEl.removeEventListener("scroll", checkSticky);
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [scrollRef, contentRef, checkSticky]);

  const handleClick = useCallback(() => {
    if (!stickyData?.id) return;
    const el = document.querySelector<HTMLElement>(
      `[data-message-id="${stickyData.id}"]`,
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [stickyData]);

  return (
    <div
      className={[
        "sticky-user-message",
        "absolute top-0 left-0 right-0 z-20 px-4 py-2",
        "bg-background/95 backdrop-blur-sm border-b border-border",
        "transition-all duration-150 ease-out",
        isVisible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 -translate-y-2 pointer-events-none",
      ].join(" ")}
    >
      {stickyData && (
        <button
          type="button"
          className="flex items-center gap-2 w-full text-left hover:bg-foreground/5 rounded-md px-2 py-1.5 transition-colors"
          onClick={handleClick}
        >
          <User size={14} className="text-muted-foreground flex-shrink-0" />
          <span className="text-sm text-muted-foreground truncate flex-1">
            {stickyData.text}
          </span>
          <ArrowUp size={14} className="text-muted-foreground flex-shrink-0" />
        </button>
      )}
    </div>
  );
});
