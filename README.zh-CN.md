# QA-Tree

*[English](./README.md) · 简体中文*

> 用 LLM 深入学一个主题时，沿任一回答的某个概念分叉延伸，多分叉互不污染。

纯前端、本地优先的树状递归问答 Web 应用。**节点 = AI 回答，边 = 你的提问**。每条分支发往 LLM 的上下文**只**走它自己 `root → 当前节点` 的路径，兄弟分支彼此完全隔离——这是项目的灵魂。

```
Start ──Q1──▶ A: 注意力机制？  ──Q1.1──▶ A: query/key/value
                 │
                 └──Q1.2 (看不到 Q1.1)──▶ A: 为什么多头？
```

## 上手

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm build
pnpm proxy        # 可选 CORS 兜底，仅监听 127.0.0.1:8787
```

打开 `/settings`，点预设按钮（OpenAI / DeepSeek / Moonshot / Ollama）一键填 baseUrl + 模型，粘 API key，点 **测试流式**，设为默认即可。

> 直连失败大多是 CORS，优先在 provider 端解决（如 `OLLAMA_ORIGINS=* ollama serve`）；不行再开本地 proxy。

## 技术栈

Vite + React 18 + TS · Tailwind + shadcn/ui · `@xyflow/react` v12 + dagre · Zustand · Dexie · `react-markdown`（gfm + highlight + katex）· 原生 `fetch` SSE。

无后端、无 SDK、无遥测。

## 数据与隐私

所有 sessions / providers / 折叠状态都在浏览器 IndexedDB。**API key 明文存储**（浏览器没有真正的 secret store，加密在 Roadmap）。请在你信任的设备上使用。本地 proxy 仅绑 `127.0.0.1`，多用户共享机器勿启。

## 延伸

- 设计冻结文档：[`.claude/plans/abstract-doodling-flamingo.md`](./.claude/plans/abstract-doodling-flamingo.md)
- 架构红线与开发约定：[`CLAUDE.md`](./CLAUDE.md) · [`AGENTS.md`](./AGENTS.md)
- 可选 proxy：[`proxy/README.md`](./proxy/README.md)

---

*Personal project. License TBD；提 PR 前请先开 issue 对齐方向。*
