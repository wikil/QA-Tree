# AGENTS.md

Guidance for Codex (and other coding agents) working in this repository. Mirrors `CLAUDE.md` — keep both in sync when long-lived rules change.

## Core Principles

1. KISS / DRY / SoC
2. **Keep AGENTS.md concise** — 长效原则放这里，实施细节放设计文档
3. **Ask Before Assuming** — 需求模糊或技术上无法判定时主动确认，附推荐方案与理由

## Project

**QA-Tree** — 纯前端、树状递归问答 Web 应用。

> 用 LLM 深度学习一个主题时，沿任一回答的某个概念分叉延伸，多分叉互不污染——这就是"递归式学习法"。

- **画布**：横向树（dagre LR），节点 = AI 回答，边 = 用户 prompt
- **上下文**：严格沿 `root → 当前节点` 路径传递；**兄弟分支彼此隔离**（项目灵魂）
- **LLM**：用户自填 OpenAI 兼容 key，浏览器 SSE 直连
- **数据**：全部存 IndexedDB，**无后端**；附可选本地 Node CORS proxy（默认不启动）

完整设计、技术栈、数据模型、目录结构、交互规范、里程碑、验收清单 → **`.claude/plans/abstract-doodling-flamingo.md`（实施唯一依据）**。

## Tech Stack

Vite + React 18 + TS · Tailwind + shadcn/ui · `@xyflow/react` v12 + dagre · Zustand · Dexie · `react-markdown` (gfm + highlight + katex) · 原生 fetch SSE

## Architectural Invariants（容易踩坑，写代码前必读）

1. **Path-based context = 项目灵魂**：构造 LLM messages 时**只**走 root → 当前节点路径，绝不混入兄弟分支。算法集中于 `src/lib/context.ts`，所有调用方走它，禁止旁路。
2. **先落盘再流式**：发送时**同步**写入 `QAEdge` + `QANode(status='streaming', content='')`；SSE delta 仅更新 store，**写盘节流 500ms**；done / abort / error 时最终落一次。这样刷新后流式中断的节点也能保留已生成内容。
3. **折叠是渲染层，不是数据层**：折叠状态保存在 `treeStore` + IndexedDB（per session），布局前过滤掉折叠子树再交 dagre；**节点/边数据本身不动**。
4. **Dexie 是数据契约**：UI 不直接读 Dexie，只读 store；schema 演进必走 Dexie 版本迁移。
5. **Provider 解耦**：所有 LLM 请求经 `src/lib/llm.ts`，按 settings 决定直连 vs 本地 proxy；新增 provider = 加预设按钮，**不改调用代码**。
6. **API key 仅明文存 IndexedDB**：UI 必须掩码 + 顶部安全提示横幅；加密留待后续，**MVP 不引入 WebCrypto**。

## Dev Commands

```bash
pnpm install
pnpm dev          # Vite dev server
pnpm build
pnpm proxy        # 可选 CORS 兜底，仅监听 127.0.0.1:8787
```

> 项目目录初始为空，按设计文档第 11 节里程碑顺序实施。包管理器统一 **pnpm**。

## Validation

无单元测试（MVP 自用）。改动后请按设计文档第 14 节端到端手工流程在浏览器自检：流式、分支隔离（DevTools Network 看 messages 序列）、刷新恢复、折叠展开、light/dark 切换、IndexedDB 表结构。

## Global Rules

- **不做范围外功能**：设计文档"后续版本待办"列表（文本选中级分叉、编辑历史、JSON 导入导出、PWA、Mermaid、主密码加密…）一律不在本次实现，遇到需求先记 ROADMAP。
- **No Breaking Changes to data schema**：Dexie 表结构改动必带版本迁移并验证旧数据；types/ 与 lib/db.ts 必须同步。
- **Git commit 前缀**：`[FE]`（前端）/ `[PROXY]`（可选 proxy）/ `[ROOT]`（配置/文档）。
- **同步两份指引**：当此处的长效规则变化，请同步更新 `CLAUDE.md`，反之亦然。

## Design Doc Context

`.claude/plans/abstract-doodling-flamingo.md` 是设计冻结文档。本 AGENTS.md 只承载**长效原则与红线**；任何"具体怎么做"的问题都先翻设计文档，**不要在 AGENTS.md 里复刻细节**。
