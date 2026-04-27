# QA-Tree 后续版本待办：分阶段实施 Plan

## Context

QA-Tree MVP（M1–M10）已完整落地：三栏布局、Dexie v1 schema、路径上下文构造、SSE 流式、并发节点、折叠子树、双语 + 主题、本地 proxy、Session CRUD。

设计文档 `.claude/plans/abstract-doodling-flamingo.md` 第 12 节列出 11 项「后续版本待办」，本次任务是为这些待办**分阶段排期**——按价值密度、技术风险、跨模块影响、是否需要后端做分层，使后续可按阶段独立交付，每个阶段都能单独发版本。

排期总原则：
1. **先小而美**：低改动面、用户立刻有感的体验项先上（命名 / Mermaid / PWA / 拖动）。
2. **schema 改动单独成阶段**：每次 Dexie 迁移都是高风险动作，集中处理减少版本碎片。
3. **后端依赖项最后**：分享链接 / 多端同步暂记 ROADMAP，本计划不实现，仅在结尾提评估锚点。
4. **每阶段验收 = 端到端手工流程**（沿用设计文档第 14 节风格）。

---

## 阶段总览

设计标注：🎨 = 涉及前端设计，必须走 `frontend-design` skill；🤖 = 不涉及设计美观，可直接交给 Codex 实现；🎨🤖 = 主体逻辑可交 Codex，其中明确标注的小段视觉/图标产出走 frontend-design。

| 阶段 | 主题 | 包含特性 | Dexie 升级 | 估算复杂度 | 设计? |
|---|---|---|---|---|---|
| **P1** | 体验微调 | LLM 自动命名 / Mermaid / PWA / **删除节点及下游** | v2（仅 titleSource） | 小 | 🎨🤖 |
| **P2** | 画布增强 | 节点手动拖动 + 位置持久化（独立 KV） | 否（只加 KV 项） | 小-中 | 🎨🤖 |
| **P3** | 学习引擎 | **编辑即分叉**（fork-only 重生成 / prompt 编辑） + **结构化输出 + 延伸问题 chips（核心：点击 / 多选并发分叉）** | 否（仅 node.structured 选填字段） | 中-大 | 🎨 |
| **P4** | 选段深入 | 文本选中级分叉（仅 DetailPanel） | v3（edge.emphasis） | 中 | 🎨 |
| **P5** | 数据可移植 | JSON 导入导出 / Markdown 导出 / 图片导出 | 否 | 中 | 🤖 |
| **P6** | 安全加固 | API Key 主密码加密（WebCrypto） | v4 | 中-大 | 🎨 |
| **P7** | 待后端 | 分享链接 / 多端同步 / 登录计费 | — | — | — |

> **变更说明（v2 修订，吸收 Codex 第一轮评审）**：
> - 取消"编辑历史数组"概念（`previousPrompts` / `regenerations`），分支天然即历史 → 编辑/重生成均**强制 fork**。
> - `QANode.position` 字段不再加，改用 KV `nodePositions[sessionId][nodeId] = {x, y}`，与流式 `db.nodes.put` 完全解耦。
> - 结构化输出的核心价值是 **suggestedQuestions chips**：点击 = 直接创建子分支，多选 = 一次性创建多个并发分支（项目灵魂"递归式学习"的最强体现）。
> - 解析失败 → `status='done'` + `structuredError` warning，不阻断；provider 兼容性走"先开后退"。
> - 选段分叉只挂 DetailPanel 的完整 markdown（节点卡是纯文本摘要）。
> - JSON 导出 schema 用独立 `portableVersion`，与 Dexie 版本解耦。
>
> **变更说明（v3 修订，吸收 Codex 第二轮评审）**：
> - **结构化输出 finalize 时把 `node.content` 改写为 `answerMarkdown`**（决策 5A）：流式中 raw JSON 仅在内存 buffer，不落盘；DetailPanel / 摘要 / 导出 / context.ts 全部零侵入。
> - **P1.4 删除子树先 abort streaming 后代**：遍历删除集 → controller.abort() + 删 streamRecords + 取消 flush timer，再事务删；按钮不再 disabled。
> - **P3.1 forkRegenerate 必须新建 edge**：明确 edge 与 node 1-1，禁止复用原 edge id；提取共享 helper `createForkBranch`。
> - **P2 layout memo 依赖改 `layoutVersion: number` counter**：所有结构事件 ++（增删/折叠/位置/fork），SSE delta 不 ++；干净避开"`nodesMap.size` 漏感知 vs 完整对象触发过频"的两难。
> - **P1.1 自动命名触发点从 TreeCanvas 移到 `treeStore.runStream` finalize 后**：后台流式（用户切走 session）也能正确触发命名。
> - **P5 顺手抽出 `SessionList.tsx`**：当前列表内联在 `App.tsx`，借此次加导入/导出按钮的机会重构。
>
> **变更说明（v4 修订，吸收 Codex 第三轮评审）**：
> - **layout memo 依赖改为 `[loadedSessionId, layoutVersion]`**：避免 session 切换时新旧 `layoutVersion=0` 撞车导致复用旧 layout。
> - **capability cache 同步改为「`streamChat` 返回 patch + 调用方走 `settingsStore.upsertProvider`」**：保持 Zustand 是 provider 唯一 source of truth，避免 Dexie 写完 Zustand 仍是旧对象。
> - **文件清单与正文对齐**：删除 P1 清单里"TreeCanvas 触发 autoTitle"残留；P3 清单 `context.ts` 标注"无改动"。
> - **`deleteNodeSubtree` 末尾调 `syncStreamingState()`**：与 `discardStreamsForSession` 保持一致，避免 UI 残留"正在生成"指示。

