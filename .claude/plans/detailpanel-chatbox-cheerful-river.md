# 右栏改造：DetailPanel → 顶部元信息条 + ChatGPT 式聊天流 + 横向可拉伸

## Context

当前右栏 (`src/app/App.tsx:229`) 是一个固定 420px 的 `<aside>`，里面纵向叠了两块：

1. **DetailPanel**：可折叠（最大 55vh），打开时占了大半个屏幕，里面是 breadcrumb + 一段巨大的 Markdown 答案 + 边选中时的 edit textarea。它和左侧画布上节点显示的内容**重复**——用户已经在画布上看到答案了。
2. **AskBox**：独立的输入框，位于 DetailPanel 下方。它会以"当前选中节点"为 parent，但脱离了对话的语境感——你看不到刚才那个答案到底是怎么来的。

用户反馈这两者放一起"不和谐"——希望右栏更像一个**ChatGPT 聊天界面**：沿着 root→当前节点这条路径展示完整对话历史，每一轮都能 fork/edit/regenerate，且这些操作和左侧树双向联动；顶部只放一个**精简的元信息条**（model、tokens、status、breadcrumb），不再塞大段内容；整个右栏可以**横向拖拽**改大小。

这个改造**不改数据层**，路径计算、fork 操作、流式写盘都已经在 store 里实现完整，纯粹是 UI 重组。

被拒备选：

- **改成弹出大窗"展开阅读"**——更复杂、和"聊天即历史"的诉求相反，否决。
- **保留旧 DetailPanel + 新增 ChatThread tab 切换**——增加心智负担，否决。
- **用 `allotment` 做 resizable**——`react-resizable-panels` 是 shadcn 默认搭档，社区方案更主流，且支持 `autoSaveId` 直接持久化到 localStorage，选它。

## 改造方案

### 1. 引入横向可拉伸布局

- 新增依赖：`react-resizable-panels`（最新 2.x）
- 新增 shadcn wrapper：`src/components/ui/resizable.tsx`，导出 `ResizablePanelGroup` / `ResizablePanel` / `ResizableHandle`（标准 shadcn 模板）
- 在 `src/app/App.tsx` 中：
  - 左侧 260px session sidebar 保持原样（不进 PanelGroup）
  - 把 `<main>`（TreeCanvas）和右侧 `<aside>` 包进 `<ResizablePanelGroup direction="horizontal" autoSaveId="qa-tree:right-rail">`
  - 右栏 `<ResizablePanel defaultSize={32} minSize={22} maxSize={55}>`（百分比；22% ≈ 1440 视口下 ~315px，55% ≈ 一半屏宽）
  - 中间 canvas `<ResizablePanel defaultSize={68} minSize={45}>`
  - `<ResizableHandle>` 用 1px hairline 风格，hover 时高亮成 accent 色，匹配现有 `border-l border-border`
- 持久化：`autoSaveId` 由 `react-resizable-panels` 自动写 localStorage，刷新后恢复

### 2. DetailPanel 瘦身为顶部元信息条

文件：`src/components/canvas/DetailPanel.tsx`（重写，保留文件名和导出）

- 删除：可折叠展开逻辑、大块 Markdown、edit-prompt textarea（编辑流程下沉到 ChatThread，见 §3）、`open` 状态
- 新版布局：固定高度 ~auto，最多 2 行内容，始终可见
  - **第 1 行**——breadcrumb：`root › A1 · summary › Q2 · summary › A2 · summary › …`，复用现有 `walkPathToRoot()` 结果（`src/lib/context.ts:127`）；每段是个按钮，点击 → `selectNode(id)` 或 `selectEdge(id)`，行为与现版完全一致
  - **第 2 行**——meta strip：复用现有 `NodeMetaStrip`（`src/components/canvas/DetailPanel.tsx:399-461` 抽出为同文件下的子组件）的 JSX——`MODEL · 模型 · tokens · 时间 · STATUS 徽章` + 右侧 `Regenerate Fork` / `Delete Subtree` 按钮；`STATUS_BADGE_STYLE` 仍从 `AnswerNode` 导入
- 三种状态：
  - 选中节点：显示该节点的 meta + 路径 breadcrumb
  - 选中边：显示边的 `chars · time` + `Edit & Fork` 按钮（点击 → 让 ChatThread 滚到该 user bubble 并打开内联编辑器，见 §3）
  - 无选中：显示 session 标题 + `· N nodes` 计数（保持视觉占位，不做空高度跳动）
- 不再需要 `prevHadSelectionRef` / `open` / `editingEdgeId` 这些本地状态；`forkEditPrompt` 不再由 DetailPanel 直接调用

### 3. 新增 ChatThread 组件

文件：`src/components/canvas/ChatThread.tsx`（新建）

**数据**：

- 订阅 store：`selectedNodeId` / `selectedEdgeId` / `nodes` / `edges` / `streamingNodeIds` / `loadedSessionId` / `forkEditPrompt` / `requestRegenerateFork` / `requestDeleteSubtree` / `abortStream` / `selectNode` / `selectEdge`
- 路径计算：
  ```ts
  const anchorId = selectedNodeId ?? selectedEdgeId ? edges.get(selectedEdgeId).toNodeId : null;
  const path = anchorId ? walkPathToRoot(nodes, edges, anchorId) : [];
  ```
