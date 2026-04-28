# 重构页面布局：QA 树改为自上而下 + ChatBox 移到右侧

## Context

当前布局是「侧边栏 + 主区域纵向叠（画布 / DetailPanel / AskBox）」+ 画布内 dagre `LR`（左右）方向。在主区下方的 AskBox 受限于横向铺满 + `rows={2}` 的窄高度，输入区显得局促；同时 LR 树的左右滚动方式不符合一般「上下阅读」的对话习惯。

本次重构将：

1. 画布 dagre 方向从 `LR` 改为 `TB`（上 → 下生长）；
2. AskBox 从「主区域底部横条」改为「右侧独立竖列」，竖向布局后 chips 可自然换行、textarea 可加高，使用更像聊天面板；
3. 推荐问题（叶节点的 `SuggestedRail`）由「叶节点右侧浮窗」改为「叶节点正下方浮窗」，与 TB 方向一致，视觉等同「下一步分支预览」；
4. DetailPanel 仍保留在画布下方（用户已确认）。

> 设计 invariant 仍由 `.claude/plans/abstract-doodling-flamingo.md` 第 2/4 节守护：路径上下文、先落盘再流式、Dexie 数据契约不变。本重构纯属呈现层调整，不改变任何数据模型。

## 目标布局示意

```
┌──────┬──────────────────┬──────────────┐
│ side │                  │              │
│ bar  │   QA-Tree (TB)   │   AskBox     │
│ w260 │   flex-1         │   w-[420px]  │
│      │                  │   chips↑     │
│      ├──────────────────┤   textarea   │
│      │  DetailPanel     │   send btn   │
└──────┴──────────────────┴──────────────┘
```

## 改动清单

### 1. `src/components/canvas/layout.ts` — dagre 方向 + 间距 + Rail 尺寸
- `rankdir: 'LR'` → `'TB'`（94 行）
- `RANK_SEP`：220 → **140**（TB 下 ranksep 是行间垂直 gap，280 高节点 + 220 太空旷；140 与现有 LR 视觉密度相当）
- `NODE_SEP`：64 → **96**（TB 下 nodesep 是同行兄弟水平 gap，340 宽节点 + 边标签需要更多呼吸；96 防止边 label 与相邻卡片粘连）
- `SUGGESTED_RAIL_WIDTH`：196 → **`NODE_WIDTH` (340)**（rail 移到叶节点正下方，宽度对齐父卡片，视觉延续）
- `SUGGESTED_RAIL_GAP`：保持 16
- `suggestedRailHeight()`：保持 `18 + min(N, 6)*38`，rail 内部仍是 `flex-col` 单列 chips（在 AnswerNode 已有实现，无需改）

### 2. `src/components/canvas/AnswerNode.tsx` — 卡片 Handle 方向
- 95 行：target Handle `Position.Left` → **`Position.Top`**
- 101 行：source Handle `Position.Right` → **`Position.Bottom`**
- 卡片本身 `flex-col h-[280px] w-[340px]`（87 行）保持不变 —— 节点形状不变，只是连接方向旋转 90°
- `qa-handle` CSS 类与方向无关，不需改

### 3. `src/components/canvas/StartPill.tsx` — 起点小药丸 Handle 方向
- 15 行：source Handle `Position.Right` → **`Position.Bottom`**
- StartPill 本身保持当前 76×36 的胶囊形（横向），只是连接点改朝下

### 4. `src/components/canvas/PromptEdge.tsx` — 边 label 反转坐标轴
- 当前注释（52–56 行）特化于 LR：兄弟边共享 sourceX/sourceY/targetX，仅 targetY 不同 → label 用 Y 中点错开
- TB 下兄弟边共享 sourceX/sourceY/targetY，仅 targetX 不同 → 必须用 **X 中点** 错开，避免 label 堆叠
- 把 57–59 行替换为：
  ```ts
  const labelY = sourceY + (targetY - sourceY) * 0.5;
  const sameCol = Math.abs(targetX - sourceX) < 1;
  const labelX = sameCol ? sourceX + 12 : (sourceX + targetX) / 2;
  ```
