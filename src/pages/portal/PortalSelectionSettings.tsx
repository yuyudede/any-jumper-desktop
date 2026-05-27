import { AlertTriangle, GripVertical, RadioTower, RotateCcw, Save, XCircle } from "lucide-react";
import { useMemo, type Dispatch, type SetStateAction } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { WorkbenchSection } from "../../components/Workbench";
import type { AppSettings, ModelConfig } from "../../types";
import { modelOptionsForProvider } from "../../utils/modelProviders";
import {
  DEFAULT_SELECTION_ACTIONS,
  DEFAULT_SELECTION_REASONING_EFFORT,
  DEFAULT_SELECTION_SHORTCUT,
  normalizeSelectionActions,
  selectionTemplateWarning,
} from "../../utils/selectionActions";

interface PortalSelectionSettingsProps {
  settingsDraft: AppSettings;
  models: ModelConfig[];
  providerOptions: Array<{ label: string; value: string }>;
  selectedProvider?: ModelConfig;
  loading: boolean;
  saving: boolean;
  recordingShortcut: boolean;
  onToggleShortcutRecording: () => void;
  setSettingsDraft: Dispatch<SetStateAction<AppSettings>>;
  onSave: () => void;
}

const reasoningOptions = [
  { label: "Minimal", value: "minimal" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "XHigh", value: "xhigh" },
];