- 把 `path` 中非 root 的步骤映射成一组 turn：每个 turn = `{ edge: step.edge, node: step.node }`，分别渲染为 user bubble + assistant bubble

**渲染**：

- **空状态**（`path.length <= 1`，即只有 root）：显示一行 italic muted 提示 `Ask your first question below ↓`
- **User bubble**（右对齐，窄于满宽，hairline 边 + 微弱 accent 背景）：
  - 内容：`edge.prompt`（普通文本，`whitespace-pre-wrap`）
  - 点击整块 → `selectEdge(edge.id)`；`selectedEdgeId === edge.id` 时加 ring 高亮
  - hover 时浮出右上角操作组：`Edit & Fork` / `Copy`
  - `Edit & Fork` 点击后：bubble 替换为 textarea + Cancel/Save 行；Save 调用 `forkEditPrompt(edge.id, draft, { provider, proxy })`；store 内部会创建新分支并自动选中新节点，从而 path 切换、新 turn 流式追加；Esc 取消、⌘Enter 提交（沿用 DetailPanel 现有的快捷键习惯，`src/components/canvas/DetailPanel.tsx:325-333`）
- **Assistant bubble**（左对齐，宽一点；用 `<Markdown content={node.content} />` 渲染）：
  - 上方可选地显示 `structured.title`（display italic, 大字号）和 `structured.summary`（italic muted），样式照搬现 DetailPanel `:292-303` 的处理
  - 下方一行 footer：`status badge`（用 `STATUS_BADGE_STYLE`）+ model + tokens（复用 `formatTokenUsage`）+ time（`formatAbsoluteTime`）
  - 流式态：`streamingNodeIds.has(node.id)` 时在 footer 显示脉动小点 + `Abort` 按钮（调 `abortStream(node.id)`）；和现 AskBox 顶部那条横幅风格一致
  - 错误/aborted 态：显示 `structuredError`（`resolveStructuredErrorText`）和 `errorMessage`，与现 DetailPanel `:287-291` 一致
  - 点击整块 → `selectNode(node.id)`；`selectedNodeId === node.id` 时加 ring 高亮
  - hover 操作组：`Regenerate Fork`（→ `requestRegenerateFork(node.id)`）/ `Delete Subtree`（→ `requestDeleteSubtree(node.id)`）/ `Copy`
- **Suggestion chips 搬家**：当前 turn 是路径**最后一个** assistant bubble 且其 `structured?.suggestedQuestions` 非空时，在该 bubble 内底部用 wrap-flow 排出最多 5 个 `<SuggestionChip>`（从 `AnswerNode` 导出复用，已带交互样式）；点击 → 直接调 `sendPrompt({ parentNodeId: node.id, prompt, ... })`，与 AskBox 现 `forkSuggestion` 一致

**滚动行为**：

- `selectedNodeId` / `selectedEdgeId` 变化时，找到对应 bubble 的 ref，`scrollIntoView({ block: 'center', behavior: 'smooth' })`
- 流式时：若用户当前没向上滚（用 sentinel + IntersectionObserver 判断"是否贴近底部"），则保持 pinned-to-bottom；用户主动上滚后不再强制贴底（标准 ChatGPT 行为）
- 路径切换（前后 anchor 不同分支）：默认滚到选中那条 turn

### 4. AskBox 微调

文件：`src/components/canvas/AskBox.tsx`

- **删除**：`A3 · summary` 那条 banner（`:198-211`）——thread 已经显示了完整上下文，banner 信息冗余
- **删除**：suggestion chips 区域（`:213-229`）——已搬到 ChatThread 最后一个 assistant bubble 内
- **保留**：流式中横幅（`:173-196`）和被其他 session 占用横幅（`:161-171`）——它们是状态指示，无论怎么滚都该可见
- **保留**：`Q{nextDepth} ↦` 标签（`:231-233`）——还是有用的视觉锚
- **保留**：`forwardRef` 暴露的 `focus` / `prefill`（画布节点的 concept chip 还在用）
- 整体压缩内边距，让它只占 ~90-110px 高度，sticky 在右栏底部
- 不需要改 `submit` / `forkSuggestion` 逻辑

### 5. App.tsx 接线

文件：`src/app/App.tsx`

替换 `:212-232` 的 `<main>` + 右 `<aside>` 部分为：

```tsx
<ResizablePanelGroup direction="horizontal" autoSaveId="qa-tree:right-rail">
  <ResizablePanel defaultSize={68} minSize={45}>
    <main className="flex h-full flex-col overflow-hidden">
      <section className="flex-1 overflow-hidden">
        {!settingsHydrated ? <LoadingState /> : (
          <TreeCanvas onAddBranchFocus={focusAskBox} onPrefillAsk={prefillAskBox} />
        )}
      </section>
    </main>
  </ResizablePanel>
  <ResizableHandle />
  <ResizablePanel defaultSize={32} minSize={22} maxSize={55}>
    <aside className="flex h-full flex-col border-l border-border bg-background">
      <DetailPanel />
      <div className="flex-1 overflow-hidden">
        <ChatThread />
      </div>
      <AskBox ref={askBoxRef} />
    </aside>
  </ResizablePanel>
</ResizablePanelGroup>
```

