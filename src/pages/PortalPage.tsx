import {
  CheckCircle,
  Keyboard,
  RadioTower,
  Save,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { WorkbenchPage, WorkbenchSection } from "../components/Workbench";
import { desktopApi, errorMessage } from "../services/desktopApi";
import type { ActivityItem, AppSettings, ModelConfig, Workspace } from "../types";
import { formatElectronShortcutFromEvent } from "../utils/keyboardShortcut";
import { modelOptionsForProvider } from "../utils/modelProviders";
import {
  DEFAULT_MAIN_WINDOW_SHORTCUT,
  DEFAULT_PORTAL_REASONING_EFFORT,
  DEFAULT_PORTAL_SHORTCUT,
  resolvePortalDefaults,
} from "../utils/portalDefaults";

interface PortalPageProps {
  pushActivity: (
    title: string,
    status?: ActivityItem["status"],
    detail?: string,
  ) => void;
}

interface NoticeState {
  tone: "success" | "warning" | "danger" | "muted";
  title: string;
  detail?: string;
}

interface PortalQuickAskSettingsProps {
  settingsDraft: AppSettings;
  models: ModelConfig[];
  workspaceOptions: Array<{ label: string; value: string }>;
  providerOptions: Array<{ label: string; value: string }>;
  selectedProvider?: ModelConfig;
  resolved: ReturnType<typeof resolvePortalDefaults>;
  loading: boolean;
  saving: boolean;
  recordingShortcut: boolean;
  onToggleShortcutRecording: () => void;
  setSettingsDraft: Dispatch<SetStateAction<AppSettings>>;
  onSave: () => void;
}

interface PortalMainAppSettingsProps {
  settingsDraft: AppSettings;
  loading: boolean;
  saving: boolean;
  recordingShortcut: boolean;
  onToggleShortcutRecording: () => void;
  setSettingsDraft: Dispatch<SetStateAction<AppSettings>>;
  onSave: () => void;
}

type PortalSubTab = "quickAsk" | "mainApp";
type ShortcutRecordingTarget = "quickAsk" | "mainApp";

const portalSubTabs: Array<{
  id: PortalSubTab;
  label: string;
}> = [
  {
    id: "quickAsk",
    label: "Quick Ask",
  },
  {
    id: "mainApp",
    label: "Main App",
  },
];

const defaultSettings: AppSettings = {
  gitCommand: "git",
  mainWindowShortcut: DEFAULT_MAIN_WINDOW_SHORTCUT,
  portalShortcut: DEFAULT_PORTAL_SHORTCUT,
  portalReasoningEffort: DEFAULT_PORTAL_REASONING_EFFORT,
};

const reasoningOptions = [
  { label: "Minimal", value: "minimal" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "XHigh", value: "xhigh" },
];

export default function PortalPage({ pushActivity }: PortalPageProps) {
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>(defaultSettings);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recordingShortcutTarget, setRecordingShortcutTarget] = useState<ShortcutRecordingTarget>();
  const [portalSubTab, setPortalSubTab] = useState<PortalSubTab>("quickAsk");
  const [notice, setNotice] = useState<NoticeState>();

  const selectedProvider = useMemo(
    () => models.find((model) => model.id === settingsDraft.portalDefaultProviderId),
    [models, settingsDraft.portalDefaultProviderId],
  );
  const providerOptions = useMemo(
    () => [
      { label: "自动选择第一个可用 Provider", value: "" },
      ...models.map((model) => ({ label: model.displayName, value: model.id })),
    ],
    [models],
  );
  const workspaceOptions = useMemo(
    () => [
      { label: "自动选择第一个 Workspace", value: "" },
      ...workspaces.map((workspace) => ({ label: workspace.name, value: workspace.id })),
    ],
    [workspaces],
  );
  const resolved = useMemo(
    () => resolvePortalDefaults(settingsDraft, models, workspaces),
    [models, settingsDraft, workspaces],
  );

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!recordingShortcutTarget) return undefined;

    function handleShortcutRecording(event: KeyboardEvent) {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setRecordingShortcutTarget(undefined);
        return;
      }

      const shortcut = formatElectronShortcutFromEvent(event);
      if (!shortcut) return;
      setSettingsDraft((draft) => (
        recordingShortcutTarget === "quickAsk"
          ? { ...draft, portalShortcut: shortcut }
          : { ...draft, mainWindowShortcut: shortcut }
      ));
      setRecordingShortcutTarget(undefined);
    }

    window.addEventListener("keydown", handleShortcutRecording, true);
    return () => window.removeEventListener("keydown", handleShortcutRecording, true);
  }, [recordingShortcutTarget]);

  function showNotice(next: NoticeState) {
    setNotice(next);
    window.setTimeout(() => setNotice(undefined), 4200);
  }

  async function loadData() {
    setLoading(true);
    try {
      const [nextSettings, nextModels, nextWorkspaces] = await Promise.all([
        desktopApi.getSettings(),
        desktopApi.modelProviderList(),
        desktopApi.workspaceList(),
      ]);
      setSettingsDraft({ ...defaultSettings, ...nextSettings });
      setModels(nextModels);
      setWorkspaces(nextWorkspaces);
    } catch (error) {
      showNotice({ tone: "danger", title: "Portal 配置读取失败", detail: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }

  async function savePortalSettings() {
    setSaving(true);
    try {
      const nextSettings: AppSettings = {
        ...settingsDraft,
        mainWindowShortcut: settingsDraft.mainWindowShortcut?.trim() || undefined,
        portalShortcut: settingsDraft.portalShortcut?.trim() || DEFAULT_PORTAL_SHORTCUT,
        portalDefaultWorkspaceId: settingsDraft.portalDefaultWorkspaceId || undefined,
        portalDefaultProviderId: settingsDraft.portalDefaultProviderId || undefined,
        portalDefaultModel: settingsDraft.portalDefaultProviderId
          ? settingsDraft.portalDefaultModel?.trim() || selectedProvider?.defaultModel
          : undefined,
        portalReasoningEffort: settingsDraft.portalReasoningEffort || DEFAULT_PORTAL_REASONING_EFFORT,
      };
      const shortcutRegistered = await desktopApi.saveSettings(nextSettings);
      setSettingsDraft(nextSettings);
      if (!shortcutRegistered) {
        pushActivity("保存 Portal 配置", "error", `${nextSettings.portalShortcut} 注册失败`);
        showNotice({
          tone: "warning",
          title: "快捷键注册失败",
          detail: "快捷键格式可能不受支持，或已被其他应用占用。",
        });
        return;
      }
      pushActivity("保存 Portal 配置", "success", nextSettings.portalShortcut);
      showNotice({ tone: "success", title: "Portal 配置已保存" });
    } catch (error) {
      showNotice({ tone: "danger", title: "Portal 配置保存失败", detail: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <WorkbenchPage
      className="is-settings-page"
      eyebrow="Settings"
      title="Portal"
      description="Portal 是桌面级入口的配置容器。每个子标签页管理自己独立的行为和默认值。"
    >
      {notice ? (
        <div className={`inline-alert is-${notice.tone === "danger" ? "warning" : notice.tone}`}>
          {notice.tone === "danger" ? <XCircle size={16} /> : <CheckCircle size={16} />}
          <div>
            <strong>{notice.title}</strong>
            {notice.detail ? <span>{notice.detail}</span> : null}
          </div>
        </div>
      ) : null}

      <div className="portal-sub-tabs" role="tablist" aria-label="Portal 功能">
        {portalSubTabs.map((tab) => (
          <button
            type="button"
            role="tab"
            aria-selected={portalSubTab === tab.id}
            className={`portal-sub-tab ${portalSubTab === tab.id ? "is-active" : ""}`}
            key={tab.id}
            onClick={() => setPortalSubTab(tab.id)}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {portalSubTab === "quickAsk" ? (
        <PortalQuickAskSettings
          settingsDraft={settingsDraft}
          models={models}
          workspaceOptions={workspaceOptions}
          providerOptions={providerOptions}
          selectedProvider={selectedProvider}
          resolved={resolved}
          loading={loading}
          saving={saving}
          recordingShortcut={recordingShortcutTarget === "quickAsk"}
          onToggleShortcutRecording={() => setRecordingShortcutTarget(
            recordingShortcutTarget === "quickAsk" ? undefined : "quickAsk",
          )}
          setSettingsDraft={setSettingsDraft}
          onSave={() => void savePortalSettings()}
        />
      ) : (
        <PortalMainAppSettings
          settingsDraft={settingsDraft}
          loading={loading}
          saving={saving}
          recordingShortcut={recordingShortcutTarget === "mainApp"}
          onToggleShortcutRecording={() => setRecordingShortcutTarget(
            recordingShortcutTarget === "mainApp" ? undefined : "mainApp",
          )}
          setSettingsDraft={setSettingsDraft}
          onSave={() => void savePortalSettings()}
        />
      )}
    </WorkbenchPage>
  );
}

function PortalQuickAskSettings({
  settingsDraft,
  models,
  workspaceOptions,
  providerOptions,
  selectedProvider,
  resolved,
  loading,
  saving,
  recordingShortcut,
  onToggleShortcutRecording,
  setSettingsDraft,
  onSave,
}: PortalQuickAskSettingsProps) {
  return (
    <div className="portal-child-panel" role="tabpanel" aria-label="Quick Ask">
      <WorkbenchSection
        title="唤起方式"
        description="设置 Quick Ask 胶囊的全局快捷键。可以手动输入，也可以点击录入后直接按下组合键。保存后会重新注册系统快捷键。"
      >
        <div className="model-form">
          <label className="field-stack">
            <span>快捷键</span>
            <div className={`shortcut-recorder ${recordingShortcut ? "is-recording" : ""}`}>
              <Input
                className="mono-input"
                value={recordingShortcut ? "请按下快捷键..." : settingsDraft.portalShortcut || ""}
                placeholder={DEFAULT_PORTAL_SHORTCUT}
                disabled={loading || recordingShortcut}
                onChange={(event) => setSettingsDraft((draft) => ({ ...draft, portalShortcut: event.target.value }))}
              />
              <Button
                type="button"
                variant={recordingShortcut ? "secondary" : "outline"}
                disabled={loading}
                onClick={onToggleShortcutRecording}
              >
                {recordingShortcut ? <XCircle size={14} /> : <RadioTower size={14} />}
                {recordingShortcut ? "取消录入" : "开始录入"}
              </Button>
            </div>
          </label>
          <p className="form-hint">
            {recordingShortcut
              ? "正在录入快捷键，按 Esc 取消。"
              : "Electron 快捷键格式示例：CommandOrControl+Shift+J、Alt+Space、CommandOrControl+Option+P。"}
          </p>
        </div>
      </WorkbenchSection>

      <WorkbenchSection
        title="快速问答默认值"
        description="Portal 发起的 Quick Ask 会使用这一组独立配置，不会影响新建 Session 的默认模型。"
      >
        <div className="model-form">
          <div className="two-col">
            <label className="field-stack">
              <span>默认 Workspace</span>
              <Select
                value={settingsDraft.portalDefaultWorkspaceId || ""}
                disabled={loading}
                onChange={(event) => setSettingsDraft((draft) => ({ ...draft, portalDefaultWorkspaceId: event.target.value || undefined }))}
                options={workspaceOptions}
              />
            </label>
            <label className="field-stack">
              <span>思考模式</span>
              <Select
                value={settingsDraft.portalReasoningEffort || DEFAULT_PORTAL_REASONING_EFFORT}
                disabled={loading}
                onChange={(event) => setSettingsDraft((draft) => ({ ...draft, portalReasoningEffort: event.target.value }))}
                options={reasoningOptions}
              />
            </label>
          </div>

          <div className="two-col">
            <label className="field-stack">
              <span>默认 Provider</span>
              <Select
                value={settingsDraft.portalDefaultProviderId || ""}
                disabled={loading}
                onChange={(event) => {
                  const providerId = event.target.value || undefined;
                  const provider = models.find((model) => model.id === providerId);
                  setSettingsDraft((draft) => ({
                    ...draft,
                    portalDefaultProviderId: providerId,
                    portalDefaultModel: provider?.defaultModel,
                  }));
                }}
                options={providerOptions}
              />
            </label>
            <label className="field-stack">
              <span>默认模型</span>
              <Input
                className="mono-input"
                value={settingsDraft.portalDefaultModel || ""}
                list="portal-model-options"
                placeholder={selectedProvider?.defaultModel || resolved.model || "自动选择"}
                disabled={loading || !settingsDraft.portalDefaultProviderId}
                onChange={(event) => setSettingsDraft((draft) => ({ ...draft, portalDefaultModel: event.target.value }))}
              />
              <datalist id="portal-model-options">
                {modelOptionsForProvider(selectedProvider).map((option) => (
                  <option key={option.value} value={option.value} />
                ))}
              </datalist>
            </label>
          </div>
        </div>
        <p className="form-hint">
          当前解析结果：
          <Badge tone="default"><Sparkles size={12} /> {resolved.model || "未选择模型"}</Badge>
          <Badge tone="default"><Keyboard size={12} /> {resolved.shortcut}</Badge>
        </p>
      </WorkbenchSection>

      <div className="portal-child-actions">
        <Button type="button" disabled={saving} onClick={onSave}>
          <Save size={15} /> {saving ? "保存中..." : "保存"}
        </Button>
      </div>
    </div>
  );
}

function PortalMainAppSettings({
  settingsDraft,
  loading,
  saving,
  recordingShortcut,
  onToggleShortcutRecording,
  setSettingsDraft,
  onSave,
}: PortalMainAppSettingsProps) {
  return (
    <div className="portal-child-panel" role="tabpanel" aria-label="Main App">
      <WorkbenchSection
        title="主应用快捷键"
        description="设置显示/隐藏主应用窗口的全局快捷键。保存后可以替代 Raycast 唤起主窗口。"
      >
        <div className="model-form">
          <label className="field-stack">
            <span>显示/隐藏主应用</span>
            <div className={`shortcut-recorder ${recordingShortcut ? "is-recording" : ""}`}>
              <Input
                className="mono-input"
                value={recordingShortcut ? "请按下快捷键..." : settingsDraft.mainWindowShortcut || ""}
                placeholder="Alt+A"
                disabled={loading || recordingShortcut}
                onChange={(event) => setSettingsDraft((draft) => ({ ...draft, mainWindowShortcut: event.target.value }))}
              />
              <Button
                type="button"
                variant={recordingShortcut ? "secondary" : "outline"}
                disabled={loading}
                onClick={onToggleShortcutRecording}
              >
                {recordingShortcut ? <XCircle size={14} /> : <RadioTower size={14} />}
                {recordingShortcut ? "取消录入" : "开始录入"}
              </Button>
            </div>
          </label>
          <p className="form-hint">
            {recordingShortcut
              ? "正在录入快捷键，按 Esc 取消。"
              : "留空表示不注册主应用快捷键。Electron 快捷键格式示例：Alt+A、CommandOrControl+Alt+A。"}
          </p>
        </div>
      </WorkbenchSection>

      <div className="portal-child-actions">
        <Button type="button" disabled={saving} onClick={onSave}>
          <Save size={15} /> {saving ? "保存中..." : "保存"}
        </Button>
      </div>
    </div>
  );
}
