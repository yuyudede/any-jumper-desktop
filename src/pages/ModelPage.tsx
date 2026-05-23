import {
  CheckCircle,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Wand2,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { WorkbenchPage, WorkbenchSection } from "../components/Workbench";
import { desktopApi, errorDetail, errorMessage } from "../services/desktopApi";
import type { ActivityItem, AppSettings, ModelConfig, ModelConfigRequest } from "../types";
import {
  activeProviderKeyLabel,
  modelOptionsForProvider,
  newOpenAiProviderDraft,
  normalizeModelNames,
  toModelRequest,
} from "../utils/modelProviders";

interface ModelPageProps {
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

const providerKindOptions = [
  { label: "OpenAI Compatible", value: "openai-compatible" },
  { label: "Anthropic", value: "anthropic" },
  { label: "Anthropic Compatible", value: "anthropic-compatible" },
  { label: "Ollama", value: "ollama" },
  { label: "Mock", value: "mock" },
];

const defaultSettings: AppSettings = {
  gitCommand: "git",
};

export default function ModelPage({ pushActivity }: ModelPageProps) {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<string>();
  const [modelDraft, setModelDraft] = useState<ModelConfigRequest>(newOpenAiProviderDraft());
  const [modelApiKey, setModelApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [deletingProvider, setDeletingProvider] = useState<string>();
  const [deleteTarget, setDeleteTarget] = useState<ModelConfig>();
  const [notice, setNotice] = useState<NoticeState>();
  const [settingsDraft, setSettingsDraft] = useState<AppSettings>(defaultSettings);
  const [savingSessionDefaults, setSavingSessionDefaults] = useState(false);

  const currentProvider = useMemo(
    () => models.find((model) => model.id === modelDraft.id),
    [modelDraft.id, models],
  );
  const providerOptions = useMemo(
    () => models.map((model) => ({ label: model.displayName, value: model.id })),
    [models],
  );
  const newSessionProviderOptions = useMemo(
    () => [
      { label: "跟随工作区默认", value: "" },
      ...providerOptions,
    ],
    [providerOptions],
  );
  const selectedNewSessionProvider = useMemo(
    () => models.find((model) => model.id === settingsDraft.defaultNewSessionProviderId),
    [models, settingsDraft.defaultNewSessionProviderId],
  );

  useEffect(() => {
    void loadModels();
    void loadSettings();
  }, []);

  function showNotice(next: NoticeState) {
    setNotice(next);
    window.setTimeout(() => setNotice(undefined), 4200);
  }

  async function loadModels(nextSelectedProvider?: string) {
    setLoading(true);
    try {
      const list = await desktopApi.modelProviderList();
      setModels(list);
      const next =
        list.find((model) => model.id === nextSelectedProvider) ||
        list.find((model) => model.id === selectedProvider) ||
        list[0];
      if (next) {
        selectProvider(next);
      }
    } catch (error) {
      showNotice({ tone: "danger", title: "模型配置读取失败", detail: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }

  async function loadSettings() {
    try {
      setSettingsDraft({ ...defaultSettings, ...await desktopApi.getSettings() });
    } catch (error) {
      showNotice({ tone: "danger", title: "默认设置读取失败", detail: errorMessage(error) });
    }
  }

  function selectProvider(model: ModelConfig) {
    setSelectedProvider(model.id);
    setModelDraft(toModelRequest(model));
    setModelApiKey("");
  }

  function createProviderDraft() {
    setSelectedProvider(undefined);
    setModelDraft(newOpenAiProviderDraft());
    setModelApiKey("");
  }

  function buildModelProviderRequest(): ModelConfigRequest | undefined {
    if (!modelDraft.displayName.trim() || !modelDraft.defaultModel.trim()) {
      showNotice({ tone: "warning", title: "Provider 名称和默认模型不能为空" });
      return undefined;
    }
    return {
      ...modelDraft,
      displayName: modelDraft.displayName.trim(),
      baseUrl: modelDraft.baseUrl.trim(),
      defaultModel: modelDraft.defaultModel.trim(),
      models: normalizeModelNames([modelDraft.defaultModel, ...(modelDraft.models || [])]),
      enabled: true,
      apiKey: modelApiKey.trim() ? modelApiKey.trim() : undefined,
    };
  }

  async function persistModelProvider() {
    const request = buildModelProviderRequest();
    if (!request) return undefined;
    const saved = await desktopApi.modelProviderSave(request);
    setSelectedProvider(saved.id);
    setModelDraft(toModelRequest(saved));
    setModelApiKey("");
    return saved;
  }

  async function saveModelProvider() {
    setSaving(true);
    try {
      const saved = await persistModelProvider();
      if (!saved) return;
      await loadModels(saved.id);
      pushActivity("保存模型配置", "success", saved.displayName);
      showNotice({ tone: "success", title: "模型配置已保存" });
    } catch (error) {
      pushActivity("保存模型配置失败", "error", errorDetail(error) || errorMessage(error));
      showNotice({ tone: "danger", title: "保存失败", detail: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function testModelProvider() {
    setSaving(true);
    try {
      const saved = await persistModelProvider();
      if (!saved) return;
      const result = await desktopApi.modelProviderTest(saved.id);
      showNotice({ tone: "success", title: "测试成功", detail: result });
    } catch (error) {
      showNotice({ tone: "danger", title: "测试失败", detail: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function fetchModels() {
    setFetchingModels(true);
    try {
      const saved = await persistModelProvider();
      if (!saved) return;
      const nextModels = await desktopApi.modelProviderModels(saved.id);
      if (nextModels.length === 0) {
        showNotice({ tone: "muted", title: "未发现可用模型" });
        return;
      }
      setModelDraft((draft) => ({
        ...draft,
        defaultModel: nextModels.includes(draft.defaultModel) ? draft.defaultModel : nextModels[0],
        models: nextModels,
      }));
      showNotice({ tone: "success", title: `已拉取 ${nextModels.length} 个模型`, detail: "保存后生效" });
    } catch (error) {
      showNotice({ tone: "danger", title: "拉取模型失败", detail: errorMessage(error) });
    } finally {
      setFetchingModels(false);
    }
  }

  function requestDeleteModelProvider(provider: ModelConfig) {
    if (provider.id === "mock") {
      showNotice({ tone: "warning", title: "Mock Agent 是默认兜底 Provider，不能删除" });
      return;
    }
    setDeleteTarget(provider);
  }

  async function saveNewSessionDefaults() {
    setSavingSessionDefaults(true);
    try {
      const providerId = selectedNewSessionProvider?.id;
      const nextSettings: AppSettings = {
        ...settingsDraft,
        defaultNewSessionProviderId: providerId,
        defaultNewSessionModel: providerId
          ? settingsDraft.defaultNewSessionModel?.trim() || selectedNewSessionProvider?.defaultModel
          : undefined,
      };
      await desktopApi.saveSettings(nextSettings);
      setSettingsDraft(nextSettings);
      pushActivity("保存新会话默认模型", "success", nextSettings.defaultNewSessionModel || "跟随工作区默认");
      showNotice({ tone: "success", title: "新会话默认模型已保存" });
    } catch (error) {
      showNotice({ tone: "danger", title: "保存默认模型失败", detail: errorMessage(error) });
    } finally {
      setSavingSessionDefaults(false);
    }
  }

  async function deleteModelProvider() {
    if (!deleteTarget) return;
    setDeletingProvider(deleteTarget.id);
    try {
      await desktopApi.modelProviderDelete(deleteTarget.id);
      const remaining = models.filter((model) => model.id !== deleteTarget.id);
      setModels(remaining);
      if (deleteTarget.id === selectedProvider) {
        const next = remaining[0];
        if (next) selectProvider(next);
        else createProviderDraft();
      }
      pushActivity("删除模型配置", "success", deleteTarget.displayName);
      showNotice({ tone: "success", title: "Provider 已删除" });
      setDeleteTarget(undefined);
    } catch (error) {
      pushActivity("删除模型配置失败", "error", errorDetail(error) || errorMessage(error));
      showNotice({ tone: "danger", title: "删除失败", detail: errorMessage(error) });
    } finally {
      setDeletingProvider(undefined);
    }
  }

  return (
    <WorkbenchPage
      className="is-settings-page"
      eyebrow="Provider 管理"
      title="模型配置"
      description="配置 Agent 会话可用的 Provider、默认模型和 API Key。保存后会立即用于新的会话。"
      actions={
        <>
          <Button type="button" variant="outline" onClick={createProviderDraft}>
            <Plus size={15} /> 新增 Provider
          </Button>
          <Button type="button" variant="outline" disabled={fetchingModels} onClick={fetchModels}>
            <RefreshCw className={fetchingModels ? "is-spinning" : ""} size={15} /> 拉取模型
          </Button>
          <Button type="button" variant="outline" disabled={saving} onClick={testModelProvider}>
            <Wand2 size={15} /> 测试
          </Button>
          <Button type="button" disabled={saving} onClick={saveModelProvider}>
            <Save size={15} /> {saving ? "保存中..." : "保存"}
          </Button>
        </>
      }
      contextItems={[
        { label: "当前 Provider", value: modelDraft.displayName || "未命名", status: currentProvider ? "success" : "neutral" },
        { label: "类型", value: modelDraft.providerKind },
        { label: "默认模型", value: modelDraft.defaultModel || "未选择" },
        {
          label: "Key 状态",
          value: modelDraft.providerKind === "mock" || modelDraft.providerKind === "ollama" || currentProvider?.hasApiKey || modelApiKey ? "可用" : "缺少 Key",
          status: modelDraft.providerKind === "mock" || modelDraft.providerKind === "ollama" || currentProvider?.hasApiKey || modelApiKey ? "success" : "error",
        },
      ]}
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

      <WorkbenchSection
        title="新会话默认模型"
        description="新建 Session 时优先使用这里选择的 Provider 和模型；未配置时跟随当前工作区默认值。"
        actions={
          <Button type="button" variant="outline" disabled={savingSessionDefaults} onClick={() => void saveNewSessionDefaults()}>
            <Save size={15} /> {savingSessionDefaults ? "保存中..." : "保存默认"}
          </Button>
        }
      >
        <div className="model-form">
          <div className="two-col">
            <label className="field-stack">
              <span>Provider</span>
              <Select
                value={settingsDraft.defaultNewSessionProviderId || ""}
                placeholder={loading ? "加载中..." : "跟随工作区默认"}
                disabled={loading}
                onChange={(event) => {
                  const providerId = event.target.value || undefined;
                  const provider = models.find((model) => model.id === providerId);
                  setSettingsDraft((draft) => ({
                    ...draft,
                    defaultNewSessionProviderId: providerId,
                    defaultNewSessionModel: provider?.defaultModel,
                  }));
                }}
                options={newSessionProviderOptions}
              />
            </label>
            <label className="field-stack">
              <span>新会话模型</span>
              <Input
                className="mono-input"
                value={settingsDraft.defaultNewSessionModel || ""}
                list="new-session-model-options"
                placeholder={selectedNewSessionProvider?.defaultModel || "跟随工作区默认"}
                disabled={!settingsDraft.defaultNewSessionProviderId}
                onChange={(event) => setSettingsDraft((draft) => ({ ...draft, defaultNewSessionModel: event.target.value }))}
              />
              <datalist id="new-session-model-options">
                {modelOptionsForProvider(selectedNewSessionProvider).map((option) => (
                  <option key={option.value} value={option.value} />
                ))}
              </datalist>
            </label>
          </div>
        </div>
        <p className="form-hint">这个配置只影响新建 Session；已有会话仍使用自己的模型设置。</p>
      </WorkbenchSection>

      <WorkbenchSection
        title="Provider 配置"
        description="编辑名称、协议类型、Base URL、模型列表和凭据。"
        actions={
          <Select
            className="provider-switch-select"
            value={selectedProvider || ""}
            placeholder={loading ? "加载中..." : "选择 Provider"}
            disabled={loading || models.length === 0}
            onChange={(event) => {
              const next = models.find((model) => model.id === event.target.value);
              if (next) selectProvider(next);
            }}
            options={providerOptions}
          />
        }
      >
        <div className="model-form">
          <div className="two-col">
            <label className="field-stack">
              <span>名称</span>
              <Input
                value={modelDraft.displayName}
                onChange={(event) => setModelDraft((draft) => ({ ...draft, displayName: event.target.value }))}
              />
            </label>
            <label className="field-stack">
              <span>类型</span>
              <Select
                value={modelDraft.providerKind}
                onChange={(event) => setModelDraft((draft) => ({ ...draft, providerKind: event.target.value }))}
                options={providerKindOptions}
              />
            </label>
          </div>

          <label className="field-stack">
            <span>Base URL</span>
            <Input
              className="mono-input"
              value={modelDraft.baseUrl}
              placeholder="https://api.openai.com/v1"
              onChange={(event) => setModelDraft((draft) => ({ ...draft, baseUrl: event.target.value }))}
            />
          </label>

          <label className="field-stack">
            <span>默认模型</span>
            <Input
              className="mono-input"
              value={modelDraft.defaultModel}
              list="model-options"
              placeholder="gpt-4.1-mini"
              onChange={(event) => setModelDraft((draft) => ({ ...draft, defaultModel: event.target.value }))}
            />
            <datalist id="model-options">
              {modelOptionsForProvider(modelDraft).map((option) => (
                <option key={option.value} value={option.value} />
              ))}
            </datalist>
          </label>

          <label className="field-stack">
            <span>模型列表</span>
            <Textarea
              className="mono-input"
              rows={5}
              value={(modelDraft.models || []).join("\n")}
              placeholder="每行一个模型名，也支持逗号分隔"
              onChange={(event) => setModelDraft((draft) => ({ ...draft, models: splitModelNames(event.target.value) }))}
            />
          </label>

          <label className="field-stack">
            <span>{activeProviderKeyLabel(modelDraft)}</span>
            <Input
              type="password"
              value={modelApiKey}
              placeholder={modelDraft.id && currentProvider?.hasApiKey ? "已保存，输入新 Key 可覆盖" : "输入 API Key"}
              onChange={(event) => setModelApiKey(event.target.value)}
            />
          </label>
        </div>
        <p className="form-hint">留空 API Key 不会覆盖已保存的 Key；Ollama 通常只需要 Base URL。</p>
      </WorkbenchSection>

      <WorkbenchSection title="Provider 列表" description={`${models.length} 个 Provider，点击行可切换编辑。`}>
        <div className="provider-table">
          <div className="provider-table-head">
            <span>名称</span>
            <span>类型</span>
            <span>默认模型</span>
            <span>Base URL</span>
            <span>操作</span>
          </div>
          {models.length === 0 ? (
            <div className="mini-empty">暂无 Provider</div>
          ) : (
            models.map((provider) => (
              <button
                className={`provider-row ${provider.id === selectedProvider ? "is-active" : ""}`}
                key={provider.id}
                type="button"
                onClick={() => selectProvider(provider)}
              >
                <span className="provider-name-cell">
                  <strong>{provider.displayName}</strong>
                  {providerConfigBadge(provider)}
                </span>
                <span>{provider.providerKind}</span>
                <code>{provider.defaultModel}</code>
                <code>{provider.baseUrl}</code>
                <span className="provider-row-actions" onClick={(event) => event.stopPropagation()}>
                  <Button
                    aria-label={`删除 ${provider.displayName}`}
                    type="button"
                    variant="destructive"
                    size="icon"
                    disabled={provider.id === "mock" || deletingProvider === provider.id}
                    onClick={() => requestDeleteModelProvider(provider)}
                  >
                    <Trash2 size={15} />
                  </Button>
                </span>
              </button>
            ))
          )}
        </div>
      </WorkbenchSection>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除 {deleteTarget?.displayName}？</DialogTitle>
            <DialogDescription>
              删除后会移除该 Provider 的 API Key；已使用它的工作区和会话会回落到 Mock Agent。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDeleteTarget(undefined)}>取消</Button>
            <Button type="button" variant="destructive" disabled={Boolean(deletingProvider)} onClick={() => void deleteModelProvider()}>
              {deletingProvider ? "删除中..." : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </WorkbenchPage>
  );
}

function providerConfigBadge(provider: ModelConfig) {
  if (provider.providerKind === "mock") return <Badge tone="success">内置</Badge>;
  if (provider.providerKind === "ollama") return <Badge tone="success">本地</Badge>;
  if (provider.hasApiKey) return <Badge tone="default">已配置 Key</Badge>;
  return <Badge tone="warning">未配置 Key</Badge>;
}

function splitModelNames(value: string) {
  return normalizeModelNames(value.split(/[,\n]/));
}