---

## P1 · 体验微调（低风险见效快）

### 1.1 LLM 自动命名 session 标题  🤖 Codex
> 仅触发逻辑 + 文案更新，**侧栏文字本来就在**，无视觉新增。

**前置 schema 改动（Dexie v2 — P1 唯一一次升级）**
- `Session` 新增 `titleSource: 'default' | 'prompt' | 'llm' | 'manual'`
- 迁移：旧记录全部置 `'prompt'`（历史标题来自 `recordFirstPrompt` 截断，自动命名不再覆盖它们）
- 新建 = `'default'`；`recordFirstPrompt` → `'prompt'`；`renameSession` → `'manual'`；自动命名成功 → `'llm'`

**改造锚点**
- `src/types/index.ts`：加 `titleSource`
- `src/lib/db.ts`：v2，`upgrade` backfill `'prompt'`
- `src/stores/sessionsStore.ts`：
  - `recordFirstPrompt` / `renameSession` 同步维护 `titleSource`
  - 新增 `autoTitleSession(sessionId)`：仅当 `titleSource ∈ {'default','prompt'}` 才执行
- `src/lib/llm.ts`：复用 SSE 客户端，**非流式**单次调用（system="用 8–12 字给以下问答取一个学习主题标题"）
- **触发点放在 `treeStore.runStream` finalize 之后**（不能放 TreeCanvas，否则后台跑完的流式会漏触发）：
  - 条件：`parentNodeId === session.rootNodeId && finalStatus === 'done' && session.titleSource ∈ {'default','prompt'}`
  - 即使用户切走该 session、流式继续在后台完成，命名也能正确触发

**关键约束**
- 不阻塞 UI；失败静默回退（保留现 title）
- `titleSource='manual'` 后永不覆盖
- 用当前 session 的 `providerId`
- 切到其他 session 后，原 session 的流式完成同样能触发命名（因为逻辑在 store 而非 UI）

**验收**：新建 session → 提问 → 流式完成 → 侧栏标题 1–2 秒内更新；手动重命名后再提问，标题不被覆盖；DevTools IndexedDB 看到 `titleSource` 字段流转正确。

### 1.2 Mermaid 渲染  🤖 Codex
> 集成现成库输出 SVG，`mermaid.initialize({ theme })` 跟随主题；不引入新视觉元素。
**改造锚点**
- `package.json`：添加 `mermaid`（按需懒加载，避免主 bundle 膨胀）
- `src/components/Markdown.tsx`（或 `src/lib/markdown.tsx`）：`code` 组件中识别 `language-mermaid`，调用 `mermaid.render()` 输出 SVG；首次渲染时动态 import
- 主题切换时调用 `mermaid.initialize({ theme })` 同步重渲染

**验收**：在 detail panel 输入测试 markdown 包含 ```mermaid graph TD; A-->B``` → 看到 SVG 流程图；切换 dark/light → 颜色跟随。

### 1.3 PWA（installable + 离线壳）  🎨🤖 拆分
> 配置（vite-plugin-pwa / manifest / workbox）→ Codex；192/512 图标 + theme_color 选取 → frontend-design skill。
**改造锚点**
- `package.json`：添加 `vite-plugin-pwa`
- `vite.config.ts`：注册插件，配置 `manifest`（name=QA-Tree, icons, theme_color）和 `workbox`（仅缓存静态壳，不缓存 LLM 请求）
- `index.html`：`<link rel="manifest">` 注入由插件处理
- 提供 192/512 两套 PNG 图标（设计走 frontend-design skill）

**关键约束**
- LLM 请求 `runtimeCaching` 设为 `NetworkOnly`，避免离线返回缓存的旧响应
- IndexedDB 数据天然离线可用；离线壳保证 UI 能打开

**验收**：`pnpm build && pnpm preview` → Chrome 看到「安装应用」按钮 → 安装后离线启动可看到本地 sessions 列表。

> 图标设计调用 `frontend-design` skill 产出（CLAUDE.md 红线第 7 条）。

### 1.4 删除节点及下游  🎨🤖 拆分
> 项目级新增功能，配合后续 P3 fork-only 策略使用（fork 多了需要清理）；逻辑 → Codex，二次确认 dialog + 节点 hover 删除按钮 → frontend-design skill。

