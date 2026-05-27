# Selection 全局选区动作设计

日期：2026-05-27

状态：已确认，待实现计划

## 背景

Any Jumper Desktop 已有 Portal 配置页、Portal Quick Ask 胶囊窗口、模型配置、全局快捷键注册和主进程安全桥接能力。Selection 是 Portal 下的新能力，用来处理用户在任意应用中选中的文字。

Selection 的产品定位是轻量即时工具：读取当前选区，执行用户配置的 AI Prompt 动作，并展示结果。第一版不替换原应用中的文字，不自动创建会话，也不污染 Session 列表。

## 目标

- 在任意应用选中文字后，通过全局快捷键唤起 Selection。
- 第一态只展示 Liquid Glass 动作条，保持低打扰。
- 用户选择动作后，动作条融化展开为 Balanced 结果弹窗。
- 动作由 Portal 的 Selection 子标签页配置，第一版只支持 AI Prompt 模板。
- 结果直接展示在 Selection 窗口内，支持复制、展开、查看原文。

## 非目标

- 不替换原应用中的选中文字。
- 不为每次 Selection 执行自动创建线程。
- 不为每个动作注册独立全局快捷键。
- 不支持 shell、URL、插件调用等复杂动作类型。
- 不强依赖精确选区坐标；拿不到选区位置时允许退回屏幕中心附近。

## Portal 配置入口

在主窗口 `Portal` 页面新增 `Selection` 子标签页，建议放在 `Quick Ask` 附近。

配置项：

- Selection 全局快捷键，默认建议 `CommandOrControl+Shift+S`。
- 默认 Workspace，可选；第一版模型直连不依赖线程，但保留后续打开完整会话的扩展空间。
- 默认 Provider。
- 默认 Model。
- Reasoning Effort。
- 动作列表。

动作列表支持：

- 启用或停用。
- 排序。
- 编辑短名。
- 编辑描述。
- 编辑 Prompt 模板。
- 恢复内置默认动作。

动作短名建议固定为两个汉字，运行窗口中的胶囊使用固定宽度，避免 UI 抖动。动作描述只在配置页展示。

## 内置动作

第一版内置 6 个动作：

| 短名 | 描述 | Prompt 意图 |
| --- | --- | --- |
| 解释 | 解释这段内容 | 说明含义、背景、重点 |
| 总结 | 提炼要点 | 输出简洁要点 |
| 翻译 | 翻译成中文 | 保留原意，翻译为自然中文 |
| 润色 | 改写得更清楚自然 | 优化表达，不改变含义 |
| 改短 | 压缩表达 | 缩短文本，保留核心信息 |
| 查错 | 找潜在问题 | 检查矛盾、错误、风险 |

Prompt 模板支持变量：

```text
{{selection}}
```

示例：

```text
请用简洁中文解释下面这段内容，必要时补充背景，但不要扩写过度：

{{selection}}
```

保存动作时如果模板不包含 `{{selection}}`，配置页给出 warning，但允许保存，便于高级用法。

## 运行流程

```text
用户在任意应用选中文字
→ 按 Selection 全局快捷键
→ Electron 主进程尝试读取当前选区文本
→ 打开 Selection 小窗口
→ 第一态展示 Liquid Glass 动作条
→ 用户点击动作
→ 动作条融化展开为 Balanced 结果弹窗
→ 主进程直接调用模型
→ 结果弹窗流式展示输出
```

主进程读取选区的 macOS 第一版方案：

1. 保存当前剪贴板文本内容。
2. 模拟 `Command+C`。
3. 短暂等待系统写入剪贴板。
4. 读取剪贴板文本作为 selectedText。
5. 尽量恢复原剪贴板文本。

如果读取失败或选区为空，仍打开 Selection 窗口，并展示无选区状态，允许用户手动粘贴或输入文本后执行动作。

## Selection 窗口

新增一个独立窗口，不复用 Portal Capsule。

窗口属性：

