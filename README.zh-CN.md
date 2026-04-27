# QA-Tree

*[English](./README.md) · 简体中文*

> *用 LLM 深度学习一个主题时，沿任一回答的某个概念分叉延伸，多分叉互不污染。*
>
> *这就是「递归式学习法」。QA-Tree 把它做成一棵真正的树。*

一款纯前端、本地优先的树状递归问答 Web 应用。**节点 = AI 回答，边 = 用户的提问**；可在任意节点继续追问，长出新的分支，**兄弟分支彼此完全隔离**。

```
┌─────────┐  Q1  ┌──────────────┐  Q1.1  ┌─────────────────┐
│  Start  │─────▶│  A: 注意力机制 │───────▶│ A: query/key/value │
└─────────┘      │   是怎么算的？ │        └─────────────────┘
                 └──────────────┘
                        │  Q1.2 (与 Q1.1 互不污染)
                        ▼
                 ┌──────────────┐  Q1.2.1  ┌────────────────┐
                 │ A: 多头注意力  │─────────▶│ A: 为什么要分头  │
                 │   有什么用？   │          └────────────────┘
                 └──────────────┘
```

任何一支分叉发往 LLM 的上下文，**只**走它自己 `root → 当前节点` 的路径；横向兄弟、纵向无关祖辈一律不染指。这一点是项目的灵魂。

---

## 它能做什么

- **横向树画布** — 基于 React Flow + dagre 的自动布局，节点固定卡片样式，新增/流式完成自动重排
- **沿路径回溯的上下文** — `src/lib/context.ts` 是唯一来源，禁止旁路；中止过的节点会带 `[用户中止了上面的回答]` 标注
- **流式渲染 + 先落盘** — 发送时同步写 `QAEdge` + `QANode(streaming)`，SSE delta 节流 500ms 写回 IndexedDB；刷新后流式被打断的节点也能保留已生成的内容
- **折叠子树** — 折叠是渲染层，节点数据不动；折叠状态 per-session 持久化
- **Markdown 全套** — GFM 表格 / 任务列表 / 代码高亮（highlight.js）/ 公式（KaTeX）
- **多 Provider 并行配置** — 内置 OpenAI / DeepSeek / Moonshot / Ollama 预设，自由 baseUrl 与模型；每条 session 可锁一个 provider
- **本地优先** — 所有 sessions / nodes / edges / settings 全部在浏览器 IndexedDB 里，**无后端、无遥测**
- **可选本地 CORS proxy** — 浏览器直连不通时再启用（仅监听 `127.0.0.1:8787`）
- **明亮 / 暗色 / 跟随系统** — 三档主题切换，色板：parchment / graphite + ember accent

---

## 上手

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm build        # 生成 dist/
pnpm preview      # 预览 dist/
pnpm proxy        # 可选 CORS 兜底，仅监听 127.0.0.1:8787
```

包管理器统一 **pnpm**（不要混用 npm/yarn）。

### 配置一个 Provider

1. 打开 `/settings`
2. 顶部安全提示横幅请认真读一遍：**API key 仅明文存在你浏览器的 IndexedDB**，不要在不可信设备上使用；想要更高安全性等加密功能（待办）
3. 点任意预设按钮一键填入 baseUrl + 推荐模型（仅 OpenAI / DeepSeek / Moonshot / Ollama 四个）
4. 填入 apiKey，保存
5. 行内点 **「测试连接 / 测试流式」** —— 看到 token 流入即代表通路打通
6. 把这个 provider 设为「默认」，回首页开始问

> 直连失败常见原因：CORS。优先尝试 provider 端解决（如 Ollama: `OLLAMA_ORIGINS=* ollama serve`）；不行再开本地 proxy（见 [`proxy/README.md`](proxy/README.md)）。

---

## 技术栈

| 层 | 选型 |
|---|---|
| 构建 | Vite 6 + React 18 + TypeScript 5 |
| 样式 | Tailwind 3 + shadcn/ui（仅 button / dialog / dropdown-menu / input / label / switch / textarea） |
| 画布 | `@xyflow/react` v12 + `dagre` |
| 状态 | Zustand 5 |
| 持久化 | Dexie 4（IndexedDB 封装） |
| Markdown | `react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex` + `rehype-highlight` |
| LLM | 原生 `fetch` + `ReadableStream` 解析 SSE，无 SDK |
| Proxy（可选） | 零依赖 Node 脚本（`proxy/server.mjs`） |

**没有**：后端、状态管理框架（Redux/Recoil）、CSS-in-JS、UI lib（MUI/AntD）、SDK（openai-node/anthropic-sdk）、telemetry。

---

## 架构红线（写代码前必读）

> 与 `CLAUDE.md` / `AGENTS.md` 保持一致；改动这些不变量必须同步设计文档与本节。

1. **Path-based context = 项目灵魂**
   构造 LLM messages 只走 `root → 当前节点` 路径，绝不混入兄弟分支。算法集中于 `src/lib/context.ts`，所有调用方走它。

2. **先落盘再流式**
   发送时同步写入 edge + 节点（`status='streaming', content=''`）；SSE delta 仅更新 store，写盘节流 500ms；done / abort / error 时最终落一次。

3. **折叠是渲染层**
   折叠状态保存在 `treeStore` + IndexedDB（per session），布局前过滤掉折叠子树再交 dagre。**节点/边数据本身不动。**

4. **Dexie 是数据契约**
   UI 不直接读 Dexie，只读 store；schema 演进必走 Dexie 版本迁移；`src/types/` 与 `src/lib/db.ts` 必须同步。

5. **Provider 解耦**
   所有 LLM 请求经 `src/lib/llm.ts`，按 settings 决定直连还是走 proxy；新增 provider = 加一条预设按钮，**不改调用代码**。

6. **API key 明文存 IndexedDB**
   UI 必须掩码显示 + 顶部安全提示横幅；MVP 不引入 WebCrypto。

---

## 项目结构

```
src/
├── app/
│   ├── App.tsx                      # 三栏布局 + 全局快捷键
│   └── ThemeProvider.tsx            # light / dark / system
├── components/
│   ├── canvas/
│   │   ├── TreeCanvas.tsx           # React Flow 主画布（store-driven）
│   │   ├── AnswerNode.tsx           # 节点卡片：模型 / 摘要 / 折叠 / 重生成 / ➕
│   │   ├── PromptEdge.tsx           # 边：smoothstep + 标签
│   │   ├── StartPill.tsx            # 虚拟 root 替身（"Start"）
│   │   ├── EmptyState.tsx           # 新 session 的中央首问
│   │   ├── DetailPanel.tsx          # 底部面包屑 + 完整 markdown
│   │   ├── AskBox.tsx               # 底部常驻输入条（⌘↵ 送出）
│   │   ├── CanvasToolbar.tsx        # fit / reset / 折叠所有 / 主题
│   │   ├── layout.ts                # dagre 布局 + 折叠过滤
│   │   └── pathHighlight.ts         # 路径高亮计算
│   ├── sidebar/SessionRow.tsx       # 单会话行：内联重命名 + 删除确认
│   ├── settings/ProvidersPage.tsx   # /settings 页面
│   ├── ui/                          # shadcn 原语
│   ├── Markdown.tsx                 # 统一 markdown 渲染
│   └── ThemeToggle.tsx
├── stores/
│   ├── sessionsStore.ts             # sessions CRUD + 当前选中
│   ├── treeStore.ts                 # 单个 session 的 nodes/edges/流式控制
│   └── settingsStore.ts             # providers + proxy 开关
├── lib/
│   ├── context.ts                   # ⭐ 路径回溯 → messages（项目灵魂）
│   ├── llm.ts                       # SSE 客户端 + AbortController
│   ├── db.ts                        # Dexie schema
│   ├── format.ts                    # 时间 / token / 摘要格式化
│   ├── providerPresets.ts           # OpenAI / DeepSeek / Moonshot / Ollama
│   ├── ids.ts                       # nanoid 包装
│   └── utils.ts                     # cn() + 杂项
├── hooks/useResolvedProvider.ts     # session-pinned vs 全局默认
├── types/index.ts                   # QANode / QAEdge / Session / ...
├── styles/index.css                 # tokens + qa-prose markdown
└── main.tsx                         # 路由 + ThemeProvider 装载

