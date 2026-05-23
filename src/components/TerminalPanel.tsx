import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { desktopApi } from "../services/desktopApi";

interface TerminalPanelProps {
  rootPath?: string;
  workspaceName?: string;
  visible: boolean;
  onToggle: () => void;
}

export default function TerminalPanel({ rootPath, workspaceName, visible, onToggle }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const termIdRef = useRef<string | null>(null);
  const inputBufferRef = useRef<string>("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!visible || !containerRef.current || terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'var(--font-mono), "SF Mono", Menlo, Consolas, monospace',
      theme: {
        background: "transparent",
        foreground: "var(--text)",
        cursor: "var(--text)",
        selectionBackground: "var(--focus)",
        black: "#242424",
        red: "#c2413a",
        green: "#0f8a4b",
        yellow: "#9a6700",
        blue: "#2f6fed",
        magenta: "#a23bad",
        cyan: "#0f8a9c",
        white: "#74746f",
        brightBlack: "#9a9a94",
        brightRed: "#ff7b72",
        brightGreen: "#45c483",
        brightYellow: "#d8a657",
        brightBlue: "#6aa7ff",
        brightMagenta: "#d68fd8",
        brightCyan: "#5cc0d0",
        brightWhite: "#f4f4f3",
      },
      allowTransparency: true,
      convertEol: true,
    });

    terminalRef.current = term;
    term.open(containerRef.current);
    term.focus();

    // Bind input immediately so keystrokes are not lost before the pty spawns
    term.onData((data) => {
      if (termIdRef.current) {
        void desktopApi.terminalWrite(termIdRef.current, data);
      } else {
        inputBufferRef.current += data;
      }
    });

    void desktopApi.terminalCreate(rootPath).then((id) => {
      termIdRef.current = id;
      setReady(true);

      // Flush buffered input
      if (inputBufferRef.current) {
        void desktopApi.terminalWrite(id, inputBufferRef.current);
        inputBufferRef.current = "";
      }

      const cols = Math.max(80, Math.floor(containerRef.current!.clientWidth / 9));
      const rows = Math.max(12, Math.floor(containerRef.current!.clientHeight / 18));
      void desktopApi.terminalResize(id, cols, rows);
    });

    return () => {
      if (termIdRef.current) {
        void desktopApi.terminalKill(termIdRef.current);
        termIdRef.current = null;
      }
      inputBufferRef.current = "";
      term.dispose();
      terminalRef.current = null;
      setReady(false);
    };
  }, [visible, rootPath]);

  // Listen for terminal data from main process
  useEffect(() => {
    if (!visible) return;
    let unlisten: (() => void) | undefined;
    void desktopApi.onTerminalData((event) => {
      if (event.id === termIdRef.current && terminalRef.current) {
        terminalRef.current.write(event.data);
      }
    }).then((cb) => {
      unlisten = cb;
    });
    return () => unlisten?.();
  }, [visible]);

  // Handle resize
  useEffect(() => {
    if (!visible || !containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      if (!termIdRef.current || !terminalRef.current) return;
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const cols = Math.max(20, Math.floor(width / 9));
      const rows = Math.max(4, Math.floor(height / 18));
      void desktopApi.terminalResize(termIdRef.current, cols, rows);
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="terminal-panel">
      <div className="terminal-panel-header">
        <div className="terminal-tabs">
          <span className="terminal-tab is-active">
            <span className="terminal-tab-name">{workspaceName || "终端"}</span>
          </span>
        </div>
        <div className="terminal-panel-actions">
          <span className="terminal-status">{ready ? "●" : "○"}</span>
          <button
            className="terminal-close-button"
            type="button"
            aria-label="关闭终端"
            onClick={onToggle}
          >
            ✕
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="terminal-body"
        onClick={() => terminalRef.current?.focus()}
      />
    </div>
  );
}
