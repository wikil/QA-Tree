# QA-Tree：递归式学习的树状问答前端

## Context

传统 LLM 问答是线性的（一问一答），但深度学习一个主题时，用户常常需要在某个回答的某个概念上"分叉"出延伸问题，多分叉互不污染地各自延伸——这就是"递归式学习法"。

本项目是一个**纯前端**的 Web 应用：
- 左侧 Session 列表（类似 ChatGPT）
- 右侧画布以**横向树**展示问答：节点 = AI 回答，边 = 用户 prompt
- 任一节点可继续提问，形成新分支；同一节点可有多条子分支
- 上下文严格沿 root → 当前节点这条**路径**传递，兄弟分支彼此隔离
- 通过用户自填的 OpenAI 兼容 API key 直接调用 LLM
- 所有数据存浏览器 IndexedDB，无后端
- 仓库附带一个**轻量可选 Node proxy** 作为 CORS 兜底（默认不启用，主流 provider 浏览器直连即可）

工作目录 `/Users/joshua/workspace/QA-Tree/` 当前为空，按全新项目从零搭建。

---

## 技术栈

| 层 | 选型 |
|---|---|
| 构建 | Vite + React 18 + TypeScript |
| 样式 | Tailwind CSS + shadcn/ui（支持 light / dark / system） |
| 画布 | `@xyflow/react` (React Flow v12) |
| 自动布局 | `dagre`，rankdir = LR |
| 状态 | Zustand |
| 持久化 | Dexie (IndexedDB) |
| Markdown | `react-markdown` + `remark-gfm` + `rehype-highlight` + `rehype-katex` |
| LLM | 原生 `fetch` + `ReadableStream`，按 OpenAI `/v1/chat/completions` SSE 协议解析 |
| 路由 | React Router |
| 工具 | `nanoid`（id），`zod`（设置校验） |

---

## 数据模型

```ts
// src/types/index.ts
type NodeStatus = 'streaming' | 'done' | 'error';

interface Session {
  id: string;
  title: string;          // 默认从首个 prompt 截取，可手动重命名
  createdAt: number;
  updatedAt: number;
  rootNodeId: string;
  providerId?: string;    // 该 session 当前选用的 provider
}

interface QANode {
  id: string;
  sessionId: string;
  parentEdgeId: string | null;  // null 仅 root
  role: 'root' | 'assistant';
  content: string;              // root 节点存 session 标题/初始话题
  status: NodeStatus;
  model?: string;
  tokenUsage?: { prompt: number; completion: number };
  errorMessage?: string;
  createdAt: number;
}

interface QAEdge {
  id: string;
  sessionId: string;
  fromNodeId: string;
  toNodeId: string;
  prompt: string;
  createdAt: number;
}

interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;             // e.g. https://api.openai.com/v1
  apiKey: string;              // 明文存 IndexedDB（自用场景；加密留待后续）
  defaultModel: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}
```

**上下文构造算法**（`src/lib/context.ts`）：
1. 从目标节点 N 沿 `parentEdgeId` 回溯到 root，得到节点序列 `[root, n1, n2, …, N]` 与边序列 `[e1, e2, …, eN]`
2. 输出 messages：
   - `system`：provider.systemPrompt（若有）
   - 对路径上每对 `(eᵢ, nᵢ)`（跳过 root）：push `{role:'user', content:eᵢ.prompt}`、`{role:'assistant', content:nᵢ.content}`
   - 最后追加新的 `{role:'user', content: 用户输入}`

---

## 目录结构