**改造锚点**
- `src/stores/treeStore.ts`：新增 `deleteNodeSubtree(nodeId)`：
  1. 校验 `nodeId !== rootNodeId`（root 不可删）
  2. DFS 收集 `nodeId` 及其所有后代节点 + 它们的入边
  3. **预清理 streaming 后代**（关键，回应 Codex 第二轮评审）：遍历删除集，对每个 `streamRecords[id]` 执行 `controller.abort()` + 从 `streamRecords` map 中 delete + 取消挂起的 flush timer，**避免删除后 stream record 继续 `db.nodes.put` 把已删节点写回**；优先复用现有 `discardStreamsForSession` 同款 helper（提取 `discardStreamRecords(ids: string[])` 通用函数）
  4. 一次事务从 `db.nodes` / `db.edges` 删除
  5. 同步清理 `nodePositions[sessionId]` 中相关 key（P2 后生效）
  6. 若选中节点在删除集中，重置 selection 为该节点的父节点
  7. **末尾调用 `syncStreamingState()`**（回应 Codex 第三轮评审，与 `discardStreamsForSession` 保持一致），刷新 `activeStreamSessionId / streamingNodeIds`，避免 UI 残留"正在生成"
- `src/components/canvas/AnswerNode.tsx`：hover 浮出区新增 🗑 icon（与 ➕ 同侧，红色 tint）
- `src/components/canvas/DetailPanel.tsx`：选中节点时主区底部加「删除该分支」按钮
- 二次确认 dialog（shadcn `<AlertDialog>`）：「将删除当前节点及其下方 N 个后代节点 / M 条边」；若子树中有 streaming 节点，文案追加：「其中 K 个回答仍在生成中，将先中止再删除」；操作不可撤销

**关键约束**
- root 节点不可删；尝试删 root 应在 UI 层禁用按钮
- 删除是**硬删除**（IndexedDB 实操），不引入软删除概念（导入/导出能干净）
- **不再"流式中节点不可删"**：改为先 abort streaming 后代再删（更符合用户直觉）
- 但当前节点本身正在流式时，**仍 disabled** + tooltip "请先中止"（避免与中止按钮语义重叠）

**验收**：
1. 选中中间节点 → 点删除 → dialog 提示数量 → 确认 → 节点 + 整棵子树消失，画布重排
2. 选中一个 done 节点，但其子树里有 streaming 节点 → dialog 提示「K 个回答仍在生成中将先中止」→ 确认后子树立即消失，DevTools 看不到孤儿 streaming node 写回
3. root 删除按钮 disabled；当前节点本身 streaming 时删除按钮 disabled

---

## P2 · 画布增强：节点手动拖动 + 位置持久化  🎨🤖 拆分
> 位置数据**完全独立于 QANode**，与流式 `db.nodes.put` 解耦——这是回应 Codex 评审的核心改动。
> 拖动 / 持久化 / layout 合并逻辑 → Codex；「pinned」小图钉视觉标记 + CanvasToolbar 「重置布局」按钮微调 → frontend-design skill。

### 数据模型（不动 QANode）
- **不**给 `QANode` 加 `position` 字段
- 在 KV 表里加一行：`positions:<sessionId>` → `Record<nodeId, { x: number; y: number }>`
- 无需 Dexie 版本升级（KV 表 schema 不变，只多写一种 key）

### 改造锚点
- `src/lib/db.ts`：增加 KV helper `getPositions(sessionId)` / `setPositions(sessionId, map)`；不动 schema 版本
- `src/stores/treeStore.ts`：
  - state 加 `positions: Record<nodeId, {x,y}>`（仅当前 session）
  - state 加 **`layoutVersion: number`** counter（核心：替代脆弱的 `nodesMap.size` 依赖，回应 Codex 评审）
  - `loadSession` 时读 KV、写入 state；`layoutVersion` 重置为 0
  - 新增 `setNodePosition(nodeId, pos)`：更新 state + 节流写 KV（500ms，沿用现有 streamFlush 节流） + `layoutVersion++`
  - 新增 `clearAllPositions()`：state 置空 + KV 删 key + `layoutVersion++`
  - 节点删除时同步清理 `positions[nodeId]` + `layoutVersion++`
  - **所有结构事件 ++ layoutVersion**：addNode / removeNode / addEdge / removeEdge / toggleCollapse / setNodePosition / clearAllPositions / fork* 等
  - **SSE delta 不 ++ layoutVersion**（content 流式更新与 layout 无关，避免每秒多次重排）
