# QA-Tree

*English · [简体中文](./README.zh-CN.md)*

> *When you study a topic with an LLM in depth, you keep wanting to fork off any answer along a concept, follow that branch as far as it goes, and never have it pollute another line of inquiry.*
>
> *That's "recursive inquiry." QA-Tree turns it into an actual tree.*

A pure-frontend, local-first web app for tree-shaped recursive Q&A with LLMs. **Nodes are AI answers, edges are your prompts.** Ask follow-ups from any node to fork a new branch — and **sibling branches stay fully isolated from each other.**

```
┌─────────┐  Q1  ┌──────────────────┐  Q1.1  ┌──────────────────────┐
│  Start  │─────▶│  A: how does     │───────▶│ A: query/key/value   │
└─────────┘      │     attention    │        └──────────────────────┘
                 │     work?        │
                 └──────────────────┘
                        │  Q1.2 (cannot see Q1.1)
                        ▼
                 ┌──────────────────┐  Q1.2.1  ┌────────────────────┐
                 │  A: why          │─────────▶│ A: heads as        │
                 │     multi-head?  │          │   subspace experts │
                 └──────────────────┘          └────────────────────┘
```

The context sent to the LLM for any branch walks **only** its own `root → current node` path. Sibling branches and unrelated ancestors never bleed in. This is the heart of the project.

---

## What it does

- **Horizontal tree canvas** — auto-layout via React Flow + dagre; nodes settle into place when added, when streaming finishes, or when subtrees fold
- **Path-only context** — `src/lib/context.ts` is the single source of truth; aborted nodes carry an explicit `[user aborted the answer above]` annotation when used as context
- **Persist-before-stream** — sending a prompt synchronously writes the `QAEdge` and `QANode(streaming, content='')` to IndexedDB; SSE deltas update the in-memory store with a 500 ms write-back; refreshing mid-stream keeps whatever was generated
- **Subtree folding** — folding is render-only state, persisted per session; node and edge data stay untouched
- **Markdown done right** — GFM tables, task lists, syntax highlighting (highlight.js), math (KaTeX)
- **Multiple providers** — built-in presets for OpenAI / DeepSeek / Moonshot / Ollama; any session can pin a specific provider
- **Local-first** — sessions, nodes, edges, and settings live in IndexedDB. **No backend, no telemetry.**
- **Optional CORS proxy** — only when the browser can't reach a provider directly (binds `127.0.0.1:8787` only)
- **Light / dark / system** — three-way theme; palette is parchment / graphite + a single ember accent

---

## Quick start

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm build        # outputs dist/
pnpm preview      # serves dist/
pnpm proxy        # optional CORS fallback, binds 127.0.0.1:8787
```

Use **pnpm** — don't mix in npm or yarn.

### Configure a provider

1. Open `/settings`
2. Read the safety banner at the top: **API keys are stored in plaintext in your browser's IndexedDB.** Don't use this on a device you don't trust; an encryption flow is on the roadmap.
3. Click any preset to fill `baseUrl` + recommended model (OpenAI / DeepSeek / Moonshot / Ollama)
4. Paste your API key, save
5. Hit **"Test connection / streaming"** on that row — seeing tokens stream in confirms the pipe works
6. Mark it as the default and start asking questions

> The most common direct-connection failure is CORS. Try fixing it on the provider side first (e.g. `OLLAMA_ORIGINS=* ollama serve`); only fall back to the local proxy ([`proxy/README.md`](proxy/README.md)) if you must.

---

## Stack

| Layer | Choice |
|---|---|
| Build | Vite 6 + React 18 + TypeScript 5 |
| Styling | Tailwind 3 + shadcn/ui (button / dialog / dropdown-menu / input / label / switch / textarea only) |
| Canvas | `@xyflow/react` v12 + `dagre` |
| State | Zustand 5 |
| Persistence | Dexie 4 (IndexedDB wrapper) |
| Markdown | `react-markdown` + `remark-gfm` + `remark-math` + `rehype-katex` + `rehype-highlight` |
| LLM | native `fetch` + `ReadableStream` SSE parsing — no SDK |
| Proxy (optional) | zero-dependency Node script (`proxy/server.mjs`) |

**What's not here:** backend, Redux/Recoil-style frameworks, CSS-in-JS, UI libs (MUI/AntD), vendor SDKs (`openai-node` / `anthropic-sdk`), telemetry.

---

## Architectural invariants (read before coding)

> Mirrored from `CLAUDE.md` / `AGENTS.md`. Changing any of these requires updating the design doc and this section together.

1. **Path-based context = the heart of the project**
   LLM messages are built **only** from the `root → current node` path. Never mix in sibling branches. The algorithm lives in `src/lib/context.ts`; every caller goes through it.

2. **Persist before streaming**
   On send, synchronously write the edge + the node (`status='streaming', content=''`). SSE deltas only update the store. Disk writes throttle to 500 ms. On done / abort / error, do one final synchronous write.

3. **Folding is a render-layer concern**
   Collapsed-node IDs live in `treeStore` + IndexedDB (per session). Filter them out before handing the graph to dagre. **Never mutate node or edge data when folding.**

4. **Dexie is the data contract**
   The UI reads from stores, not from Dexie directly. Schema changes go through Dexie versioned migrations; `src/types/` and `src/lib/db.ts` stay in lockstep.

5. **Provider decoupling**
   Every LLM call goes through `src/lib/llm.ts`, which decides direct vs proxy from settings. Adding a provider means adding a preset button — **no changes to call sites.**

6. **API keys are plaintext in IndexedDB**
   The UI must mask them and surface a safety banner. WebCrypto is deferred past MVP.

---

## Project structure

```
src/
├── app/
│   ├── App.tsx                      # three-pane shell + global shortcuts
│   └── ThemeProvider.tsx            # light / dark / system
├── components/
│   ├── canvas/
│   │   ├── TreeCanvas.tsx           # main React Flow canvas (store-driven)
│   │   ├── AnswerNode.tsx           # node card: model / summary / fold / retry / ➕
│   │   ├── PromptEdge.tsx           # smoothstep edge + label
│   │   ├── StartPill.tsx            # virtual root stand-in ("Start")
│   │   ├── EmptyState.tsx           # centered first-prompt for empty sessions
│   │   ├── DetailPanel.tsx          # bottom panel: breadcrumbs + full markdown
│   │   ├── AskBox.tsx               # always-on input bar (⌘↵ to send)
│   │   ├── CanvasToolbar.tsx        # fit / reset / fold-all / theme
│   │   ├── layout.ts                # dagre layout + folded-subtree filter
│   │   └── pathHighlight.ts         # path-highlight computation
│   ├── sidebar/SessionRow.tsx       # one session row: inline rename + delete confirm
│   ├── settings/ProvidersPage.tsx   # /settings page
│   ├── ui/                          # shadcn primitives
│   ├── Markdown.tsx                 # unified markdown renderer
│   └── ThemeToggle.tsx
├── stores/
│   ├── sessionsStore.ts             # session CRUD + current selection
│   ├── treeStore.ts                 # nodes/edges + streaming control for active session
│   └── settingsStore.ts             # providers + proxy switch
├── lib/
│   ├── context.ts                   # ⭐ path → messages (the soul)
│   ├── llm.ts                       # SSE client + AbortController
│   ├── db.ts                        # Dexie schema
│   ├── format.ts                    # time / token / summary formatting
│   ├── providerPresets.ts           # OpenAI / DeepSeek / Moonshot / Ollama
│   ├── ids.ts                       # nanoid wrapper
│   └── utils.ts                     # cn() and odds & ends
├── hooks/useResolvedProvider.ts     # session-pinned vs global default
├── types/index.ts                   # QANode / QAEdge / Session / ...
├── styles/index.css                 # tokens + qa-prose markdown styling
└── main.tsx                         # router + ThemeProvider mount