```
QA-Tree/
  package.json, vite.config.ts, tsconfig.json, tailwind.config.ts, postcss.config.js
  index.html
  src/
    main.tsx
    app/
      App.tsx               # 三栏 Shell：sidebar / canvas / detail panel
      ThemeProvider.tsx
    components/
      ui/                   # shadcn 原子组件（button, dialog, input, textarea, ...）
      canvas/
        TreeCanvas.tsx      # React Flow 容器，含 MiniMap + Controls + Toolbar
        AnswerNode.tsx      # 自定义节点（含折叠子树按钮）
        PromptEdge.tsx      # 自定义边（含 prompt 摘要 label）
        EmptyState.tsx      # 新 session 中央大输入框
        layout.ts           # dagre 自动布局 helper（含可见性过滤：折叠的子树不参与布局）
        pathHighlight.ts    # 选中节点时计算 root → 当前的路径并高亮
      sidebar/
        SessionList.tsx     # 含 + 新建 / 搜索框 / 重命名 / 删除
      detail/
        DetailPanel.tsx     # 底部可拖拽改高度的面板，支持折叠
        Breadcrumbs.tsx     # root › … › 当前
        AskBox.tsx          # textarea + 发送 / 中止；Cmd/Ctrl+Enter 提交
      settings/
        ProvidersPage.tsx   # Provider CRUD + 内置预设 + API key 安全提示 + 本地 proxy 字段
    stores/
      sessionsStore.ts
      treeStore.ts          # 当前 session 的 nodes / edges / selection / collapsed set
      settingsStore.ts      # providers + 当前默认 providerId + theme + proxy 配置
    lib/
      db.ts                 # Dexie：sessions, nodes, edges, providers, kv
      llm.ts                # OpenAI 兼容 SSE 客户端，支持 AbortController；按设置走直连或本地 proxy
      context.ts            # 路径回溯 → messages
      markdown.tsx          # Markdown 组件（含代码高亮 + KaTeX）
      ids.ts                # nanoid 包装
      summary.ts            # 折叠态摘要：取前 N 行（保留 markdown）
    types/
      index.ts
    styles/
      index.css
  proxy/                    # 可选 Node CORS proxy（默认不启动，仅 CORS 受阻时使用）
    server.mjs
    README.md
```

---

## 关键交互规范

### 画布
- 横向自动布局（dagre LR）；新增节点 / 流式完成时整体重排，无手动拖动（MVP）
- 自带 **MiniMap**（右下）+ **Controls**（zoom / fit / lock）+ 顶部 **CanvasToolbar**（fit-view / 重置布局 / 主题切换 / 折叠所有 / 展开所有）
- 节点卡固定宽 **340px**，折叠态固定高约 **200px**：模型名 + ~6 行 markdown 摘要 + 渐隐遮罩 + "展开" 按钮（点击在 detail panel 完整查看）
- 节点 hover：右侧浮出 ➕ 图标 → 点击在该节点下创建新分支并自动聚焦输入框
- 节点左下角有 **▸ / ▾ 折叠子树** 按钮：折叠后该节点的所有后代不参与渲染与布局，节点显示 `+N` badge 表示被隐藏的后代数；折叠状态保存在 IndexedDB（per session）
- 边的 label：prompt 前 ~25 字截断；hover/选中时 detail panel 显示完整 prompt
- 选中态：节点 / 边 二选一高亮；同时**高亮 root → 当前节点的整条路径**（路径上的节点描边加粗、边变色加粗）；点空白处取消选中
- 流式中：节点显示闪烁光标，模型名旁显示加载小动画，"中止" 按钮在 AskBox 上

### 底部 Detail Panel
- 可上下拖拽改变高度，可一键折叠到一条窄条
- 顶部一行面包屑：root › … › 当前节点（点任一段跳转选中）
- 主区显示：选中节点 → 完整 markdown；选中边 → 完整 prompt + 元信息
- 主区下方常驻 **AskBox**：基于"当前选中节点"作为父节点继续提问；流式中显示"中止"

### 新分支创建（两种入口都做）
1. 选中节点 → 在 AskBox 输入 → Cmd/Ctrl+Enter
2. 节点 hover ➕ → 自动选中该节点并把焦点送进 AskBox

### Sessions 侧栏
- 顶部 "+ 新建会话"（创建 session + 虚拟 root，画布进入 EmptyState）
- 顶部 **搜索框**：按标题做本地模糊匹配（标题 + 首条 prompt），实时过滤
- 列表按 `updatedAt` 倒序，行内显示标题 + 节点数 / 时间
- 右键菜单：重命名 / 删除（删除二次确认 dialog）

