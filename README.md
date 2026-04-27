# QA-Tree

*English · [简体中文](./README.zh-CN.md)*

> Study a topic with an LLM by forking off any answer along a concept — and never let one branch pollute another.

A pure-frontend, local-first web app for tree-shaped Q&A with LLMs. **Nodes are answers, edges are your prompts.** Each branch's context walks **only** its own `root → current node` path; siblings stay fully isolated. That's the whole point.

```
Start ──Q1──▶ A: attention?     ──Q1.1──▶ A: query/key/value
                  │
                  └──Q1.2 (cannot see Q1.1)──▶ A: multi-head?
```

## Quick start

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm build
pnpm proxy        # optional CORS fallback, 127.0.0.1:8787 only
```

Open `/settings`, pick a preset (OpenAI / DeepSeek / Moonshot / Ollama), paste your API key, hit **Test streaming**, set as default.

> Direct-connect failures are usually CORS. Fix it on the provider first (e.g. `OLLAMA_ORIGINS=* ollama serve`); fall back to the local proxy only if you must.

## Stack

Vite + React 18 + TS · Tailwind + shadcn/ui · `@xyflow/react` v12 + dagre · Zustand · Dexie · `react-markdown` (gfm + highlight + katex) · native `fetch` SSE.

No backend, no SDKs, no telemetry.

## Privacy

Sessions, providers, fold state — all in your browser's IndexedDB. **API keys are stored in plaintext** (browsers have no real secret store; encryption is on the roadmap). Use on a device you trust. The optional proxy binds `127.0.0.1` only; don't run it on a multi-user machine.

## More

- Frozen design: [`.claude/plans/abstract-doodling-flamingo.md`](./.claude/plans/abstract-doodling-flamingo.md)
- Architectural invariants & dev rules: [`CLAUDE.md`](./CLAUDE.md) · [`AGENTS.md`](./AGENTS.md)
- Optional proxy: [`proxy/README.md`](./proxy/README.md)

---

*Personal project. License TBD — open an issue before sending a PR.*