proxy/
├── server.mjs                       # 零依赖 CORS proxy
└── README.md                        # 协议 / 白名单 / 安全说明

.claude/plans/abstract-doodling-flamingo.md   # 设计冻结文档
```

---

## 键盘快捷键

| 快捷键 | 功能 | 范围 |
|---|---|---|
| `⌘N` / `Ctrl+N` | 新建 session | 全局 |
| `⌘↵` / `Ctrl+↵` | 在 AskBox / EmptyState 送出 prompt | 输入框聚焦时 |
| `Esc` | 取消画布选中（节点/边） | 输入框未聚焦时 |
| `Esc` | 取消重命名（恢复原标题） | SessionRow 内联编辑时 |
| 双击 session 行 | 进入内联重命名 | 侧栏 |
| 节点 hover ➕ | 在该节点下创建分支并把焦点送进 AskBox | 画布 |

---

## 数据与隐私

- **数据全部存在浏览器**：sessions / nodes / edges / providers / 折叠状态都在 IndexedDB 里，对应 origin 一旦清空就消失。建议偶尔手动备份（导入导出在 Roadmap）
- **API key 明文**：浏览器没有真正的 secret store，明文是诚实的现实。请确保使用工具的设备只有你能访问
- **请求路径**：浏览器 → provider（直连）/ 浏览器 → `127.0.0.1:8787` → provider（开 proxy 时）。**没有第三方中转，没有遥测**
- **本地 proxy** 仅绑定 `127.0.0.1`，远程主机无法连接；多用户共享机器请勿启动

---

## Roadmap（v0 之外）

- 文本选中级分叉（在回答中选中某段话发起子提问，作为 emphasis 注入）
- JSON 导入 / 导出；Markdown / 图片导出
- 编辑历史：编辑过的 prompt 触发下游重跑
- API key 主密码加密（WebCrypto 对称加密）
- 结构化 LLM 输出：`{title, summary, concepts[], answerMarkdown}` → 节点上展示标题 + 关键词 chip
- LLM 自动命名 session 标题
- PWA（installable + 离线壳）
- Mermaid / 图片上传 / 附件
- 多端同步、登录、计费 ← 那就需要后端了

---

## 设计文档与代理协议

- 完整设计冻结：[`.claude/plans/abstract-doodling-flamingo.md`](./.claude/plans/abstract-doodling-flamingo.md)
- Claude Code 工作约定：[`CLAUDE.md`](./CLAUDE.md)
- Codex / 其他 agent 工作约定：[`AGENTS.md`](./AGENTS.md)（与 CLAUDE.md 同步）

---

## 致谢

灵感来自任何一个曾经在维基百科里点开十几个超链接、最后忘了自己最初想查什么的下午。把那种「分叉式追问」从大脑外化成画布，是 QA-Tree 想做的全部事情。

视觉语言取自地图绘制师笔记本：parchment 底、graphite 字、ember accent 的描红、Fraunces / Geist / JetBrains Mono 三体字。克制为美。

---

*Personal project. 默认 license TBD；提交 PR 前请先开 issue 对齐方向。*
