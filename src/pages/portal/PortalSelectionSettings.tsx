import { AlertTriangle, ChevronDown, ChevronUp, GripVertical, Plus, RadioTower, RotateCcw, Save, XCircle } from "lucide-react";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
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

function compactPromptPreview(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 96) return normalized;
  return `${normalized.slice(0, 96)}...`;
}

function nextCustomActionId(actions: Array<{ id: string }>) {
  const ids = new Set(actions.map((action) => action.id));
  let index = actions.length + 1;
  let id = `selection-custom-${index}`;
  while (ids.has(id)) {
    index += 1;
    id = `selection-custom-${index}`;
  }
  return id;
}

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
  const [selectedActionId, setSelectedActionId] = useState("");
  const actions = useMemo(
    () => normalizeSelectionActions(settingsDraft.selectionActions),
    [settingsDraft.selectionActions],
  );
  const selectedAction = actions.find((action) => action.id === selectedActionId) || actions[0];

  useEffect(() => {
    if (!actions.length) {
      if (selectedActionId) setSelectedActionId("");
      return;
    }
    if (!actions.some((action) => action.id === selectedActionId)) {
      setSelectedActionId(actions[0].id);
    }
  }, [actions, selectedActionId]);

  function updateAction(id: string, update: Partial<(typeof actions)[number]>) {
    setSettingsDraft((draft) => ({
      ...draft,
      selectionActions: actions.map((action) => action.id === id ? { ...action, ...update } : action),
    }));
  }

  function addAction() {
    const id = nextCustomActionId(actions);
    setSettingsDraft((draft) => ({
      ...draft,
      selectionActions: [
        ...actions,
        {
          id,
          label: "新建",
          description: "自定义动作",
          promptTemplate: "请处理下面这段内容：\n\n{{selection}}",
          enabled: true,
          order: actions.length + 1,
        },
      ],
    }));
    setSelectedActionId(id);
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
          <div className="selection-template-toolbar">
            <div>
              <strong>动作列表</strong>
              <span>点击一行动作后，在下方编辑内容。</span>
            </div>
            <Button type="button" variant="outline" disabled={loading} onClick={addAction}>
              <Plus size={15} /> 新增动作
            </Button>
          </div>
          <div className="selection-template-table" role="table" aria-label="Selection 动作模板">
            <div className="selection-template-table-head" role="row">
              <span className="selection-template-cell" />
              <span className="selection-template-cell">状态</span>
              <span className="selection-template-cell">短名</span>
              <span className="selection-template-cell">描述</span>
              <span className="selection-template-cell">Prompt 预览</span>
              <span className="selection-template-cell">显示</span>
              <span className="selection-template-cell">排序</span>
            </div>
            {actions.map((action, index) => {
              const warning = selectionTemplateWarning(action.promptTemplate);
              const isSelected = action.id === selectedAction?.id;
              return (
                <div
                  className={`selection-template-row ${isSelected ? "is-selected" : ""}`}
                  key={action.id}
                  role="row"
                  tabIndex={0}
                  onClick={() => setSelectedActionId(action.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedActionId(action.id);
                    }
                  }}
                >
                  <span className="selection-template-cell selection-template-grip"><GripVertical size={14} /></span>
                  <span className="selection-template-cell">
                    <Badge tone={action.enabled ? "success" : "muted"}>{action.enabled ? "启用" : "停用"}</Badge>
                  </span>
                  <span className="selection-template-cell selection-template-name">{action.label}</span>
                  <span className="selection-template-cell selection-template-description">{action.description}</span>
                  <span className="selection-template-cell selection-template-preview">
                    {warning ? <AlertTriangle size={13} /> : null}
                    <span>{compactPromptPreview(action.promptTemplate)}</span>
                  </span>
                  <span className="selection-template-cell selection-template-visible">
                    <input
                      type="checkbox"
                      checked={action.enabled}
                      aria-label={`${action.label} 是否显示在 Selection 动作条中`}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => updateAction(action.id, { enabled: event.target.checked })}
                    />
                  </span>
                  <span className="selection-template-cell selection-template-order">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={index === 0}
                      aria-label={`${action.label} 上移`}
                      onClick={(event) => {
                        event.stopPropagation();
                        moveAction(action.id, -1);
                      }}
                    >
                      <ChevronUp size={15} />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={index === actions.length - 1}
                      aria-label={`${action.label} 下移`}
                      onClick={(event) => {
                        event.stopPropagation();
                        moveAction(action.id, 1);
                      }}
                    >
                      <ChevronDown size={15} />
                    </Button>
                  </span>
                </div>
              );
            })}
          </div>

          {selectedAction ? (
            <div className="selection-template-edit-panel">
              <div className="selection-template-edit-head">
                <div>
                  <span>正在编辑</span>
                  <strong>{selectedAction.label}</strong>
                </div>
                <Badge tone={selectedAction.enabled ? "success" : "muted"}>{selectedAction.enabled ? "启用" : "停用"}</Badge>
                {selectionTemplateWarning(selectedAction.promptTemplate) ? (
                  <Badge tone="warning"><AlertTriangle size={12} /> 模板提示</Badge>
                ) : null}
              </div>
              <div className="selection-template-edit-grid">
                <label className="field-stack">
                  <span>短名</span>
                  <Input
                    value={selectedAction.label}
                    maxLength={4}
                    onChange={(event) => updateAction(selectedAction.id, { label: event.target.value })}
                  />
                </label>
                <label className="field-stack">
                  <span>描述</span>
                  <Input
                    value={selectedAction.description}
                    onChange={(event) => updateAction(selectedAction.id, { description: event.target.value })}
                  />
                </label>
                <label className="field-stack selection-template-prompt-field">
                  <span>Prompt 模板</span>
                  <Textarea
                    value={selectedAction.promptTemplate}
                    onChange={(event) => updateAction(selectedAction.id, { promptTemplate: event.target.value })}
                  />
                  {selectionTemplateWarning(selectedAction.promptTemplate) ? (
                    <span className="form-hint">{selectionTemplateWarning(selectedAction.promptTemplate)}</span>
                  ) : null}
                </label>
                <label className="settings-checks selection-template-edit-toggle">
                  <input
                    type="checkbox"
                    checked={selectedAction.enabled}
                    onChange={(event) => updateAction(selectedAction.id, { enabled: event.target.checked })}
                  />
                  <span>在 Selection 动作条中显示</span>
                </label>
              </div>
            </div>
          ) : null}
        </div>
      </WorkbenchSection>

      <div className="portal-child-actions">
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={() => {
            setSettingsDraft((draft) => ({ ...draft, selectionActions: DEFAULT_SELECTION_ACTIONS }));
            setSelectedActionId(DEFAULT_SELECTION_ACTIONS[0]?.id ?? "");
          }}
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