- `src/components/canvas/layout.ts`：dagre 计算结果中，对存在 `positions[id]` 的节点用 stored 值覆盖；**未拖动过的节点继续走 dagre**
- `src/components/canvas/TreeCanvas.tsx`：
  - **layout memo 依赖改为 `[loadedSessionId, layoutVersion]`**（回应 Codex 第三轮评审：仅 `layoutVersion` 不够——`loadSession` 时它会重置为 0，新旧 session 都是 0 → React.useMemo 复用旧 session 的 layout；加上 `loadedSessionId` 后，session 切换强制重算。不要换成"全局单调递增不重置"方案，因为 `loadSession` 时 positions / collapsed / nodes 等全套 state 都重建，用 sessionId 作为重置触发更明确）
  - 启用 React Flow 节点拖动：`nodesDraggable={true}`、`panOnDrag` 维持现有手势
  - 监听 `onNodeDragStop(_, node) => setNodePosition(node.id, node.position)`
- `src/components/canvas/CanvasToolbar.tsx`：增加「重置布局」按钮 → `clearAllPositions()` + 重新跑 dagre
- `AnswerNode`：右上角小「📌 pinned」icon，仅当 `positions[id]` 存在时显示（hover 提示「已锁定位置，点重置布局可解开」）

### 关键约束
- 流式中 `db.nodes.put(rec.node)` 与 positions 完全解耦（位置不在 node 表里，永远不会被覆盖）
- 拖动后该节点退出自动布局；新增子节点用 dagre 算位置
- 折叠/展开子树仍触发布局；被折叠节点的 stored position 保留，展开后位置恢复
- root 节点（虚拟 START pill）不可拖动

### 验收
拖动几个节点 → 看到 📌 icon → 刷新 → 位置恢复；同一节点流式输出中 → 拖动它 → 流式继续、位置不被覆盖；点「重置布局」→ 全部回归 dagre + 📌 消失；新增分支 → 已拖节点不动、新节点合理落位；删除节点 → KV 中对应 position 项也清掉（DevTools 可验证）。

---

## P3 · 学习引擎（核心阶段：fork-only 编辑 + 延伸问题分叉）

> **取消"编辑历史数组"**：不再需要 `previousPrompts` / `regenerations`——分支天然就是历史。这同时保护项目灵魂"路径上下文纯净"（旧路径不会用上"新父内容 + 旧子回答"的混合上下文）。

### 3.1 编辑即分叉（fork-only 重生成 / prompt 编辑）  🎨 frontend-design
> P3 的安全底座。结合 P1.4「删除节点及下游」一起使用：fork 出新分支后用户可以删旧的，节点树始终干净。
**核心规则**
- **编辑 prompt** = 创建一条**新 edge**（同父 fromNodeId、新 prompt id）+ 一个**新 node**，**旧 edge / 旧 node / 旧子树原封不动**
- **重生成节点** = 同样：找到该 node 的入边读出 prompt → 在同父下**新建一条 edge**（独立 id、prompt 与原入边相同）+ 一个新 node 跑流式；**绝不复用原 edge id**（数据模型 `QAEdge.toNodeId` 是 1-1，复用会破坏一致性 — 回应 Codex 评审）
- 用户若想清理旧的 → 用 P1.4 的删除按钮

**无 schema 改动**（QAEdge / QANode 字段不变；既有 retry 逻辑改造为 fork）

**改造锚点**
- `src/stores/treeStore.ts`：
  - 新增 `forkEditPrompt(edgeId, newPrompt)`：取出 `edge.fromNodeId` → 新建 `QAEdge`（新 id、同 fromNodeId、新 prompt） + 新 `QANode`（streaming） → 把新 edge.toNodeId 指向新 node → 跑 LLM
  - 新增 `forkRegenerate(nodeId)`：取出 `nodes[nodeId].parentEdgeId` 对应 edge 的 prompt → 同父下新建 edge（**新 id、prompt 复制**）+ 新 node → 跑流式
  - 共享内部 helper `createForkBranch(fromNodeId, prompt)`：避免两条路径重复
  - 现有 `retryNode` 的"叶子限制"判定移除（被新逻辑取代；retry 改名或保留作为 fork 的 alias）
- `src/components/canvas/DetailPanel.tsx`：
  - 选中 edge → 显示「编辑此问题（fork）」按钮 → textarea → 提交 = `forkEditPrompt` → 自动选中新节点
  - 选中 node → 显示「重新生成（fork）」按钮 → `forkRegenerate`
- `src/components/canvas/AnswerNode.tsx`：header `⟳` 改调 `forkRegenerate`
- 二次确认 dialog（仅重生成时，提示"将创建一个新分支，旧回答保留"）；编辑 prompt 默认无须确认

**关键约束（回应 Codex 评审的最关键修改）**
- **绝不**修改既有 node 的 content / 既有 edge 的 prompt（除手动 rename session 标题外，所有 LLM 输出的内容都不可变）
- fork 出的新节点用 dagre 自动布局摆在原节点旁边，视觉上"长出新分支"
- 流式中节点不可 fork（按钮 disabled）

**验收**：选中一条 edge → 编辑 prompt → fork 出兄弟边 + 新流式节点；旧 edge/node/子树原封不动；点节点 ⟳ → 同父下出现两个版本节点 → 用 P1.4 删除按钮可清理旧的；DevTools Network 看到 LLM 的 messages 用的是新 prompt + 干净路径上下文（无旧 node 内容污染）。