- `frame: false`
- `transparent: true`
- `alwaysOnTop: true`
- `skipTaskbar: true`
- `resizable: false` 或由主进程控制尺寸变化
- 默认围绕动作条尺寸展示
- 展开后调整为 Balanced 结果弹窗尺寸

位置策略：

- 优先出现在选区附近。
- 下方空间足够时显示在选区下方。
- 下方空间不足时显示在选区上方。
- 获取不到选区坐标时显示在当前屏幕中心附近。

关闭策略：

- `Esc` 关闭；展开态下可先收起结果区，再次 `Esc` 关闭。
- 非运行状态失焦可自动关闭。
- 运行中失焦不强制关闭，避免丢失输出；可延迟关闭或保持可见。

## UI 形态

### 第一态：Liquid Glass 动作条

动作条是 Selection 的默认出现形态。

视觉规格：

- 约 `296px × 44px`。
- 半透明玻璃材质。
- 背景模糊、饱和度提升、边缘高光、轻阴影。
- 有短小指针，表达与选区的空间关联。
- 弹出时从选区附近轻微上浮和缩放，约 `160ms`。
- 初次出现带一次克制的高光扫过。

动作条内容：

```text
解释 / 总结 / 翻译 / 润色 / 改短 / 查错
```

交互：

- 点击动作立即执行。
- 鼠标滚轮在动作条上转为横向滚动。
- Trackpad 左右滑动可滚动动作。
- 左右方向键切换动作。
- `Enter` 执行当前动作。
- 动作胶囊固定宽度，短名居中。

### 第二态：Balanced 结果弹窗

用户点击动作后，动作条融化展开为结果弹窗。

视觉规格：

- 约 `380px` 宽。
- 保留 Liquid Glass 材质，但比动作条更克制，保证文字可读性。
- 顶部为标题和状态。
- 第二行是动作胶囊行。
- 中间为结果区。
- 底部为原文字数和操作。

结构：

```text
Selection                         解释中

[解释] [总结] [翻译] [润色] [改短] ...

RESULT
模型流式输出...

原文 58 字                  复制 · 展开 · 原文
```

动效：

- 点击动作后，动作条短暂压下。
- 动作条通过 `scale + blur + opacity` 融化。
- 弹窗从动作条位置展开，约 `340-460ms`。
- 运行中结果区顶部显示细进度线。
- 首个输出到达前显示两到三行 skeleton。
- 结果完成后，`复制` 操作轻微高亮。
- `展开` 只扩展结果区，不跳转完整会话。

可访问性：

- 支持 `prefers-reduced-motion`，降级为淡入淡出和即时状态变化。
- 按钮有明确文本或 aria-label。
- 键盘焦点顺序遵循动作区、结果操作区。
- 文本对比度优先于玻璃透明度，深浅主题需要分别调试。

## 数据模型

扩展 `AppSettings`：

```ts
interface AppSettings {
  selectionShortcut?: string;
  selectionDefaultWorkspaceId?: string;
  selectionDefaultProviderId?: string;
  selectionDefaultModel?: string;
  selectionReasoningEffort?: string;
  selectionActions?: SelectionAction[];
}
```

新增类型：

```ts
interface SelectionAction {
  id: string;
  label: string;
  description: string;
  promptTemplate: string;
  enabled: boolean;
  order: number;
}
```

默认动作由工具函数补齐：

- 用户未配置动作时返回内置动作。
- 用户配置缺少新增内置动作时保留用户动作，并追加新增内置动作。
- 动作按 `order` 升序展示。
- 停用动作不出现在运行窗口中。

## IPC 与 API

Renderer `desktopApi` 增加：

```ts
selectionShortcutReregister(): Promise<boolean>;
selectionShow(): Promise<void>;
selectionHide(): Promise<void>;
selectionRunAction(request: SelectionRunRequest): Promise<SelectionRunResult>;
onSelectionEvent(handler: (event: SelectionEvent) => void): Promise<() => void>;
```

主进程新增命令：

```text
selection_shortcut_reregister
selection_window_show
selection_window_hide
selection_run_action
```

`selection_run_action` 输入：

