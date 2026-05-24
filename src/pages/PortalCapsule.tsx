import { Eraser, ExternalLink, Loader2, Pin, PinOff, Send, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { desktopApi, errorMessage } from "../services/desktopApi";
import type { AgentEvent, AgentItem, AppSettings, ModelConfig, ThreadDetail, Workspace } from "../types";
import {
  DEFAULT_PORTAL_REASONING_EFFORT,
  DEFAULT_PORTAL_SHORTCUT,
  resolvePortalDefaults,
} from "../utils/portalDefaults";

const PORTAL_QUICK_ASK_TITLE = "Portal Quick Ask";

const defaultSettings: AppSettings = {
  gitCommand: "git",
  portalShortcut: DEFAULT_PORTAL_SHORTCUT,
  portalReasoningEffort: DEFAULT_PORTAL_REASONING_EFFORT,
};

export default function PortalCapsule() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [question, setQuestion] = useState("");
  const [conversationItems, setConversationItems] = useState<AgentItem[]>([]);
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const [threadId, setThreadId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [pinned, setPinned] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const historyRef = useRef<HTMLDivElement | null>(null);
  const threadIdRef = useRef<string>();

  const defaults = useMemo(
    () => resolvePortalDefaults(settings, models, workspaces),
    [models, settings, workspaces],
  );
  const hasConversation = conversationItems.length > 0 || Boolean(streamingAnswer.trim());

  useEffect(() => {
    threadIdRef.current = threadId;
  }, [threadId]);

  useEffect(() => {
    const history = historyRef.current;
    if (!history) return;
    window.requestAnimationFrame(() => {
      history.scrollTo({ top: history.scrollHeight, behavior: "smooth" });
    });
  }, [conversationItems, streamingAnswer]);

  useEffect(() => {
    void loadData();
    focusInputSoon();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        void desktopApi.portalHide();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);

    let unlisten: (() => void) | undefined;
    try {
      void desktopApi.onAgentEvent(handleAgentEvent).then((next) => {
        unlisten = next;
      }).catch((listenError) => {
        setError(errorMessage(listenError));
      });
    } catch (listenError) {
      setError(errorMessage(listenError));
    }

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      unlisten?.();
    };
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [nextSettings, nextModels, nextWorkspaces] = await Promise.all([
        desktopApi.getSettings(),
        desktopApi.modelProviderList(),
        desktopApi.workspaceList(),
      ]);
      const mergedSettings = { ...defaultSettings, ...nextSettings };
      setSettings(mergedSettings);
      setModels(nextModels);
      setWorkspaces(nextWorkspaces);
      await restorePortalThread(mergedSettings, nextModels, nextWorkspaces);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
      focusInputSoon();
    }
  }

  async function restorePortalThread(nextSettings: AppSettings, nextModels: ModelConfig[], nextWorkspaces: Workspace[]) {
    const nextDefaults = resolvePortalDefaults(nextSettings, nextModels, nextWorkspaces);
    if (!nextDefaults.workspaceId) return;
    const existing = (await desktopApi.threadList(nextDefaults.workspaceId))
      .find((thread) => thread.title === PORTAL_QUICK_ASK_TITLE);
    if (!existing) return;
    setThreadId(existing.id);
    threadIdRef.current = existing.id;
    const detail = await desktopApi.threadRead(existing.id);
    setConversationItems(visibleConversationItems(detail));
  }

  async function handleAgentEvent(event: AgentEvent) {
    if (event.threadId !== threadIdRef.current) return;
    if (event.event === "message.delta") {
      const delta = (event.payload as { delta?: string })?.delta || "";
      if (delta) setStreamingAnswer((current) => current + delta);
      return;
    }
    if (event.event === "turn.failed") {
      setBusy(false);
      setError(errorMessage(event.payload));
      await refreshConversation(true);
      focusInputSoon();
      return;
    }
    if (
      event.event === "turn.completed" ||
      event.event === "message.completed" ||
      event.event === "message.replaced"
    ) {
      if (event.event === "turn.completed") {
        setBusy(false);
        focusInputSoon();
      }
      await refreshConversation(
        event.event === "turn.completed" ||
        event.event === "message.completed" ||
        event.event === "message.replaced",
      );
    }
  }

  async function refreshConversation(clearStreaming = false) {
    const currentThreadId = threadIdRef.current;
    if (!currentThreadId) return;
    try {
      const next = await desktopApi.threadRead(currentThreadId);
      setConversationItems(visibleConversationItems(next));
      if (clearStreaming) setStreamingAnswer("");
    } catch (readError) {
      setError(errorMessage(readError));
    }
  }

  async function ensurePortalThread() {
    if (!defaults.workspaceId) {
      throw new Error("请先在主窗口创建 Workspace，或到 Portal 页面选择默认 Workspace。");
    }
    const existing = (await desktopApi.threadList(defaults.workspaceId))
      .find((thread) => thread.title === PORTAL_QUICK_ASK_TITLE);
    if (existing) return existing;
    return desktopApi.threadCreate({
      workspaceId: defaults.workspaceId,
      title: PORTAL_QUICK_ASK_TITLE,
      providerId: defaults.providerId,
      model: defaults.model,
      reasoningEffort: defaults.reasoningEffort,
      permissionMode: "readOnly",
    });
  }

  async function submitQuestion() {
    const input = question.trim();
    if (!input || busy) return;
    setBusy(true);
    setError(undefined);
    setStreamingAnswer("");
    try {
      const thread = await ensurePortalThread();
      const localUser: AgentItem = {
        id: `local-${Date.now()}`,
        threadId: thread.id,
        role: "user",
        itemType: "message",
        content: input,
        status: "completed",
        hidden: false,
        createdAt: Date.now(),
      };
      const isExistingThread = threadIdRef.current === thread.id;
      setThreadId(thread.id);
      threadIdRef.current = thread.id;
      setQuestion("");
      focusInputSoon();
      if (isExistingThread) {
        setConversationItems((current) => [...current, localUser]);
      } else {
        const detail = await desktopApi.threadRead(thread.id);
        setConversationItems([...visibleConversationItems(detail), localUser]);
      }
      await desktopApi.turnStart({
        threadId: thread.id,
        input,
        runtimeId: "deepagents",
        providerId: defaults.providerId,
        model: defaults.model,
        reasoningEffort: defaults.reasoningEffort,
        permissionMode: "readOnly",
      });
    } catch (submitError) {
      setBusy(false);
      setError(errorMessage(submitError));
      focusInputSoon();
    }
  }

  async function clearConversation() {
    const currentThreadId = threadIdRef.current;
    setError(undefined);
    setBusy(false);
    setQuestion("");
    setStreamingAnswer("");
    setConversationItems([]);
    setThreadId(undefined);
    threadIdRef.current = undefined;
    focusInputSoon();
    if (!currentThreadId) return;
    try {
      if (busy) {
        await desktopApi.turnInterrupt(currentThreadId).catch(() => undefined);
      }
      await desktopApi.threadArchive(currentThreadId);
    } catch (clearError) {
      setError(errorMessage(clearError));
    }
  }

  function focusInputSoon() {
    window.setTimeout(() => inputRef.current?.focus(), 20);
  }

  async function openFullChat() {
    await desktopApi.portalOpenChat(defaults.workspaceId, threadId);
    await desktopApi.portalHide();
  }

  async function togglePinned() {
    const nextPinned = !pinned;
    setPinned(nextPinned);
    try {
      await desktopApi.portalSetAlwaysOnTop(nextPinned);
    } catch (pinError) {
      setPinned(!nextPinned);
      setError(errorMessage(pinError));
    }
  }

  return (
    <main className="portal-capsule-root">
      <section className="portal-capsule" aria-label="Any Jumper Portal">
        <header className="portal-capsule-header">
          <div className="portal-capsule-title">
            <Sparkles size={16} />
            <span>Portal</span>
          </div>
          <button
            className={`portal-capsule-icon-button ${pinned ? "is-active" : ""}`}
            type="button"
            aria-label={pinned ? "取消置顶" : "置顶 Portal"}
            title={pinned ? "取消置顶" : "置顶 Portal"}
            onClick={() => void togglePinned()}
          >
            {pinned ? <Pin size={15} /> : <PinOff size={15} />}
          </button>
          <button className="portal-capsule-close" type="button" aria-label="关闭 Portal" onClick={() => void desktopApi.portalHide()}>
            <X size={15} />
          </button>
        </header>

        {error ? <div className="portal-capsule-error">{error}</div> : null}
        {hasConversation ? (
          <div className="portal-capsule-history" ref={historyRef}>
            {conversationItems.map((item) => (
              <div
                key={item.id}
                className={`portal-capsule-message ${item.role === "user" ? "is-user" : "is-assistant"}`}
              >
                {item.role === "assistant" ? (
                  <MarkdownRenderer content={item.content} streaming={item.status === "running"} />
                ) : (
                  <p>{item.content}</p>
                )}
              </div>
            ))}
            {streamingAnswer.trim() ? (
              <div className="portal-capsule-message is-assistant is-streaming">
                <MarkdownRenderer content={streamingAnswer} streaming={busy} />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="portal-capsule-input-row">
          <Textarea
            ref={inputRef}
            className="portal-capsule-input"
            value={question}
            placeholder={loading ? "正在读取 Portal 配置..." : "问 Any Jumper..."}
            disabled={loading}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submitQuestion();
              }
            }}
          />
          <Button
            className="portal-capsule-send"
            type="button"
            size="icon"
            disabled={loading || busy || !question.trim()}
            onClick={() => void submitQuestion()}
          >
            {busy ? <Loader2 className="is-spinning" size={17} /> : <Send size={17} />}
          </Button>
        </div>

        <footer className="portal-capsule-footer">
          <div className="portal-capsule-footer-actions">
            <button
              type="button"
              disabled={!threadId && !hasConversation && !question.trim()}
              onClick={() => void clearConversation()}
            >
              <Eraser size={12} />
              Clear
            </button>
            <button type="button" disabled={!threadId} onClick={() => void openFullChat()}>
              <ExternalLink size={12} />
              打开完整会话
            </button>
          </div>
        </footer>
      </section>
    </main>
  );
}

function visibleConversationItems(detail: ThreadDetail) {
  return detail.items.filter((item) => (
    !item.hidden &&
    (item.role === "user" || item.role === "assistant") &&
    item.content.trim()
  ));
}