proxy/
├── server.mjs                       # zero-dep CORS proxy
└── README.md                        # protocol / whitelist / security notes

.claude/plans/abstract-doodling-flamingo.md   # frozen design document
```

---

## Keyboard shortcuts

| Keys | Action | Scope |
|---|---|---|
| `⌘N` / `Ctrl+N` | New session | Global |
| `⌘↵` / `Ctrl+↵` | Submit prompt in AskBox / EmptyState | Input focused |
| `Esc` | Clear canvas selection (node/edge) | No input focused |
| `Esc` | Cancel rename (revert title) | SessionRow inline-edit focused |
| Double-click a session row | Enter inline rename | Sidebar |
| Hover ➕ on a node | Branch from this node and move focus to AskBox | Canvas |

---

## Data & privacy

- **Everything lives in your browser.** Sessions, nodes, edges, providers, fold state are all in IndexedDB tied to this origin. Clear site data and they're gone. Manual backup (import/export) is on the roadmap.
- **API keys in plaintext.** Browsers don't have a real secret store. Plaintext is the honest answer. Make sure the device is yours.
- **Network paths.** Browser → provider (direct) or browser → `127.0.0.1:8787` → provider (proxy enabled). **No third-party hops, no analytics.**
- **The local proxy** binds to `127.0.0.1` only. Don't run it on a multi-user machine — anyone on that machine can reach it.

---

## Roadmap (post-v0)

- Selection-level forking (highlight a passage in an answer to spawn a child prompt with that as emphasis)
- JSON import / export; markdown / image export
- Edit-prompt-and-rerun-downstream history
- API-key encryption with a master password (WebCrypto symmetric)
- Structured LLM output: `{title, summary, concepts[], answerMarkdown}` → render titles + concept chips on nodes
- Auto-named sessions (LLM picks the title)
- PWA (installable + offline shell)
- Mermaid / image upload / attachments
- Multi-device sync, accounts, billing — at which point a backend becomes unavoidable

---

## Design doc & agent contracts

- Frozen design: [`.claude/plans/abstract-doodling-flamingo.md`](./.claude/plans/abstract-doodling-flamingo.md)
- Working notes for Claude Code: [`CLAUDE.md`](./CLAUDE.md)
- Working notes for Codex / other agents: [`AGENTS.md`](./AGENTS.md) (kept in lockstep with `CLAUDE.md`)

---

## Acknowledgements

The inspiration is any afternoon you've spent clicking through a dozen Wikipedia hyperlinks until you've forgotten what you were originally looking up. Externalising that branching curiosity onto a canvas is everything QA-Tree is trying to do.

The visual language is borrowed from a cartographer's notebook: parchment ground, graphite text, a single ember accent for the live trail, and Fraunces / Geist / JetBrains Mono in three weights. Restraint is the aesthetic.

---

*Personal project. License TBD; please open an issue before sending a PR so we can align on direction first.*
