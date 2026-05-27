import { Clipboard, Loader2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { Textarea } from "../components/ui/textarea";
import { desktopApi, errorMessage } from "../services/desktopApi";
import type { AppSettings, ModelConfig, SelectionAction, SelectionEvent } from "../types";
import { enabledSelectionActions, resolveSelectionDefaults } from "../utils/selectionActions";

type SelectionPhase = "actions" | "result";
type RunStatus = "idle" | "running" | "completed" | "failed";

const defaultSettings: AppSettings = {
  gitCommand: "git",
};

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export default function SelectionWindow() {
  const params = new URLSearchParams(window.location.search);
  const initialText = params.get("text") || "";
  const initialCaptureError = params.get("captureError") || undefined;
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [selectedText, setSelectedText] = useState(initialText);
  const [phase, setPhase] = useState<SelectionPhase>("actions");
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [activeActionId, setActiveActionId] = useState<string>();
  const [activeIndex, setActiveIndex] = useState(0);
  const [result, setResult] = useState("");
  const [error, setError] = useState<string | undefined>(initialCaptureError);
  const [expanded, setExpanded] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const runIdRef = useRef<string>();
  const actionsRef = useRef<HTMLDivElement | null>(null);

  const defaults = useMemo(() => resolveSelectionDefaults(settings, models), [models, settings]);
  const actions = useMemo(() => enabledSelectionActions(defaults.actions), [defaults.actions]);
  const activeAction = actions.find((action) => action.id === activeActionId) || actions[activeIndex] || actions[0];

  useEffect(() => {
    void loadData();
    let unsubscribe: (() => void) | undefined;
    void Promise.resolve()
      .then(() => desktopApi.onSelectionEvent(handleSelectionEvent))
      .then((next) => {
        unsubscribe = next;
      })
      .catch((eventError) => {
        setError(errorMessage(eventError));
      });

    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const handleMotionChange = () => setReducedMotion(prefersReducedMotion());
    media?.addEventListener?.("change", handleMotionChange);

    return () => {
      unsubscribe?.();
      media?.removeEventListener?.("change", handleMotionChange);
    };
  }, []);

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(actions.length - 1, 0)));
  }, [actions.length]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (expanded) setExpanded(false);
        else void desktopApi.selectionHide();
        return;
      }
      if (phase !== "actions") return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, actions.length - 1));
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (activeAction) void runAction(activeAction);
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [actions.length, activeAction, expanded, phase]);

  async function loadData() {
    try {
      const [nextSettings, nextModels] = await Promise.all([
        desktopApi.getSettings(),
        desktopApi.modelProviderList(),
      ]);
      setSettings(nextSettings);
      setModels(nextModels);
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  }

  function handleSelectionEvent(event: SelectionEvent) {
    if (event.runId !== runIdRef.current) return;
    if (event.event === "selection.started") {
      setRunStatus("running");
      return;
    }
    if (event.event === "selection.delta") {
      const delta = (event.payload as { delta?: string })?.delta || "";
      setResult((current) => current + delta);
      return;
    }
    if (event.event === "selection.completed") {
      setRunStatus("completed");
      return;
    }
    if (event.event === "selection.failed") {
      setRunStatus("failed");
      setError(errorMessage(event.payload));
    }
  }

  function handleActionWheel(event: WheelEvent<HTMLDivElement>) {
    if (!actionsRef.current || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    actionsRef.current.scrollLeft += event.deltaY;
  }

  async function runAction(action: SelectionAction) {
    const input = selectedText.trim();
    setActiveActionId(action.id);
    setPhase("result");
    setRunStatus("running");
    setResult("");
    setError(undefined);
    if (!input) {
      setRunStatus("failed");
      setError(initialCaptureError || "没有读取到选中文字，请粘贴或输入文本后重试。");
      return;
    }
    try {
      const run = await desktopApi.selectionRunAction({
        actionId: action.id,
        selectedText: input,
        providerId: defaults.providerId,
        model: defaults.model,
        reasoningEffort: defaults.reasoningEffort,
      });
      runIdRef.current = run.runId;
    } catch (runError) {
      setRunStatus("failed");
      setError(errorMessage(runError));
    }
  }

  async function copyResult() {
    await navigator.clipboard.writeText(result || error || selectedText);
  }

  const statusText = runStatus === "running"
    ? `${activeAction?.label || "动作"}中`
    : runStatus === "completed"
      ? `${activeAction?.label || "动作"}完成`
      : runStatus === "failed"
        ? "处理失败"
        : "Selection";

  return (
    <main
      className={[
        "selection-window-root",
        phase === "result" ? "is-result" : "is-actions",
        expanded ? "is-expanded" : "",
        reducedMotion ? "prefers-reduced-motion" : "",
      ].filter(Boolean).join(" ")}
    >
      <section className="selection-window-surface" aria-label="Selection">
        {phase === "actions" ? (
          <div className="selection-liquid-bar" data-wheel-scroll="true" onWheel={handleActionWheel} ref={actionsRef}>
            {actions.map((action, index) => (
              <button
                type="button"
                className={`selection-action-chip ${index === activeIndex ? "is-active" : ""}`}
                key={action.id}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => void runAction(action)}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="selection-result-panel">
            <header className="selection-result-header">
              <strong>Selection</strong>
              <span>
                {runStatus === "running" ? <Loader2 size={12} /> : null}
                {statusText}
              </span>
              <button type="button" aria-label="关闭 Selection" onClick={() => void desktopApi.selectionHide()}>
                <X size={13} />
              </button>
            </header>
            <div className="selection-action-row" data-wheel-scroll="true" onWheel={handleActionWheel} ref={actionsRef}>
              {actions.map((action, index) => (
                <button
                  type="button"
                  className={`selection-action-chip ${action.id === activeAction?.id ? "is-active" : ""}`}
                  key={action.id}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => void runAction(action)}
                >
                  {action.label}
                </button>
              ))}
            </div>
            <div className="selection-result-box">
              {runStatus === "running" ? <div className="selection-progress-line" aria-hidden="true" /> : null}
              <div className="selection-result-label">{runStatus === "running" ? "RUNNING" : "RESULT"}</div>
              {runStatus === "running" && !result ? (
                <div className="selection-skeleton" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              ) : error ? (
                <p className="selection-error">{error}</p>
              ) : (
                <MarkdownRenderer content={result || "等待结果..."} streaming={runStatus === "running"} />
              )}
            </div>
            {sourceOpen ? (
              <label className="selection-source-editor">
                <span>原文</span>
                <Textarea value={selectedText} onChange={(event) => setSelectedText(event.target.value)} />
              </label>
            ) : null}
            <footer className="selection-result-footer">
              <span>原文 {selectedText.trim().length} 字</span>
              <div>
                <button type="button" onClick={() => void copyResult()}>
                  <Clipboard size={12} />
                  复制
                </button>
                <button type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? "收起" : "展开"}</button>
                <button type="button" onClick={() => setSourceOpen((value) => !value)}>原文</button>
              </div>
            </footer>
          </div>
        )}
      </section>
    </main>
  );
}
