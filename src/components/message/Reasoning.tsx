import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  memo,
  type ReactNode,
} from "react";
import { Brain, ChevronDown } from "lucide-react";

interface ReasoningContextValue {
  isOpen: boolean;
  isStreaming: boolean;
  duration: number;
  toggle: () => void;
}

const ReasoningContext = createContext<ReasoningContextValue>({
  isOpen: false,
  isStreaming: false,
  duration: 0,
  toggle: () => {},
});

export function useReasoning() {
  return useContext(ReasoningContext);
}

interface ReasoningProps {
  isStreaming: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

export const Reasoning = memo(function Reasoning({
  isStreaming,
  open: controlledOpen,
  onOpenChange,
  children,
}: ReasoningProps) {
  const [internalOpen, setInternalOpen] = useState(isStreaming);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const [duration, setDuration] = useState(0);
  const startTimeRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const hasAutoClosed = useRef(false);

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  const toggle = useCallback(() => {
    setOpen(!isOpen);
  }, [isOpen, setOpen]);

  // Duration tracking
  useEffect(() => {
    if (isStreaming && !startTimeRef.current) {
      startTimeRef.current = Date.now();
    }

    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isStreaming]);

  // Reset start time when streaming starts
  useEffect(() => {
    if (isStreaming) {
      startTimeRef.current = Date.now();
      setDuration(0);
    }
  }, [isStreaming]);

  // Auto-expand during streaming
  useEffect(() => {
    if (isStreaming) {
      setOpen(true);
      hasAutoClosed.current = false;
    }
  }, [isStreaming, setOpen]);

  // Auto-collapse 1s after streaming ends (only once)
  useEffect(() => {
    if (!isStreaming && isOpen && !hasAutoClosed.current) {
      const timer = setTimeout(() => {
        if (!isControlled) {
          setOpen(false);
          hasAutoClosed.current = true;
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, isOpen, setOpen, isControlled]);

  return (
    <ReasoningContext.Provider value={{ isOpen, isStreaming, duration, toggle }}>
      <div className="reasoning">{children}</div>
    </ReasoningContext.Provider>
  );
});

export const ReasoningTrigger = memo(function ReasoningTrigger({
  className,
}: {
  className?: string;
}) {
  const { isOpen, isStreaming, duration, toggle } = useReasoning();

  return (
    <button
      type="button"
      className={[
        "reasoning-trigger",
        "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm",
        "hover:bg-foreground/5 transition-colors",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={toggle}
      aria-expanded={isOpen}
    >
      <Brain
        size={15}
        className={isStreaming ? "animate-pulse text-primary" : "text-muted-foreground"}
      />
      <span className="text-muted-foreground">
        {isStreaming ? "思考中..." : `思考了 ${duration} 秒`}
      </span>
      <ChevronDown
        size={13}
        className={[
          "transition-transform duration-200",
          isOpen ? "rotate-180" : "rotate-0",
        ].join(" ")}
      />
    </button>
  );
});

export const ReasoningContent = memo(function ReasoningContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { isOpen } = useReasoning();
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (contentRef.current) {
      setHeight(isOpen ? contentRef.current.scrollHeight : 0);
    }
  }, [isOpen, children]);

  return (
    <div
      className={[
        "reasoning-content overflow-hidden transition-all duration-200 ease-out",
        isOpen ? "opacity-100" : "opacity-0",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ maxHeight: isOpen ? height : 0 }}
      aria-hidden={!isOpen}
    >
      <div ref={contentRef} className="px-3 py-2 text-sm text-muted-foreground">
        {children}
      </div>
    </div>
  );
});
