import mermaid from "mermaid";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  memo,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { codeToTokens } from "shiki";
import type { BundledLanguage } from "shiki";
import type { ThemedToken } from "shiki";
import { Copy, Check } from "lucide-react";
import { FilePathChip, detectFilePath } from "./message/FilePathChip";
import { currentShikiTheme, isCurrentThemeDark } from "../utils/themeMode";

/* ------------------------------------------------------------------ */
/*  Mermaid init                                                       */
/* ------------------------------------------------------------------ */

function isDarkMode() {
  return isCurrentThemeDark();
}

function buildMermaidConfig() {
  const dark = isDarkMode();

  /* -------- semantic palette (dark-optimized) -------- */
  const bg = dark ? "#0d1117" : "#ffffff";              // GitHub-dark bg for better contrast
  const text = dark ? "#e6edf3" : "#1e1e1e";            // brighter text for dark
  const muted = dark ? "#8b949e" : "#656560";            // soft gray
  const line = dark ? "#30363d" : "#d8d8d4";            // subtle grid/border
  const edge = dark ? "#848d97" : "#4a4a45";            // arrows/lines
  const panel = dark ? "#161b22" : "#f6f6f4";           // node/card bg
  const panelHover = dark ? "#1c2128" : "#f1f1ef";
  const accent = dark ? "#58a6ff" : "#0969da";          // brighter blue
  const accentMuted = dark ? "#0d419d" : "#ddf4ff";
  const success = dark ? "#3fb950" : "#1a7f37";
  const warning = dark ? "#d29922" : "#9a6700";
  const error = dark ? "#f85149" : "#cf222e";

  return {
    startOnLoad: false,
    securityLevel: "strict" as const,
    theme: "base" as const,
    themeVariables: {
      darkMode: dark ? "true" : "false",
      background: bg,
      primaryColor: accent,
      primaryTextColor: text,
      primaryBorderColor: accent,
      secondaryColor: accentMuted,
      tertiaryColor: bg,
      textColor: text,
      lineColor: edge,
      arrowheadColor: edge,
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',

      /* --- flowchart nodes (default rects) --- */
      mainBkg: panel,
      mainContrastColor: text,
      nodeBorder: dark ? "#30363d" : "#d0d0cc",
      nodeTextColor: text,

      /* --- edges / labels --- */
      edgeLabelBackground: dark ? "#161b22" : "#ffffff",
      edgeLabelText: text,
      edgeLabelColor: text,

      /* --- clusters --- */
      clusterBkg: dark ? "rgba(48,54,61,0.3)" : "rgba(0,0,0,0.02)",
      clusterBorder: dark ? "rgba(48,54,61,0.6)" : "rgba(0,0,0,0.06)",
      titleColor: text,

      /* --- sequence diagram --- */
      actorBorder: dark ? "#30363d" : "#d0d0cc",
      actorBkg: dark ? "#161b22" : "#f6f6f4",
      actorTextColor: text,
      actorLineColor: dark ? "#30363d" : "#d0d0cc",
      signalColor: edge,
      signalTextColor: text,
      labelBoxBkgColor: dark ? "#0d1117" : "#ffffff",
      labelBoxBorderColor: dark ? "#30363d" : "#d0d0cc",
      labelTextColor: text,
      loopTextColor: text,
      activationBorderColor: dark ? "#30363d" : "#d0d0cc",
      activationBkgColor: dark ? "#1c2128" : "#ececea",

      /* --- gantt / pie / flow --- */
      sectionBkgColor: dark ? "#161b22" : "#f6f6f4",
      altSectionBkgColor: dark ? "#0d1117" : "#ffffff",
      gridColor: dark ? "#21262d" : "#e0e0dc",
      pieTitleTextSize: "14px",
      pieTitleTextColor: text,
      pieSectionTextSize: "12px",
      pieSectionTextColor: text,
      pieLegendTextSize: "12px",
      pieLegendTextColor: muted,

      /* --- class / state / er diagram --- */
      classText: text,
      classBorder: dark ? "#30363d" : "#d0d0cc",
      classBkg: dark ? "#161b22" : "#f6f6f4",
      fillType0: dark ? "#161b22" : "#f6f6f4",
      fillType1: dark ? "#1c2128" : "#ececea",
      fillType2: dark ? "#21262d" : "#e2e2df",
      fillType3: dark ? "#282e36" : "#d8d8d4",
      fillType4: dark ? "#30363d" : "#cececa",
      fillType5: dark ? "#363c44" : "#c4c4c0",
      fillType6: dark ? "#3c434c" : "#babab6",
      fillType7: dark ? "#434a53" : "#b0b0ac",

      /* --- git graph --- */
      git0: dark ? "#3fb950" : "#1a7f37",
      git1: dark ? "#58a6ff" : "#0969da",
      git2: dark ? "#bc8cff" : "#8250df",
      git3: dark ? "#f0883e" : "#cf222e",
      git4: dark ? "#56d4dd" : "#1b7c83",
      git5: dark ? "#d29922" : "#9a6700",
      git6: dark ? "#f85149" : "#d1242f",
      git7: dark ? "#79c0ff" : "#54aeff",
      gitBranchLabel0: text,
      gitBranchLabel1: text,
      gitBranchLabel2: text,
      gitBranchLabel3: text,
      gitBranchLabel4: text,
      gitBranchLabel5: text,
      gitBranchLabel6: text,
      gitBranchLabel7: text,
      gitInv0: bg,
      gitInv1: bg,
      gitInv2: bg,
      gitInv3: bg,
      gitInv4: bg,
      gitInv5: bg,
      gitInv6: bg,
      gitInv7: bg,

      /* --- journey / requirement --- */
      taskBkgColor: dark ? "#161b22" : "#f6f6f4",
      taskTextColor: text,
      taskTextLightColor: text,
      taskTextOutsideColor: text,
      activeTaskBkgColor: dark ? "#1c2128" : "#ececea",
      activeTaskBorderColor: dark ? "#30363d" : "#d0d0cc",

      /* --- timeline --- */
      cScale0: dark ? "#161b22" : "#f6f6f4",
      cScale1: dark ? "#1c2128" : "#ececea",
      cScale2: dark ? "#21262d" : "#e2e2df",
      cScale3: dark ? "#282e36" : "#d8d8d4",
      cScale4: dark ? "#30363d" : "#cececa",
      cScale5: dark ? "#363c44" : "#c4c4c0",
      cScale6: dark ? "#3c434c" : "#babab6",
      cScale7: dark ? "#434a53" : "#b0b0ac",
      cScale8: dark ? "#4a515b" : "#a6a6a2",
      cScale9: dark ? "#515965" : "#9c9c98",
      cScale10: dark ? "#58606d" : "#92928e",
      cScale11: dark ? "#5f6775" : "#888884",

      /* --- mindmap / quadrant --- */
      mindmapDiagramNodeBorder: dark ? "#30363d" : "#d0d0cc",
      mindmapDiagramNodeBkg: dark ? "#161b22" : "#f6f6f4",
      mindmapDiagramNodeText: text,
      quadrant1Fill: dark ? "#161b22" : "#f6f6f4",
      quadrant2Fill: dark ? "#1c2128" : "#ececea",
      quadrant3Fill: dark ? "#21262d" : "#e2e2df",
      quadrant4Fill: dark ? "#282e36" : "#d8d8d4",
      quadrantPointFill: muted,
      quadrantPointText: text,
      quadrantXAxisText: text,
      quadrantYAxisText: text,
      quadrantInternalBorderStrokeFill: dark ? "#30363d" : "#d0d0cc",
      quadrantExternalBorderStrokeFill: dark ? "#30363d" : "#d0d0cc",
      quadrantTitleFill: text,
    } as Record<string, string>,
  };
}