### 设置（Providers）
- 多个 ProviderConfig 可保存切换；一个全局默认
- 内置预设按钮一键填入：**OpenAI 官方 / DeepSeek / Moonshot / Ollama 本地**（仅填 baseUrl + 推荐模型，apiKey 用户自填）
- 字段：name / baseUrl / apiKey / defaultModel（自由输入 + 常见模型 datalist） / systemPrompt / temperature / maxTokens
- API Key 明文存 IndexedDB，UI 上以掩码显示，可"显示"切换
- **顶部安全提示横幅**：「API key 仅保存在本机浏览器的 IndexedDB，请勿在不可信设备上使用本工具；如需更高安全性，请等待后续主密码加密功能。」
- **本地 proxy 字段**（可选）：开关 + URL（默认 `http://localhost:8787`）。开启后所有 LLM 请求改走本地 proxy；下方一行 hint 列出常见 CORS 解法（Ollama 设 `OLLAMA_ORIGINS=*`，或启用本仓库自带的 `pnpm proxy`）

### 空状态
- 新 session 画布中央渲染大号输入框 + 引导文案"开始你的第一个问题"；提交后才真正创建首个节点+边

### 流式与持久化
- 发送时同步创建 `QAEdge`（prompt 已知）和 `QANode`（status='streaming', content=''）并写入 IndexedDB
- SSE 解析 delta → 更新 store；写盘节流 500ms，结束/错误时最终写一次
- AbortController 中止：节点 status='done'（保留已生成内容）或 'error'（用户决定）
- 错误：节点上显示错误 banner + "重试"按钮（重试只对该叶子节点重新发请求；不影响其他分支）

### 主题与 i18n
- shadcn 默认 light / dark / system 三档切换
- UI 文案中文为主，关键技术术语保留英文（Session、Prompt、Provider、Model 等）

### Markdown 能力
- GFM 表格 / 任务列表 / 删除线
- 代码块语法高亮（`rehype-highlight`，按需主题）
- 数学公式（`rehype-katex`）
- Mermaid 不做（留待后续）

---

## 可选 Node Proxy 设计（CORS 兜底）

仓库根下 `proxy/` 目录，**默认不启动**。仅当用户在设置页打开"使用本地 proxy"开关时，前端把请求改投到 proxy。

- `proxy/server.mjs`：纯 Node `http` 模块（零依赖）启动一个 localhost:8787 服务
- 仅监听 `127.0.0.1`，**不接受非本地连接**
- 接受 `POST /forward`，body 为 `{ url, init }` 形式或直接转发整个请求
  - 推荐方案：客户端把目标 URL 放进 `X-Upstream-URL` header，proxy 校验该 URL 在白名单前缀内（白名单从 `PROXY_UPSTREAMS` 环境变量或默认 OpenAI/DeepSeek/Moonshot/localhost 派生），通过则透传 method/body/Authorization，并加 `Access-Control-Allow-Origin: *`
- 支持流式响应（`Transfer-Encoding: chunked`，按 chunk 透传）
- `pnpm proxy` 启动；README 说明用法和安全注意

前端 `lib/llm.ts` 根据设置选择直连 or 走 proxy：
```ts
const url = settings.proxy.enabled
  ? `${settings.proxy.url}/forward`
  : `${provider.baseUrl}/chat/completions`;
const headers = settings.proxy.enabled
  ? { 'X-Upstream-URL': `${provider.baseUrl}/chat/completions`, ... }
  : { ... };
```

---

## 实施里程碑（建议提交顺序）

1. **骨架**：Vite + TS + Tailwind + shadcn 初始化，三栏布局空壳，路由（`/`, `/settings`），ThemeProvider
2. **设置页**：Dexie schema + ProvidersPage CRUD + 内置预设
3. **LLM 通路**：`lib/llm.ts` SSE 客户端 + 一个临时纵向页面验证流式 + Markdown 渲染
4. **数据层**：sessionsStore / treeStore / settingsStore 完整 CRUD，IndexedDB 节流写盘
5. **画布**：React Flow + AnswerNode + PromptEdge + dagre 自动布局（先静态假数据）
6. **打通**：发送 prompt → 创建 edge + 流式 node → 实时重排 → detail panel 显示完整内容
7. **多分支交互**：节点 hover ➕、面包屑、选中态、edge 选中详情
8. **侧栏**：SessionList CRUD + 搜索框 + 切换 session + EmptyState
9. **画布增强**：MiniMap + Controls + Toolbar + 路径高亮 + 子树折叠（含持久化）
10. **可选 proxy**：实现 `proxy/server.mjs` 与 settings 中的开关
11. **打磨**：错误重试、中止、暗色模式、键盘快捷键（Cmd+Enter / Esc / Cmd+N）