export default function PortalSelectionSettings({
  settingsDraft,
  models,
  providerOptions,
  selectedProvider,
  loading,
  saving,
  recordingShortcut,
  onToggleShortcutRecording,
  setSettingsDraft,
  onSave,
}: PortalSelectionSettingsProps) {
  const actions = useMemo(
    () => normalizeSelectionActions(settingsDraft.selectionActions),
    [settingsDraft.selectionActions],
  );

  function updateAction(id: string, update: Partial<(typeof actions)[number]>) {
    setSettingsDraft((draft) => ({
      ...draft,
      selectionActions: actions.map((action) => action.id === id ? { ...action, ...update } : action),
    }));
  }

  function moveAction(id: string, direction: -1 | 1) {
    const index = actions.findIndex((action) => action.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= actions.length) return;
    const next = [...actions];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    setSettingsDraft((draft) => ({
      ...draft,
      selectionActions: next.map((action, order) => ({ ...action, order: order + 1 })),
    }));
  }

  return (
    <div className="portal-child-panel selection-settings-panel" role="tabpanel" aria-label="Selection">
      <WorkbenchSection
        title="全局唤起"
        description="设置 Selection 的全局快捷键。触发后会读取当前选中的文字，并先展示 Liquid Glass 动作条。"
      >
        <div className="model-form">
          <label className="field-stack">
            <span>快捷键</span>
            <div className={`shortcut-recorder ${recordingShortcut ? "is-recording" : ""}`}>
              <Input
                className="mono-input"
                value={recordingShortcut ? "请按下快捷键..." : settingsDraft.selectionShortcut || ""}
                placeholder={DEFAULT_SELECTION_SHORTCUT}
                disabled={loading || recordingShortcut}
                onChange={(event) => setSettingsDraft((draft) => ({ ...draft, selectionShortcut: event.target.value }))}
              />
              <Button type="button" variant={recordingShortcut ? "secondary" : "outline"} disabled={loading} onClick={onToggleShortcutRecording}>
                {recordingShortcut ? <XCircle size={14} /> : <RadioTower size={14} />}
                {recordingShortcut ? "取消录入" : "开始录入"}
              </Button>
            </div>
          </label>
          <p className="form-hint">建议使用不与 Portal Quick Ask 冲突的快捷键，例如 CommandOrControl+Shift+S。</p>
        </div>
      </WorkbenchSection>

      <WorkbenchSection title="模型默认值" description="Selection 直接调用模型，不自动创建会话。">
        <div className="model-form">
          <div className="two-col">
            <label className="field-stack">
              <span>默认 Provider</span>
              <Select
                value={settingsDraft.selectionDefaultProviderId || ""}
                disabled={loading}
                onChange={(event) => {
                  const providerId = event.target.value || undefined;
                  const provider = models.find((model) => model.id === providerId);
                  setSettingsDraft((draft) => ({
                    ...draft,
                    selectionDefaultProviderId: providerId,
                    selectionDefaultModel: provider?.defaultModel,
                  }));
                }}
                options={providerOptions}
              />
            </label>
            <label className="field-stack">
              <span>思考模式</span>
              <Select
                value={settingsDraft.selectionReasoningEffort || DEFAULT_SELECTION_REASONING_EFFORT}
                disabled={loading}
                onChange={(event) => setSettingsDraft((draft) => ({ ...draft, selectionReasoningEffort: event.target.value }))}
                options={reasoningOptions}
              />
            </label>
          </div>
          <label className="field-stack">
            <span>默认模型</span>
            <Input
              className="mono-input"
              value={settingsDraft.selectionDefaultModel || ""}
              list="selection-model-options"
              placeholder={selectedProvider?.defaultModel || "自动选择"}
              disabled={loading || !settingsDraft.selectionDefaultProviderId}
              onChange={(event) => setSettingsDraft((draft) => ({ ...draft, selectionDefaultModel: event.target.value }))}
            />
            <datalist id="selection-model-options">
              {modelOptionsForProvider(selectedProvider).map((option) => (
                <option key={option.value} value={option.value} />
              ))}
            </datalist>
          </label>
        </div>
      </WorkbenchSection>

      <WorkbenchSection title="动作模板" description="短名建议使用两个汉字。Prompt 模板使用 {{selection}} 插入选中文字。">
        <div className="selection-action-list">
          {actions.map((action, index) => {
            const warning = selectionTemplateWarning(action.promptTemplate);
            return (
              <div className="selection-action-editor selection-action-card" key={action.id}>
                <div className="selection-action-editor-head">
                  <GripVertical size={14} />
                  <Badge tone={action.enabled ? "success" : "muted"}>{action.enabled ? "启用" : "停用"}</Badge>
                  {warning ? <Badge tone="warning"><AlertTriangle size={12} /> 模板提示</Badge> : null}
                  <div className="selection-action-order">
                    <Button type="button" variant="outline" size="sm" disabled={index === 0} onClick={() => moveAction(action.id, -1)}>上移</Button>
                    <Button type="button" variant="outline" size="sm" disabled={index === actions.length - 1} onClick={() => moveAction(action.id, 1)}>下移</Button>
                  </div>
                </div>
                <div className="two-col">
                  <label className="field-stack">
                    <span>短名</span>
                    <Input value={action.label} maxLength={4} onChange={(event) => updateAction(action.id, { label: event.target.value })} />
                  </label>
                  <label className="field-stack">
                    <span>描述</span>
                    <Input value={action.description} onChange={(event) => updateAction(action.id, { description: event.target.value })} />
                  </label>
                </div>
                <label className="field-stack">
                  <span>Prompt 模板</span>
                  <Textarea value={action.promptTemplate} onChange={(event) => updateAction(action.id, { promptTemplate: event.target.value })} />
                  {warning ? <span className="form-hint">{warning}</span> : null}
                </label>
                <label className="settings-checks">
                  <input type="checkbox" checked={action.enabled} onChange={(event) => updateAction(action.id, { enabled: event.target.checked })} />
                  <span>在 Selection 动作条中显示</span>
                </label>
              </div>
            );
          })}
        </div>
      </WorkbenchSection>

      <div className="portal-child-actions">
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={() => setSettingsDraft((draft) => ({ ...draft, selectionActions: DEFAULT_SELECTION_ACTIONS }))}
        >
          <RotateCcw size={15} /> 恢复默认动作
        </Button>
        <Button type="button" disabled={saving} onClick={onSave}>
          <Save size={15} /> {saving ? "保存中..." : "保存"}
        </Button>
      </div>
    </div>
  );
}