mermaid.initialize(buildMermaidConfig()); 

// re-init when theme toggles so new diagrams pick up the right palette
function reinitMermaidTheme() {
  mermaid.initialize(buildMermaidConfig());
}
window.addEventListener("any-jumper-theme-change", reinitMermaidTheme); 

// also listen for system changes
window
  .matchMedia?.("(prefers-color-scheme: dark)")
  ?.addEventListener("change", reinitMermaidTheme); 

/* ------------------------------------------------------------------ */
/*  Theme-change helper (dispatch from main.tsx when toggling)         */
/* ------------------------------------------------------------------ */

export function notifyThemeChange() {
  window.dispatchEvent(new CustomEvent("any-jumper-theme-change"));
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MarkdownRendererProps {
  content: string;
  streaming?: boolean;
  progressive?: boolean;
  onFileOpen?: (filePath: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Shiki code block                                                   */
/* ------------------------------------------------------------------ */

function useShikiTokens(code: string, lang: string | undefined, streaming: boolean) {
  const [tokens, setTokens] = useState<ThemedToken[][]>([]);
  const [loading, setLoading] = useState(true);
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    // 80ms throttle during streaming to avoid excessive re-computation
    const now = Date.now();
    if (streaming && now - lastUpdateRef.current < 80) {
      setLoading(false);
      return;
    }

    async function run() {
      try {
        const result = await codeToTokens(code, {
          lang: (lang || "text") as BundledLanguage,
          theme: currentShikiTheme(),
        });
        if (!cancelled) {
          setTokens(result.tokens);
          setLoading(false);
          lastUpdateRef.current = Date.now();
        }
      } catch {
        if (!cancelled) {
          setTokens([]);
          setLoading(false);
        }
      }
    }

    void run();

    const onThemeChange = () => {
      void run();
    };
    window.addEventListener("any-jumper-theme-change", onThemeChange);
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener("change", onThemeChange);

    return () => {
      cancelled = true;
      window.removeEventListener("any-jumper-theme-change", onThemeChange);
      media?.removeEventListener("change", onThemeChange);
    };
  }, [code, lang, streaming]);

  return { tokens, loading };
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function extractMeta(className?: string) {
  // className like "language-ts:filename.ts" or "language-ts"
  const langMatch = /language-(\S+)/.exec(className || "");
  const raw = langMatch?.[1] || "";
  const [lang, filename] = raw.split(":");
  return { lang: lang || undefined, filename: filename || undefined };
}

function fontStyleToString(style: unknown): string | undefined {
  if (style === undefined || style === null) return undefined;
  const s = style as number;
  const parts: string[] = [];
  // Shiki fontStyle bitmask: 1=italic, 2=bold, 4=underline
  if (s & 1) parts.push("italic");
  if (s & 2) parts.push("bold");
  if (s & 4) parts.push("underline");
  return parts.length > 0 ? parts.join(" ") : undefined;
}

const CodeLine = memo(function CodeLine({
  tokens,
  rawLine,
}: {
  tokens: ThemedToken[];
  rawLine: string;
}) {
  let tokenLength = 0;
  return (
    <span className="line">
      {tokens.map((token, i) => {
        tokenLength += token.content.length;
        return (
          <span
            key={i}
            style={{
              color: token.color,
              fontStyle: fontStyleToString(token.fontStyle),
            }}
          >
            {token.content}
          </span>
        );
      })}
      {tokenLength < rawLine.length && (
        <span>{rawLine.slice(tokenLength)}</span>
      )}
    </span>
  );
});

function CodeBlock({
  code,
  lang,
  filename,
  streaming = false,
}: {
  code: string;
  lang?: string;
  filename?: string;
  streaming?: boolean;
}) {
  const { tokens, loading } = useShikiTokens(code, lang, streaming);
  const [copied, setCopied] = useState(false);
  const rawLines = useMemo(() => code.split("\n"), [code]);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <div className="shiki-block">
      <div className="shiki-header">
        <div className="shiki-meta">
          {filename ? (
            <span className="shiki-filename">{filename}</span>
          ) : lang ? (
            <span className="shiki-lang">{lang}</span>
          ) : null}
        </div>
        <button
          type="button"
          className="shiki-copy"
          onClick={handleCopy}
          aria-label="复制代码"
          title="复制"
        >
          {copied ? (
            <Check size={14} />
          ) : (
            <Copy size={14} />
          )}
          <span>{copied ? "已复制" : "复制"}</span>
        </button>
      </div>
      <pre className={`shiki-body${loading ? " is-loading" : ""}`}>
        <code>
          {rawLines.map((rawLine, i) => (
            <Fragment key={i}>
              {i > 0 && "\n"}
              <CodeLine tokens={tokens[i] ?? []} rawLine={rawLine} />
            </Fragment>
          ))}
        </code>
      </pre>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mermaid block                                                      */
/* ------------------------------------------------------------------ */

function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [svgVisible, setSvgVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const generationRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<HTMLDivElement>(null);

  // Theme change: re-render
  const [themeVersion, setThemeVersion] = useState(0);
  useEffect(() => {
    const onThemeChange = () => {
      reinitMermaidTheme();
      setThemeVersion((c) => c + 1);
    };
    window.addEventListener("any-jumper-theme-change", onThemeChange);
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener("change", onThemeChange);
    return () => {
      window.removeEventListener("any-jumper-theme-change", onThemeChange);
      media?.removeEventListener("change", onThemeChange);
    };
  }, []);

  // 350ms debounced render with generation race protection
  useEffect(() => {
    const gen = ++generationRef.current;
    setSvgVisible(false);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const id = `mermaid-${gen}`;
      mermaid
        .render(id, code)
        .then((result) => {
          if (generationRef.current === gen) {
            setSvg(result.svg);
            setError("");
            setSvgVisible(true);
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }
        })
        .catch((reason) => {
          if (generationRef.current === gen) {
            setError(String(reason));
            setSvg("");
            setSvgVisible(false);
          }
        });
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [code, themeVersion]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }, [code]);

  // Zoom with scroll wheel (only when Ctrl/Cmd is held)
  // NOTE: React 17+ attaches wheel listeners as passive, so e.preventDefault()
  // has no effect in the synthetic event. We attach a native non-passive listener
  // below to actually suppress the browser's built-in Ctrl+Scroll page zoom.
  const handleWheel = useCallback((e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault(); // only works with { passive: false }
    setZoom((z) => Math.min(3, Math.max(0.25, z - e.deltaY * 0.001)));
  }, []);

  useEffect(() => {
    const node = svgRef.current;
    if (!node) return;
    node.addEventListener("wheel", handleWheel, { passive: false });
    return () => node.removeEventListener("wheel", handleWheel);
  }, [error, handleWheel]);

  // Pan with mouse drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isPanning.current = true;
    panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
  }, [pan.x, pan.y]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isPanning.current) return;
      setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y });
    };
    const onMouseUp = () => {
      isPanning.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className="mermaid-block">
      <div className="mermaid-block-toolbar">
        <span className="mermaid-block-label">Diagram</span>
        <div className="mermaid-block-zoom">
          <button onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))} title="缩小">−</button>
          <span className="mermaid-block-zoom-value" onClick={resetZoom}>{zoomPercent}%</span>
          <button onClick={() => setZoom((z) => Math.min(3, z + 0.25))} title="放大">+</button>
          <button onClick={resetZoom} title="重置">↺</button>
        </div>
        <button
          className="mermaid-block-copy"
          onClick={handleCopy}
          title="复制源码"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "已复制" : "源码"}
        </button>
      </div>
      <div className="mermaid-block-stage" ref={containerRef}>
        {error ? (
          <pre className="mermaid-block-source is-error">{code}</pre>
        ) : (
          <>
            <pre className="mermaid-block-source" style={{ opacity: svgVisible ? 0 : 1 }}>
              {code}
            </pre>
            <div
              ref={svgRef}
              className="mermaid-block-svg"
              style={{ opacity: svgVisible ? 1 : 0 }}
              onMouseDown={handleMouseDown}
            >
              <div
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: "center center",
                }}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Markdown components                                                */