### 3.2 结构化输出 + 延伸问题 chips（项目灵魂的最强体现）  🎨 frontend-design
> 让 LLM 在每次回答末尾附 3–6 条延伸问题；用户**点击 chip = 直接 fork 子分支并立即开始流式**，多选 chips = **同时 fork 多个并发分支**（已有 session 内并发流式机制原生支持）。

**数据**（无 Dexie 升级；Dexie 原生忽略未知字段）
```ts
interface QANode {
  ...;
  structured?: {
    title?: string;          // 8-12 字主题
    summary?: string;        // 2-4 句摘要
    concepts?: string[];     // 关键术语 chip
    suggestedQuestions?: string[];  // ★ 灵魂功能
    answerMarkdown: string;  // 渲染主体（必有）
  };
  structuredError?: string;  // 解析失败时的 warning，节点仍 done
}
```

**改造锚点**
- `src/types/index.ts`：加 `structured` / `structuredError`
- `src/lib/llm.ts`：
  - **默认开启结构化**（Q3B），走"先开后退"：先注入 `response_format: { type: 'json_object' }`；若 provider 4xx 且错误指向 response_format → 自动重试**不带** response_format
  - capability 字段定义在 `ProviderConfig.capabilities.responseFormat: 'unknown'|'supported'|'unsupported'`，下次直接走对应路径
  - **capability 同步落点**（回应 Codex 第三轮评审，避免 Zustand / Dexie 双写脱钩）：`streamChat` **不直接写 Dexie**，而是返回 `capabilityPatch?: { responseFormat: 'supported'|'unsupported' }`；调用方（treeStore.runStream）拿到 patch 后调 `settingsStore.upsertProvider(providerId, { capabilities: { ...prev, ...patch } })` 一次性同步内存 + Dexie，避免下次请求读到 Zustand 旧对象重复探测
  - system prompt 模板（合并到 provider.systemPrompt）：
    ```
    请以 JSON 格式回答，schema 如下：
    { "title": string, "summary": string, "concepts": string[],
      "suggestedQuestions": string[3-6], "answerMarkdown": string }
    suggestedQuestions 是用户可能想接着深入追问的方向，每条 12-25 字，互相覆盖不同子主题。
    ```
  - 流式增量解析：边收边尝试 `parsePartialJson(buffer)`（容错 JSON）；失败先按纯文本累积，结束做完整 `JSON.parse` 兜底
  - 解析完全失败 → 节点 `status='done'`、`structured = undefined`、`structuredError = "结构化解析失败，已按纯文本展示"`、`content` 保留 raw 累积文本（**不**走 error 状态，回应 Codex 评审）
  - **解析成功时关键步骤（决策 5A，回应 Codex）**：流式中 `content` 临时只在内存（stream record）累积 raw JSON buffer，**finalize 落盘时把 `content` 改写为 `structured.answerMarkdown`**；raw JSON buffer 不入库。这样：
    - DetailPanel `selectedNode.content`（[DetailPanel.tsx](file:///Users/joshua/workspace/QA-Tree/src/components/canvas/DetailPanel.tsx)）天然渲染 markdown，不会看到 raw JSON
    - context.ts、breadcrumb 摘要、未来 P5.2 markdown 导出全部无需改逻辑
    - DevTools IndexedDB 看到的就是 markdown，调试直观
    - 不变性：`content` 始终是"渲染主体" — 这与既有语义一致
- `src/lib/context.ts`：assistant content 直接用 `node.content` 即可（解析成功者已是 markdown；解析失败者是原文）；`structured.answerMarkdown` 在 context 层面不再需要特殊判断
- `src/components/canvas/AnswerNode.tsx`（设计先行）：
  - 折叠态优先用 `structured.title + summary`；fallback 到首段截取
  - 卡片底部 **延伸问题区**：渲染 `suggestedQuestions` 为可点击 / 可多选 chips
    - 单击 → 立即 fork 子分支（用该 question 作 prompt，立刻流式）
    - 长按 / 勾选 → 进入多选态 → 底部出现「一次性创建 N 个分支」按钮 → 同时 fork 多个并发流式节点
  - 卡片中部 **概念 chips**：`concepts` 渲染为偏弱视觉，点击 → 注入 AskBox `请展开「{concept}」`（用户可改后再发）
  - `structuredError` 存在时显示一条灰色 banner（不是 error 红色），warning 级文案
- `src/components/canvas/AskBox.tsx`：暴露 `prefill(text)` 让 chip 注入

**关键约束**
- `suggestedQuestions` 点击 = **直接 fork 流式**（不经 AskBox），降低操作成本——这是与 concepts 的关键差异
- 多选并发分叉走现有"同 session 内多节点并发流式"机制（CLAUDE.md 红线 #2 已经允许）
- response_format capability 检测结果落 IndexedDB（每个 provider 一次成本）
- 解析失败永远不阻塞用户阅读

**验收**：
1. 强模型 provider（GPT-4o）→ 提问 → 节点显示 title / 摘要 / concepts / suggestedQuestions 四块 → 点击一个 suggested → 立即长出新分支并流式
2. 多选 3 个 suggested → 点「创建 3 个分支」→ 同父下立刻出现 3 个并发流式节点
3. 兼容性差的端点 → 第一次自动探测失败 → 自动回退纯文本 → 节点 done + 灰色 warning banner；下次同 provider 直接走纯文本路径（capabilities 已 cache）
4. DevTools 看到流式中 SSE delta 能被部分解析、UI 实时增量渲染（不是等结束才显示）

---

## P4 · 选段深入：文本选中级分叉（仅 DetailPanel）  🎨 frontend-design
> **回应 Codex 评审**：节点卡是纯文本摘要不渲染 markdown，选段功能挂在 DetailPanel 的完整 markdown 上（这是用户阅读 / 选段的真正场景）。
> 选段浮动按钮、AskBox 引用块、PromptEdge 引号 icon——多处新增视觉元素，需设计先行。

### 改造锚点
- **types**：`QAEdge` 新增 `emphasis?: { sourceNodeId: string; selectedText: string; charRange?: [number, number] }`
- **db**：升级到 **v3**（前面 P1 占了 v2，此处接续）
- **DetailPanel 的 Markdown 渲染容器**（`src/components/canvas/DetailPanel.tsx`）：监听 `mouseup` → 当选区落在 markdown 内 → 弹出 floating button「基于此段提问」（**节点卡不挂监听**）
- **AskBox**：当 `pendingEmphasis` 存在时，输入框上方显示一段引用块（可取消）
- **context.ts**：构造 messages 时若当前 edge 含 `emphasis`，在最后一轮 user message 顶部注入：
  ```
  [用户在上一段回答中选中了以下内容，希望基于此延伸：]
  > {selectedText}
  ```
  **不打散其它路径节点的内容**（兄弟分支隔离不变）
- **PromptEdge label**：若 edge 有 emphasis，前缀加一个引号 icon
- **DetailPanel 选中此类 edge** 时单独展示原文片段 + 完整 prompt

### 关键约束
- 选中跨多个节点的文本不支持（首选最近的祖先节点）
- emphasis 不影响兄弟分支，仍只走路径上下文
- charRange 用于将来在源节点高亮显示「这段被引用过」（P4 内可选实现，落地需 markdown → 字符位置映射）

### 验收
选中 DetailPanel 中 A1 的一段话 → 浮动按钮 → 点击 → AskBox 显示引用块 → 提交 → 新分支创建；DevTools 看到 LLM messages 末尾带选段引用；切换到该分支的 edge → DetailPanel 显示原文 + 引号 icon。

---

## P5 · 数据可移植  🤖 Codex（整阶段）
> 全部为按钮 + 文件对话框 + 序列化逻辑，复用现有 toolbar / sidebar 按钮风格即可，无新视觉。

### 5.1 JSON 导入/导出
- 新建 `src/lib/portable.ts`：序列化 = `{ portableVersion: 1, exportedAt, dexieVersion, sessions, nodes, edges, providers? }`；**`portableVersion` 与 Dexie 版本号解耦**（回应 Codex 评审），独立维护迁移函数；同时记 `dexieVersion` 仅作 metadata 用
- **抽出 `src/components/sidebar/SessionList.tsx`**（回应 Codex 评审）：当前 sidebar 列表内联在 `App.tsx` 内，借此次加「导入 / 导出」按钮的机会顺手提取；将「+ 新建会话 / 搜索框 / 列表 / 导入导出按钮」整合为独立组件
- `SessionList`（顶部）与 `ProvidersPage`（顶部）各加「导入 / 导出」按钮，导出整库 or 单 session
- 导入冲突策略：默认**新建副本**（id 重生成、updatedAt = now），不覆盖已有；导入 provider 时 apiKey 留空（安全考虑）

### 5.2 Markdown 导出（单 session）
- `src/lib/exportMarkdown.ts`：DFS 遍历树，按缩进生成嵌套大纲：
  ```
  # {sessionTitle}
  ## Q1: …
  > A1 markdown
    ### Q3: …
    > A3 markdown
  ```
- 提供下载 `.md` 文件

### 5.3 图片导出（画布快照）
- 用 `html-to-image` 或 React Flow 自带 `toPng`：导出当前 viewport 或 fit-view 全图
- 提供 toolbar 按钮 `📷 截图`

### 验收
导出整库 → 删库 → 导入 → 数据完整恢复；导出单 session 为 markdown 看到结构化大纲；导出 PNG 看到完整树。

---

## P6 · 安全加固：API Key 主密码加密  🎨 frontend-design
> 解锁 dialog、设置 / 修改 / 关闭主密码流程、安全提示横幅升级、锁屏 UI、超时设置——多处对话框 + 状态横幅，需设计先行；底层 WebCrypto / KV / migration 逻辑可在视觉 spec 落定后交 Codex。

### 改造锚点
- **lib/crypto.ts**（新建）：WebCrypto AES-256-GCM；主密码经 PBKDF2（200k+ iterations, salt 存 KV）派生 key
- **db.ts**：新增 KV 项 `encryptionEnabled`、`saltB64`、`verifyTokenCipher`（用于校验密码正确）；升级到 **v4**，迁移函数为存量 `apiKey` 现有明文留原状（直到用户启用加密时一次性加密）
- **settingsStore**：内存中保留解密后的 key（仅当前 session 生命周期）；锁屏后清空、重新输入主密码解锁
- **ProvidersPage**：
  - 顶部安全提示横幅升级：「已启用主密码 ✓ / 未启用 ⚠️」
  - 「启用加密」首次设置流程：输入两次主密码 → 派生 key → 加密所有现有 apiKey → 保存校验 token
  - 解锁 dialog：每次冷启动 + 用户主动锁定后弹出
  - 「修改主密码」/「关闭加密」流程
- **llm.ts**：调用前从 store 读取**已解密**的 key

### 关键约束
- 用户忘记主密码 = 数据无法解密；UI 必须强提示
- 锁屏快捷键 `Cmd+Shift+L`；超时自动锁定（settings 里配置 0/15/60 分钟）
- IndexedDB 中**永不**出现明文 key（启用后）

### 验收
启用加密 → 设主密码 → 刷新 → 弹解锁 → 输入正确密码 → 能正常发请求；输入错误密码 → 拒绝；锁屏后 LLM 调用全部失败并提示先解锁。

---

## P7 · 后端依赖（暂不实施，仅锚定方向）

### 7.1 分享链接
- 思路：导出 JSON → 上传到对象存储（用户自配 S3 兼容端点 / 走简单后端）→ 给只读 URL
- **不阻塞**前端：可在 P5 导出能力上加「上传到自定义端点」字段；后端服务后续单独立项

### 7.2 多端同步 / 登录 / 计费
- 需后端：账号体系、IndexedDB → 服务端的 changelog / CRDT 同步、计费网关
- 评估锚点：
  - 数据迁移：现 schema → 服务端表结构；冲突解决（同节点多端同时编辑罕见，可 last-write-wins）
  - 鉴权：API key 不再仅本地，需后端代理 LLM 调用以避免 key 暴露
  - 是否走 Supabase / 自建 Hono+Postgres，本计划不预设

> P7 仅作 ROADMAP 锚定；本次实施完成 P1–P6 即可视为「后续版本待办」前端部分全部交付。

---

## 关键文件清单（按阶段汇总）

```
P1 — Dexie v2（titleSource）
  src/types/index.ts                       (+titleSource)
  src/lib/db.ts                            (v2 migrate, backfill 'prompt')
  src/stores/sessionsStore.ts              (autoTitleSession + titleSource 维护)
  src/lib/llm.ts                           (非流式 single call helper)
  src/stores/treeStore.ts                  (runStream finalize 后调 autoTitleSession + deleteNodeSubtree)
  src/lib/markdown.tsx                     (mermaid 集成)
  src/components/canvas/AnswerNode.tsx     (hover 🗑 icon)
  src/components/canvas/DetailPanel.tsx    (「删除该分支」按钮 + AlertDialog)
  vite.config.ts, package.json             (vite-plugin-pwa)
  index.html, public/icons/*.png           (manifest + 图标)

P2 — 无 schema 升级（KV 项即可）
  src/lib/db.ts                            (KV helper getPositions/setPositions)
  src/stores/treeStore.ts                  (positions state + setNodePosition + clearAllPositions)
  src/components/canvas/layout.ts          (合并 dagre 与 stored positions)
  src/components/canvas/TreeCanvas.tsx     (启用 nodesDraggable + onNodeDragStop + 修复 layout memo 依赖)
  src/components/canvas/CanvasToolbar.tsx  (「重置布局」按钮)
  src/components/canvas/AnswerNode.tsx     (📌 pinned icon)

P3 — 无 schema 升级（QANode 选填字段）
  src/types/index.ts                       (+structured / +structuredError / ProviderConfig.capabilities)
  src/stores/treeStore.ts                  (forkEditPrompt / forkRegenerate / 共享 createForkBranch + finalize 时 content=answerMarkdown + 应用 capabilityPatch)
  src/lib/llm.ts                           (response_format 先开后退 + 返回 capabilityPatch + 流式 partial JSON)
  src/stores/settingsStore.ts              (upsertProvider 接受 capabilities patch)
  src/lib/context.ts                       (无改动；node.content 已是 markdown)
  src/components/canvas/AnswerNode.tsx     (三段式重设计 + concepts/suggestedQuestions chips + 多选)
  src/components/canvas/AskBox.tsx         (prefill API)
  src/components/canvas/DetailPanel.tsx    (编辑此问题 fork / 重新生成 fork 按钮)
  src/components/settings/ProvidersPage.tsx (capabilities cache 展示，可选)

P4 — Dexie v3（edge.emphasis）
  src/types/index.ts                       (+QAEdge.emphasis)
  src/lib/db.ts                            (v3 migrate)
  src/components/canvas/DetailPanel.tsx    (markdown 容器 mouseup → floating button)
  src/lib/context.ts                       (注入 emphasis 到 user content 顶部)
  src/components/canvas/AskBox.tsx         (pendingEmphasis 引用块)
  src/components/canvas/PromptEdge.tsx     (引号 icon)

P5 — 无 schema 升级
  src/lib/portable.ts                      (NEW: 独立 portableVersion + import/export)
  src/lib/exportMarkdown.ts                (NEW: DFS → 嵌套大纲)
  src/components/sidebar/SessionList.tsx   (NEW: 从 App.tsx 抽出，整库导入/导出)
  src/app/App.tsx                          (改用 <SessionList />)
  src/components/sidebar/SessionRow.tsx    (单 session 导出)
  src/components/canvas/CanvasToolbar.tsx  (PNG snapshot via React Flow toPng)

P6 — Dexie v4（KV 加密相关）
  src/lib/crypto.ts                        (NEW: WebCrypto AES-256-GCM + PBKDF2)
  src/lib/db.ts                            (v4: KV encryptionEnabled / saltB64 / verifyTokenCipher)
  src/stores/settingsStore.ts              (in-memory key + lock state + 超时锁屏)
  src/components/settings/ProvidersPage.tsx (启用/修改/关闭加密 dialogs + 横幅升级)
  src/app/App.tsx                          (冷启动解锁拦截)
  src/lib/llm.ts                           (调用前从 store 读已解密 key)
```

### Dexie 版本号一览
- 当前 MVP：v1
- P1：v2（+ Session.titleSource）
- P2：**不升级**（仅写 KV 项）
- P3：**不升级**（QANode 加选填字段，Dexie 原生兼容）
- P4：v3（+ QAEdge.emphasis）
- P5：**不升级**（导出格式独立 portableVersion）
- P6：v4（+ KV 加密 metadata）

---

## 跨阶段一致性纪律

- **每次 Dexie 升级必走 `db.version(N).upgrade()`**，旧库验证恢复（CLAUDE.md 红线 #4 / #6）
- **types/ 与 db.ts 同步**，避免 schema 漂移
- **所有 LLM 调用经 `lib/llm.ts`** + 路径上下文经 `lib/context.ts`，新特性禁止旁路（CLAUDE.md 红线 #1 / #5）
- **🎨 标的特性必走 `frontend-design` skill 出 spec**（图标、chip、引用块、解锁 dialog、节点重设计等）；🤖 标的特性逻辑可直接交 Codex 实现，但若过程中临时新增 UI 元素仍要回到 frontend-design
- **commit 前缀**：`[FE]` 前端 / `[ROOT]` 配置 + 文档；按阶段独立 PR

## 设计 / 实现分工矩阵

| 阶段·特性 | 设计 (frontend-design) | 实现 (Codex 或自实现) |
|---|---|---|
| P1.1 自动命名 | — | 全部 |
| P1.2 Mermaid | — | 全部 |
| P1.3 PWA | 192/512 图标 + theme_color | 插件配置 / manifest / workbox |
| **P1.4 删除节点及下游** | hover 🗑 icon + AlertDialog 文案 | DFS 删除事务 / 选中重置 |
| P2 手动拖动 | 📌 pinned icon、「重置布局」按钮微调 | 拖动监听 / KV 存储 / layout 合并 / memo 修复 |
| **P3.1 编辑即分叉** | 「编辑此问题（fork）」/「重新生成（fork）」按钮 + dialog | forkEditPrompt / forkRegenerate store action |
| **P3.2 延伸问题 chips** | 节点卡三段式 / concept vs suggested 视觉差 / 多选态 / warning banner | response_format 先开后退 + capability cache + 流式 partial JSON + 多选 fork |
| P4 选段分叉 | DetailPanel floating 按钮 / 引用块 / edge 引号 | DetailPanel 选区监听 / context 注入 / schema v3 |
| P5.1 JSON I/O | — | 全部 |
| P5.2 Markdown 导出 | — | 全部 |
| P5.3 PNG 导出 | — | 全部（toolbar 按钮复用现有风格） |
| P6 主密码加密 | 启用 / 解锁 / 修改 / 锁屏 / 横幅 dialog 群 | WebCrypto / KV / migration / store |
| P7 后端依赖 | — | —（待立项） |

## 验证（端到端手工）

每阶段完成时按对应「验收」条目跑一遍 + 完整回归设计文档第 14 节 18 条流程，确保未损坏 MVP 行为。
