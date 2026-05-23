# P0-02: Mermaid 渲染策略重构

## 目标

解决流式输出时 Mermaid 图表频繁重渲染导致的闪烁和布局跳动问题。

## 当前现状 (any-jumper-desktop)

`MarkdownRenderer.tsx:348-423` — `MermaidBlock` 每次 code 变化调用 `mermaid.render(id, code)`，生成 SVG 后直接替换。无防抖、无竞态保护。

**亮点**：`buildMermaidConfig()` 有极其详尽的 140+ 行语义化调色板，覆盖所有图表类型，这个必须保留！

## Proma 参考方案

`packages/ui/src/mermaid-block/MermaidBlock.tsx`:

**核心策略："源码优先，SVG 覆盖淡入"**

```
布局结构：
  <div relative>
    <pre>源码（始终 static，提供稳定高度）</pre>
    <div absolute inset-0>SVG 覆盖层（不参与布局）</div>
  </div>

渲染时序：
  流式输出 → 源码自然增长（零跳动）
  code 稳定 350ms → 后台 renderMermaid
  成功 → SVG 淡入覆盖，源码淡出（一次性过渡，250ms）
  失败 → 保持源码展示
```

**防竞态**：generation 计数器，只有最新一代渲染结果才生效

**缩放平移**：滚轮缩放 (25%-300%)，鼠标拖拽平移，缩放百分比显示

**主题跟随**：MutationObserver 监听 `document.documentElement` class 变化

## 实施要点

1. **保留** `buildMermaidConfig()` 及其全部主题变量作为 SVG 渲染的配色来源
2. 实现双层叠加布局（源码 static + SVG absolute）
3. 350ms 防抖 + generation 计数器防竞态
4. 250ms 淡入淡出过渡
5. 缩放+平移交互（滚轮+拖拽）
6. 缩放控制按钮（- / 百分比 / + / 重置）
7. MutationObserver 监听主题切换

## 涉及文件

- `src/components/MarkdownRenderer.tsx` — 重写 MermaidBlock
- 现有的 `buildMermaidConfig()` 需要适配新方案