- 保留 `getSmoothStepPath` + `borderRadius:8, offset:24`，平滑阶梯路径在两个方向上都成立

### 5. `src/components/canvas/TreeCanvas.tsx` — 推荐问题 rail 改放叶节点下方
- 263–266 行的 rail 坐标：
  ```ts
  // 旧（叶右侧）：
  x: pn.x + NODE_WIDTH + SUGGESTED_RAIL_GAP,
  y: pn.y + Math.max(0, (NODE_HEIGHT - railHeight) / 2),
  // 新（叶正下方，水平居中）：
  x: pn.x + (NODE_WIDTH - SUGGESTED_RAIL_WIDTH) / 2,  // SUGGESTED_RAIL_WIDTH 已改为 340 → 此项 = 0，但保留通式以便日后调宽
  y: pn.y + NODE_HEIGHT + SUGGESTED_RAIL_GAP,
  ```
- 触发条件 `childCount === 0 && suggestions.length > 0`（252–253 行）保持不变 —— rail 仍只挂在叶节点（无后代），不会与 dagre 排出的下层节点碰撞
- rail 仍是「dagre 之外」的浮动节点，只是因为放在了叶下方，会自然延伸到画布下沿 —— 不影响 dagre 自动排版

### 6. `src/app/App.tsx` — 主区域分列 + AskBox 右移
- 当前根容器（103 行）：`<div flex h-full w-full><aside w-260><main flex-col>{TreeCanvas, DetailPanel, AskBox}</main></div>`
- 新结构：
  ```tsx
  <div className="flex h-full w-full">
    <aside className="w-[260px] ..."> {/* 不变 */} </aside>
    <main className="flex flex-1 flex-col overflow-hidden">
      <section className="flex-1 overflow-hidden">
        <TreeCanvas ... />
      </section>
      <DetailPanel />
    </main>
    <aside className="flex w-[420px] shrink-0 flex-col border-l border-border bg-background">
      <AskBox ref={askBoxRef} />
    </aside>
  </div>
  ```
- `w-[420px]` 选择理由：AskBox 现有 `px-6` 内边距 + 中等长度的 chips 标签需要 ~360px 净宽；420 有舒适余量。无横向 resize（KISS，遵循 v0 不引入额外交互）

### 7. `src/components/canvas/AskBox.tsx` — 横条 → 竖排重排
- 移除根容器 160 行 `border-t` → 改为 **不带边框**（左边框由 App.tsx 的右 aside 用 `border-l` 提供，避免双线）
- 整体根 `<div>` 改为 `flex h-full flex-col`，内容自上而下分四块：
  1. **状态横幅区**（`blockedByOtherSession` / `streamingNodeId` 两个分支，161–196 行）：保持横排卡片样式，靠顶；
  2. **面包屑/banner 行**（198–211 行）：`px-6 pt-2`，上下文「↳ A2 · …」
  3. **推荐 chips 区**（213–228 行）：保持 `flex flex-wrap gap-1.5`，竖排空间足够 chip 自然换行（不再受单行宽度限制）
  4. **输入区**（230–285 行）：从 `flex items-end gap-3` 横排改为 **竖排**：
     - 顶部：小标签 `Q{n} ↦`（独立一行，左对齐）
     - 中间：`<textarea>`，`rows={2}` → **`rows={4}`**，占满列宽（`w-full`）
     - 底部：Send / configureProvider 按钮，`self-end` 右对齐
     - 用 `mt-auto` 把整个输入区压到列底
- 整个组件不再消费 `border-t`，改由父级 `border-l` 提供分隔；颜色仍保持 `bg-background`
- `dense` 模式 chips 与 `forkSuggestion` 行为完全保留 —— 数据流不动

