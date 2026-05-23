import { useCallback, useRef, useEffect, memo } from "react";

interface ResizeHandleProps {
  onResize: (delta: number) => void;
  direction?: "horizontal" | "vertical";
  className?: string;
  min?: number;
  max?: number;
}

export const ResizeHandle = memo(function ResizeHandle({
  onResize,
  direction = "horizontal",
  className,
}: ResizeHandleProps) {
  const draggingRef = useRef(false);
  const startRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      startRef.current = direction === "horizontal" ? e.clientX : e.clientY;
      document.body.style.cursor = direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [direction],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const current = direction === "horizontal" ? e.clientX : e.clientY;
      const delta = current - startRef.current;
      startRef.current = current;
      onResize(delta);
    };

    const handleMouseUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [onResize, direction]);

  return (
    <div
      className={[
        "resize-handle",
        direction === "horizontal" ? "resize-handle-h" : "resize-handle-v",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation={direction}
      aria-label={direction === "horizontal" ? "拖拽调整宽度" : "拖拽调整高度"}
    />
  );
});