/* ------------------------------------------------------------------ */

function MarkdownHeading({
  level,
  children,
}: {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children?: ReactNode;
}) {
  const Tag = `h${level}` as const;
  return <Tag className={`md-h${level}`}>{children}</Tag>;
}

function MarkdownTable({ children }: { children?: ReactNode }) {
  return (
    <div className="md-table-wrap">
      <table className="md-table">{children}</table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Renderer                                                           */
/* ------------------------------------------------------------------ */

export const MarkdownRenderer = memo(function MarkdownRenderer({ content, streaming = false, progressive = false, onFileOpen }: MarkdownRendererProps) {
  if (streaming) {
    if (!progressive) {
      // 短内容直接展示纯文本，避免闪烁
      if (content.length < 200) {
        return (
          <div className="markdown-body is-streaming">
            <div className="streaming-markdown-text">{content}</div>
          </div>
        );
      }
      // 长内容：已稳定的前缀渲染 Markdown，正在流出的末尾展示纯文本
      const splitPoint = Math.max(0, content.length - 200);
      const stableContent = content.slice(0, splitPoint);
      const streamingTail = content.slice(splitPoint);
      return (
        <div className="markdown-body is-streaming">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1(props) {
                return <MarkdownHeading level={1}>{props.children}</MarkdownHeading>;
              },
              h2(props) {
                return <MarkdownHeading level={2}>{props.children}</MarkdownHeading>;
              },
              h3(props) {
                return <MarkdownHeading level={3}>{props.children}</MarkdownHeading>;
              },
              h4(props) {
                return <MarkdownHeading level={4}>{props.children}</MarkdownHeading>;
              },
              h5(props) {
                return <MarkdownHeading level={5}>{props.children}</MarkdownHeading>;
              },
              h6(props) {
                return <MarkdownHeading level={6}>{props.children}</MarkdownHeading>;
              },
              p(props) {
                return <p className="md-p">{props.children}</p>;
              },
              ul(props) {
                return <ul className="md-ul">{props.children}</ul>;
              },
              ol(props) {
                return <ol className="md-ol">{props.children}</ol>;
              },
              li(props) {
                return <li className="md-li">{props.children}</li>;
              },
              blockquote(props) {
                return <blockquote className="md-blockquote">{props.children}</blockquote>;
              },
              hr() {
                return <hr className="md-hr" />;
              },
              a(props) {
                return (
                  <a href={props.href} target="_blank" rel="noreferrer" className="md-a">
                    {props.children}
                  </a>
                );
              },
              strong(props) {
                return <strong className="md-strong">{props.children}</strong>;
              },
              em(props) {
                return <em className="md-em">{props.children}</em>;
              },
              del(props) {
                return <del className="md-del">{props.children}</del>;
              },
              code(props) {
                const { className, children } = props;
                const codeText = String(children).replace(/\n$/, "");
                const { lang, filename } = extractMeta(className);
                const match = /language-(\w+)/.exec(className || "");
                if (match) {
                  return (
                    <CodeBlock code={codeText} lang={lang} filename={filename} streaming />
                  );
                }
                const filePath = detectFilePath(codeText);
                if (filePath) {
                  return <FilePathChip filePath={filePath} onOpen={onFileOpen} />;
                }
                return <code className="md-inline-code">{children}</code>;
              },
              pre(props) {
                return <>{props.children}</>;
              },
              table(props) {
                return <MarkdownTable>{props.children}</MarkdownTable>;
              },
            }}
          >
            {stableContent}
          </ReactMarkdown>
          <span className="streaming-markdown-text">{streamingTail}</span>
        </div>
      );
    }
  }

  return (
    <div className={`markdown-body ${streaming && progressive ? "is-streaming is-progressive" : ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1(props) {
            return <MarkdownHeading level={1}>{props.children}</MarkdownHeading>;
          },
          h2(props) {
            return <MarkdownHeading level={2}>{props.children}</MarkdownHeading>;
          },
          h3(props) {
            return <MarkdownHeading level={3}>{props.children}</MarkdownHeading>;
          },
          h4(props) {
            return <MarkdownHeading level={4}>{props.children}</MarkdownHeading>;
          },
          h5(props) {
            return <MarkdownHeading level={5}>{props.children}</MarkdownHeading>;
          },
          h6(props) {
            return <MarkdownHeading level={6}>{props.children}</MarkdownHeading>;
          },
          p(props) {
            return <p className="md-p">{props.children}</p>;
          },
          ul(props) {
            return <ul className="md-ul">{props.children}</ul>;
          },
          ol(props) {
            return <ol className="md-ol">{props.children}</ol>;
          },
          li(props) {
            return <li className="md-li">{props.children}</li>;
          },
          blockquote(props) {
            return <blockquote className="md-blockquote">{props.children}</blockquote>;
          },
          table(props) {
            return <MarkdownTable>{props.children}</MarkdownTable>;
          },
          thead(props) {
            return <thead className="md-thead">{props.children}</thead>;
          },
          tbody(props) {
            return <tbody className="md-tbody">{props.children}</tbody>;
          },
          tr(props) {
            return <tr className="md-tr">{props.children}</tr>;
          },
          th(props) {
            return <th className="md-th">{props.children}</th>;
          },
          td(props) {
            return <td className="md-td">{props.children}</td>;
          },
          a(props) {
            return (
              <a
                className="md-a"
                href={props.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {props.children}
              </a>
            );
          },
          hr() {
            return <hr className="md-hr" />;
          },
          code(props) {
            const { children, className, node } = props;
            const codeText = String(children).replace(/\n$/, "");
            const { lang, filename } = extractMeta(className);

            if (lang === "mermaid") {
              return <MermaidBlock code={codeText} />;
            }

            // inline code: no className and no newlines
            const isInline =
              !className &&
              !codeText.includes("\n") &&
              node?.type === "element" &&
              node?.tagName !== "pre";
            if (isInline) {
              const filePath = detectFilePath(codeText);
              if (filePath) {
                return <FilePathChip filePath={filePath} onOpen={onFileOpen} />;
              }
              return <code className="md-inline-code">{children}</code>;
            }

            return <CodeBlock code={codeText} lang={lang} filename={filename} streaming={streaming && progressive} />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
      {streaming && progressive ? <span className="streaming-markdown-text" aria-hidden="true" /> : null}
    </div>
  );
});