`focusAskBox` / `prefillAskBox` 不动（画布 concept chip 路径仍走 AskBox prefill）。

### 6. 已存在、不动的代码

- `src/lib/context.ts` 的 `walkPathToRoot` 已能直接喂给 ChatThread
- `src/stores/treeStore.ts` 现有的 `forkEditPrompt` / `requestRegenerateFork` / `requestDeleteSubtree` / `sendPrompt` / `abortStream` 完全够用
- `src/components/Markdown.tsx` 直接复用渲染 assistant bubble 内容
- `src/components/canvas/AnswerNode.tsx` 导出的 `STATUS_BADGE_STYLE` 和 `SuggestionChip` 复用
- `src/lib/format.ts` 的 `summarizeText` / `formatAbsoluteTime` / `formatTokenUsage` 复用
- `src/hooks/useResolvedProvider.ts` ChatThread 的 fork 操作要拿 `provider`/`proxy`，照搬 DetailPanel 的用法

## 关键文件清单

新建：

- `src/components/canvas/ChatThread.tsx`
- `src/components/ui/resizable.tsx`

修改：

- `src/app/App.tsx`（`:212-232` 替换为 PanelGroup）
- `src/components/canvas/DetailPanel.tsx`（重写为元信息条）
- `src/components/canvas/AskBox.tsx`（删除 banner + suggestion chips）
- `package.json`（加 `react-resizable-panels`）

`src/lib/i18n` 文案：DetailPanel/AskBox 删除的字段如果没有别处引用顺手清理；ChatThread 新增的 `Edit & Fork` / `Regenerate Fork` / `Delete Subtree` / `Copy` / `Abort` / 空状态提示等文案走现有 `t.detail` / `t.answer` / `t.ask`，缺的补上中英两份。

## 验收（手工 E2E，对应 CLAUDE.md §14）

```bash
pnpm install   # 拉 react-resizable-panels
pnpm dev
```

浏览器走一遍：

1. **横向拉伸** — 拖拽中间分隔条，画布和右栏宽度按比例变化；窄到 22%（≈ 360px @ 1440）/ 宽到 55% 都不破版；刷新页面后宽度从 localStorage 恢复
2. **基础聊天流** — 新建 session，问 Q1 → 右栏 ChatThread 出现 user bubble + 流式 assistant bubble；左侧画布同步出现节点和边
3. **左右联动** — 在画布上点 A2 → 右栏 thread 自动切到 root→A2 这条路径，对应 turn 高亮+滚到视野中央；顶部 DetailPanel breadcrumb 同步更新；点画布的边 → 对应 user bubble 高亮
4. **Edit & Fork**（user bubble）— hover Q2 bubble，点 `Edit & Fork`，bubble 变成 textarea，改写后 ⌘Enter，左侧画布从 A1 长出新分支并自动选中；新 thread 显示新 path
5. **Regenerate Fork**（assistant bubble）— hover A2 bubble，点 `Regenerate Fork`，画布上 A2 多出一个兄弟节点流式生成
6. **Delete Subtree** — hover A2 bubble，点 `Delete Subtree`，确认弹窗后子树消失，thread 回退到 root → A1
7. **Suggestion chips** — 答完一个问题后，ChatThread 末尾 assistant bubble 内出现建议 chips；点击 → 创建新 turn 并选中
8. **流式状态** — 流式中可在 assistant bubble footer 看到脉动点 + `Abort`；点 Abort 立即停止并把 status 切到 aborted
9. **并发分支** — 在多个父节点同时发问，每条路径只显示自己路径上的流式态；`activeStreamSessionId` 正常守卫
10. **跨 session 切换** — 切到另一个 session，thread / DetailPanel / AskBox 都重置；右栏宽度不重置
11. **路径深时** — 制造 8 层以上的深路径，thread 滚动顺畅，新的流式 token 在底部时保持贴底，向上滚后不再被强制拉回
12. **刷新恢复** — 在某条深路径中间选中节点，刷新页面 → session 加载完毕后选中状态、宽度都恢复（节点选中本来就持久化在 store/Dexie）
13. **构建** — `pnpm build` 通过 TS 类型检查

## 设计原则对齐

- **Path-based context（CLAUDE.md §1 不变量）** — ChatThread 完全走 `walkPathToRoot()`，不旁路；fork 操作通过 store 创建分支，路径隔离逻辑不动
- **折叠是渲染层** — ChatThread 是纯渲染层，不动数据；折叠节点的子树本来就不在 root→leaf 路径上，天然无影响
- **不破坏数据 schema** — 0 改动 Dexie；`autoSaveId` 写的是 localStorage，与 IndexedDB 解耦
- **frontend-design skill** — 实施阶段所有视觉细节（bubble 边距、hover 动效、resize handle 视觉、空状态排版）都走 `frontend-design` skill 产出，而非凭直觉手写
