import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";
import { Search, X } from "lucide-react";

interface MinimapItem {
  id: string;
  role: "user" | "assistant";
  preview: string;
}

function extractMinimapItems(container: HTMLElement): MinimapItem[] {
  const messages = container.querySelectorAll<HTMLElement>("[data-message-id]");
  const items: MinimapItem[] = [];
  for (const el of messages) {
    const id = el.dataset.messageId || "";
    const role = (el.dataset.messageRole as "user" | "assistant") || "assistant";
    // Prefer .message-body text content for assistant messages, fallback to full article text
    let text: string;
    if (role === "assistant") {
      const body = el.querySelector<HTMLElement>(".message-body");
      text = body?.textContent || el.textContent || "";
    } else {
      text = el.textContent || "";
    }
    const preview = text.slice(0, 120).replace(/\s+/g, " ").trim();
    if (preview) {
      items.push({ id, role, preview });
    }
  }
  return items;
}

export const ScrollMinimap = memo(function ScrollMinimap() {
  const { contentRef, scrollRef, isAtBottom, scrollToBottom, stopScroll } =
    useStickToBottomContext();
  const [items, setItems] = useState<MinimapItem[]>([]);
  const [visibleCount, setVisibleCount] = useState(0);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [scrollRatio, setScrollRatio] = useState(0);

  const openTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const panelRef = useRef<HTMLDivElement>(null);

  // Collect minimap items from DOM
  const refreshItems = useCallback(() => {
    const container = contentRef.current;
    if (!container) return;
    setItems(extractMinimapItems(container));
  }, [contentRef]);

  useEffect(() => {
    refreshItems();
    const ro = new ResizeObserver(refreshItems);
    if (contentRef.current) ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, [contentRef, refreshItems]);

  // Track visible messages via IntersectionObserver
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).length;
        setVisibleCount(visible);
      },
      { root: scrollRef.current, threshold: 0.1 },
    );
    const messages = container.querySelectorAll("[data-message-id]");
    messages.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [contentRef, scrollRef, items]);

  // Track scroll position
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const maxScroll = el.scrollHeight - el.clientHeight;
      setScrollRatio(maxScroll > 0 ? el.scrollTop / maxScroll : 0);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef]);

  // Hover timing: 180ms open delay
  const handleMouseEnter = useCallback(() => {
    clearTimeout(closeTimerRef.current);
    openTimerRef.current = setTimeout(() => {
      refreshItems();
      setIsPanelOpen(true);
    }, 180);
  }, [refreshItems]);

  // Hover leave: 40ms then 80ms close
  const handleMouseLeave = useCallback(() => {
    clearTimeout(openTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      setIsPanelOpen(false);
    }, 120);
  }, []);

  // Panel mouse enter cancels close
  const handlePanelEnter = useCallback(() => {
    clearTimeout(closeTimerRef.current);
  }, []);

  const handlePanelLeave = useCallback(() => {
    setIsPanelOpen(false);
  }, []);

  // Search filter
  const filteredItems = searchQuery
    ? items.filter((item) =>
        item.preview.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : items;

  // Scroll to message
  const scrollToMessage = useCallback(
    (id: string) => {
      const el = document.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    [],
  );

  // Drag scrollbar
  const handleThumbMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      stopScroll();

      const scrollEl = scrollRef.current;
      if (!scrollEl) return;

      const startY = e.clientY;
      const startScrollTop = scrollEl.scrollTop;
      const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;

      const onMouseMove = (ev: MouseEvent) => {
        const deltaY = ev.clientY - startY;
        const trackHeight = scrollEl.clientHeight - 24;
        const ratio = deltaY / trackHeight;
        scrollEl.scrollTop = Math.max(
          0,
          Math.min(maxScroll, startScrollTop + ratio * maxScroll),
        );
      };

      const onMouseUp = () => {
        setIsDragging(false);
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        if (isAtBottom) scrollToBottom();
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [scrollRef, stopScroll, isAtBottom, scrollToBottom],
  );

  // Don't show if not enough content
  if (items.length <= 1) return null;

  return (
    <>
      {/* Minimap bars on the right */}
      <div
        className={[
          "scroll-minimap",
          "absolute right-0 top-0 bottom-0 w-[10px] z-10",
          "flex flex-col gap-[1px] py-2",
          "opacity-40 hover:opacity-100 transition-opacity",
        ].join(" ")}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {items.map((item, i) => (
          <div
            key={item.id || i}
            className={[
              "minimap-bar flex-1 min-h-[2px] rounded-full cursor-pointer",
              item.role === "user" ? "bg-primary/60" : "bg-foreground/30",
              i < visibleCount ? "opacity-90" : "opacity-40",
            ].join(" ")}
            onClick={() => scrollToMessage(item.id)}
          />
        ))}
        {/* Draggable scrollbar thumb */}
        <div
          className={[
            "minimap-thumb absolute right-1 left-1 h-[20px] rounded-full cursor-grab",
            isDragging
              ? "bg-primary cursor-grabbing"
              : "bg-foreground/50 hover:bg-foreground/70",
          ].join(" ")}
          style={{ top: `${scrollRatio * 100}%` }}
          onMouseDown={handleThumbMouseDown}
        />
      </div>

      {/* Popup panel */}
      {isPanelOpen && (
        <div
          ref={panelRef}
          className={[
            "scroll-minimap-panel",
            "absolute right-[14px] top-2 bottom-2 z-20 w-[280px]",
            "flex flex-col overflow-hidden",
          ].join(" ")}
          onMouseEnter={handlePanelEnter}
          onMouseLeave={handlePanelLeave}
        >
          {/* Header with search */}
          <div className="scroll-minimap-panel-header flex items-center gap-2 px-3 py-2">
            <Search size={14} className="scroll-minimap-panel-icon" />
            <input
              type="text"
              className="scroll-minimap-panel-search flex-1 bg-transparent text-sm outline-none"
              placeholder="搜索消息..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="scroll-minimap-panel-clear"
                onClick={() => setSearchQuery("")}
              >
                <X size={14} />
              </button>
            )}
            <span className="scroll-minimap-panel-count text-xs tabular-nums">
              {filteredItems.length}/{items.length}
            </span>
          </div>

          {/* Message list */}
          <div className="scroll-minimap-panel-list flex-1 overflow-y-auto">
            {filteredItems.length === 0 ? (
              <div className="scroll-minimap-panel-empty px-3 py-6 text-center text-sm">
                未找到匹配消息
              </div>
            ) : (
              filteredItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={[
                    "scroll-minimap-panel-item w-full text-left px-3 py-2 transition-colors",
                    item.role === "user" ? "is-user" : "",
                  ].join(" ")}
                  onClick={() => scrollToMessage(item.id)}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span
                      className={[
                        "scroll-minimap-panel-role text-[10px] font-medium uppercase",
                        item.role === "user" ? "is-user" : "",
                      ].join(" ")}
                    >
                      {item.role === "user" ? "You" : "AI"}
                    </span>
                  </div>
                  <p
                    className="scroll-minimap-panel-preview text-xs line-clamp-2"
                    dangerouslySetInnerHTML={{
                      __html: highlightMatch(item.preview, searchQuery),
                    }}
                  />
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
});

function highlightMatch(text: string, query: string): string {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(
    new RegExp(`(${escaped})`, "gi"),
    "<mark>$1</mark>",
  );
}