---

## 后续版本待办（写入 ROADMAP，本次不做）

- 文本选中级分叉（在回答中选中某段话发起子提问，作为 emphasis 注入）
- 编辑历史：编辑 prompt 后下游重跑、单独重新生成某节点
- **结构化 LLM 输出**：让模型返回 JSON `{title, summary, concepts[], answerMarkdown}`，节点上展示标题 / 关键词 chip。教学场景配合较强模型（如 GPT-4o / Claude 3.7+）效果会很好；MVP 先不依赖
- 导出 / 导入 JSON；导出 Markdown / 图片
- 分享链接（需后端）
- API Key 主密码加密（WebCrypto 对称加密）
- 节点手动拖动并持久化位置
- PWA（installable + 离线壳）
- Mermaid、图片上传、附件
- LLM 自动命名 session 标题
- 多端同步、登录、计费

---

## 关键文件清单（实施时主要新建/编辑）

- `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `index.html`
- `src/main.tsx`, `src/app/App.tsx`, `src/app/ThemeProvider.tsx`
- `src/lib/db.ts`（Dexie schema + 迁移）
- `src/lib/llm.ts`（SSE 客户端 + AbortController）
- `src/lib/context.ts`（路径回溯 → messages）
- `src/lib/summary.ts`（折叠态前 N 行摘要）
- `src/lib/markdown.tsx`
- `src/stores/sessionsStore.ts`, `src/stores/treeStore.ts`, `src/stores/settingsStore.ts`
- `src/components/canvas/{TreeCanvas,AnswerNode,PromptEdge,EmptyState,layout,pathHighlight}.tsx`
- `src/components/sidebar/SessionList.tsx`
- `src/components/detail/{DetailPanel,Breadcrumbs,AskBox}.tsx`
- `src/components/settings/ProvidersPage.tsx`
- `proxy/server.mjs`, `proxy/README.md`（可选 CORS 兜底）

无现成可复用代码（项目目录为空）。

---

## 验证方法

端到端手工流程（无单元测试，MVP 自用）：

1. `pnpm install && pnpm dev` 启动 dev server，打开浏览器
2. 进入 `/settings`，点击 "OpenAI 官方" 预设 → 填入 apiKey → 保存
3. 回到首页，点 "+ 新建会话" → 画布出现中央大输入框
4. 输入第一个问题（例如"什么是 transformer"）→ 回车
5. 验证：边 + 流式节点出现，节点内容逐 token 追加；完成后 status 转 done
6. 在该节点 hover → 点 ➕ → 输入子问题 A → 出现第一条分支
7. 再次在父节点 hover → 点 ➕ → 输入子问题 B → 出现第二条平行分支（**两个分支视觉上垂直分开**）
8. 在分支 A 的叶子节点继续追问 → 验证只把分支 A 的上下文（不含 B）发给 LLM——可在 DevTools Network 里查 request body 的 messages 序列
9. 选中边 → 底部 detail panel 显示完整 prompt
10. 选中节点 → detail panel 显示完整 markdown，代码块高亮、公式（如 `$E=mc^2$`）渲染
11. 流式中点 "中止" → 节点保留已生成内容
12. 切换 light / dark 主题
13. 刷新页面 → sessions、nodes、edges、providers 全部恢复（IndexedDB 持久化生效）
14. 在 Sessions 侧栏右键 → 重命名 / 删除（含二次确认）；在搜索框输入关键字验证过滤生效
15. 选中任一深层节点 → 验证从 root 到该节点的路径在画布上整体高亮
16. 在中间节点点击折叠按钮 → 子树消失、出现 `+N` badge；展开后子树位置一致
17. DevTools → Application → IndexedDB 查看表结构与数据是否一致
18. （可选 proxy 路径）`pnpm proxy` 启动本地 proxy → 设置页打开开关 → 重新发送一条 prompt → DevTools 看到请求转向 `localhost:8787`，响应仍为流式