### 8. 已知小副作用 —— 旧的 pin 坐标
- `src/stores/treeStore.ts:771` 的 `pinNode`/`positions` 把 LR 坐标存进 IndexedDB（`kv` 表 `positions:<sessionId>`）。换 TB 之后这些坐标位置会失真（之前钉在右上的卡片可能落到画布外）。
- **不做自动迁移**：CLAUDE.md「No Breaking Changes to data schema」针对的是丢数据/破契约；坐标只是软指针，丢掉只是要求重新拖拽。
- **入口**：`treeStore.clearAllPositions` 已存在（784 行）。CanvasToolbar 已暴露此 action 的话用户可手动重置；如未暴露，**不在本次范围内** 加按钮（保持范围最小，遇到才补）。
- 在 PR 描述中作为 Migration note 写明：用户若发现已固定的节点位置错乱，可右键 / toolbar 触发「reset positions」。

## 关键文件（按改动范围由小到大）

| 文件 | 主要改动 |
| --- | --- |
| `src/components/canvas/StartPill.tsx` | 1 行：source 方向 |
| `src/components/canvas/AnswerNode.tsx` | 2 行：target/source 方向 |
| `src/components/canvas/layout.ts` | rankdir、ranksep、nodesep、SUGGESTED_RAIL_WIDTH 几个常量 |
| `src/components/canvas/PromptEdge.tsx` | label 坐标公式翻轴 + 注释更新 |
| `src/components/canvas/TreeCanvas.tsx` | rail 坐标公式 |
| `src/app/App.tsx` | 根布局拆分为三栏 |
| `src/components/canvas/AskBox.tsx` | 横向 → 竖向重排（结构不变，只是 flex 方向 + textarea rows） |

## 不改 / 不动的部分（防止 scope 蔓延）

- `treeStore` / `lib/context.ts` / `lib/llm.ts` / Dexie schema：完全不动
- `DetailPanel` 内部布局（仅父级位置变化，组件本体保持现状）
- `Markdown.tsx`、节点状态/动画 CSS、主题 token、i18n 键
- 不做 PWA/导入导出/canvas zoom 控件等周边
- 不为 v1 引入横向 resize 把手；右栏宽度固定 420
- 不动 `clearAllPositions` 的暴露与否

## 验收（手动跑通的端到端流程）

按 CLAUDE.md「Global Rules」自用 + 设计文档第 14 节流程：

1. **基本画布翻转**：`pnpm dev` → 新会话 → 提一个根问题 → 流式回答出现，节点在 StartPill 正下方而非右侧；连续问 2 层 → 画布自上而下生长，dagre 行距/列距视觉舒适、边标签不堆叠
2. **多分支隔离不变**：在 A1 节点开两个分支 → 两个 A2 平铺在 A1 下方左右两侧，prompt label 居中无堆叠；切换到任一 A2，AskBox 右栏 banner 正确反映上下文路径
3. **推荐问题位置**：等任意叶节点流完，rail 出现在叶节点 **正下方** 居中，宽度与卡片一致（340），点 chip 直接 fork 到该叶下方新分支
4. **AskBox 右栏可用**：textarea 默认 rows={4} 高度，能输入多行；chips 行换行后不溢出右栏；Send / ⌘+Enter / 中止流 / 切到设置链接 全部正常
5. **DetailPanel 不变**：画布下方仍可折叠展开，breadcrumb / structured 区块都正常
6. **刷新恢复**：刷新页面后会话/树/折叠态/AskBox 右栏布局都从 IndexedDB 恢复
7. **暗/亮主题**：两种主题下右栏 `border-l` 与画布之间分隔可见，AskBox 内文字/chip 对比度通过
8. **旧固定位置兼容**（如此前已 pin 节点）：节点出现在旧 LR 坐标处，可拖动或调用 `clearAllPositions` 恢复 dagre 自动排版

## 实施顺序建议

1. layout.ts → AnswerNode/StartPill → PromptEdge（先把画布翻成 TB，肉眼验收 1–3）
2. TreeCanvas rail 坐标（验收 3）
3. App.tsx 三栏 + AskBox 竖排（验收 4–7）

每一步都可独立 `pnpm dev` 自测，互不阻塞。

## Commit 计划

- `[FE] Rotate canvas to TB layout (handles, dagre, edge labels)` — 步骤 1
- `[FE] Move suggested rail beneath leaf nodes` — 步骤 2
- `[FE] Move AskBox to right column, restack vertically` — 步骤 3