```ts
interface SelectionRunRequest {
  actionId: string;
  selectedText: string;
  providerId?: string;
  model?: string;
  reasoningEffort?: string;
}

interface SelectionRunResult {
  runId: string;
  status: "started";
}
```

`selection_run_action` 行为：

- 渲染 Prompt 模板。
- 使用配置的模型直接创建 chat model。
- 不创建 thread。
- 不写入 items、turns、tool_calls。
- 返回 `runId`。
- 后续输出通过独立 `selection-event` 流式发送给 Selection 窗口。

流式输出使用独立事件，避免与会话事件混淆：

```text
selection.started
selection.delta
selection.completed
selection.failed
```

## 模型调用

第一版直接使用现有模型配置：

- Provider 解析优先级：Selection 配置、Portal 默认、首个可用 Provider。
- Model 解析优先级：Selection 配置、Provider 默认模型。
- Reasoning 解析优先级：Selection 配置、默认 `minimal` 或 `low`。

权限模式等价于只读。Selection 不提供工具调用，不允许 shell、文件编辑、MCP 调用等副作用能力。

## 错误处理

| 场景 | 行为 |
| --- | --- |
| 读取不到选中文本 | 打开窗口，提示手动粘贴或输入 |
| 快捷键注册失败 | Portal Selection 配置页显示 warning |
| 模型未配置 | 结果区提示去模型配置 |
| 缺 API Key | 结果区提示对应 Provider 需要 API Key |
| Prompt 模板为空 | 保存时阻止或提示，运行时显示错误 |
| Prompt 缺少 `{{selection}}` | 保存时 warning，允许保存 |
| 模型调用失败 | 结果区显示错误，提供重试 |
| 剪贴板恢复失败 | 不阻断执行，记录轻提示 |

## 文件与模块影响

预期涉及：

- `src/types/index.ts`：新增 Selection 配置类型。
- `src/services/desktopApi.ts`：新增 Selection IPC 包装。
- `src/pages/PortalPage.tsx`：新增 `Selection` 子标签。
- `src/pages/portal/PortalSelectionSettings.tsx`：新增配置页。
- `src/pages/SelectionWindow.tsx`：新增运行窗口页面。
- `src/utils/selectionActions.ts`：默认动作、排序、模板渲染。
- `electron/main.ts`：全局快捷键、Selection 窗口、读取选区、模型调用。
- `electron/preload.ts`：如需独立事件订阅，暴露 selection event。
- `src/styles/theme.css`：Selection 配置页和 Liquid Glass 窗口样式。

如果 `electron/main.ts` 继续增长明显，实施时可考虑只抽取 Selection 相关纯函数到单独模块，但第一版避免大规模重构。

## 测试计划

静态与单元测试：

- `AppSettings` 包含 Selection 配置字段。
- 默认动作补齐、排序、启用过滤。
- Prompt 模板正确替换 `{{selection}}`。
- 模板缺变量时返回 warning。
- Portal 页面包含 `Selection` 子标签。
- 快捷键注册包含 `selectionShortcut`。
- `selection_run_action` 不创建 thread，不写入会话数据。

UI 验证：

- Portal `Selection` 配置页可保存快捷键、模型和动作。
- Selection 第一态只显示动作条。
- 点击动作后展开结果弹窗。
- 动作条滚轮横向滑动。
- `复制`、`展开`、`原文`、`Esc` 行为正确。
- 深浅主题下 Liquid Glass 可读。
- `prefers-reduced-motion` 下动效降级。

人工验证：

- 在浏览器、编辑器、聊天窗口中选中文字后触发。
- 读取选区成功时不破坏原剪贴板文本。
- 读取失败时可手动粘贴。
- API Key 缺失和模型失败时错误可理解。

## 后续扩展

- 打开完整会话：将选区、动作、结果带入新线程。
- 写回原应用：在明确授权后替换选中文本。
- 每个动作独立快捷键。
- 动作分组和搜索。
- 上下文感知动作，例如代码、日志、中文、英文自动排序。
- 历史结果列表，但默认不进入 Session。
