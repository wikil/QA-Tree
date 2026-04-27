import { create } from 'zustand';
import { db, KV_KEYS } from '@/lib/db';
import { newId } from '@/lib/ids';
import { buildMessages } from '@/lib/context';
import { LLMError, streamChat } from '@/lib/llm';
import { useSessionsStore } from '@/stores/sessionsStore';
import type {
  FinishReason,
  NodeStatus,
  ProviderConfig,
  ProxyConfig,
  QAEdge,
  QANode,
} from '@/types';

const FLUSH_DELAY_MS = 500;

interface SendPromptArgs {
  parentNodeId: string;
  prompt: string;
  provider: ProviderConfig;
  proxy: ProxyConfig;
}

interface RetryArgs {
  provider: ProviderConfig;
  proxy: ProxyConfig;
}

interface TreeState {
  loadedSessionId: string | null;
  nodes: Map<string, QANode>;
  edges: Map<string, QAEdge>;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  collapsedNodeIds: Set<string>;
  /** Set during runStream; cleared on done/abort/error. Single source of truth for "is anything streaming right now". */
  streamingNodeIds: Set<string>;

  loadSession: (sessionId: string | null) => Promise<void>;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  toggleCollapse: (nodeId: string) => Promise<void>;
  expandAll: () => Promise<void>;
  collapseAll: () => Promise<void>;

  sendPrompt: (args: SendPromptArgs) => Promise<void>;
  retryNode: (nodeId: string, args: RetryArgs) => Promise<void>;
  abortStream: (nodeId: string) => void;
}

// 模块级流式控制器与节流计时器：与 store 解耦，避免 set() 反复创建新引用
const streamControllers = new Map<string, AbortController>();
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

function snapshotNode(state: TreeState, id: string): QANode | undefined {
  return state.nodes.get(id);
}

async function flushNode(id: string): Promise<void> {
  const timer = flushTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    flushTimers.delete(id);
  }
  const node = useTreeStore.getState().nodes.get(id);
  if (node) await db.nodes.put(node);
}

function scheduleFlush(id: string) {
  if (flushTimers.has(id)) return; // 已在等待，沿用已有定时器（leading throttle）
  const t = setTimeout(() => {
    flushTimers.delete(id);
    const node = useTreeStore.getState().nodes.get(id);
    if (node) void db.nodes.put(node);
  }, FLUSH_DELAY_MS);
  flushTimers.set(id, t);
}

async function readCollapsed(sessionId: string): Promise<Set<string>> {
  const rec = await db.kv.get(KV_KEYS.collapsedSubtrees);
  const map = (rec?.value as Record<string, string[]> | undefined) ?? {};
  return new Set(map[sessionId] ?? []);
}

async function writeCollapsed(sessionId: string, ids: Set<string>): Promise<void> {
  const rec = await db.kv.get(KV_KEYS.collapsedSubtrees);
  const map = (rec?.value as Record<string, string[]> | undefined) ?? {};
  if (ids.size === 0) {
    delete map[sessionId];
  } else {
    map[sessionId] = Array.from(ids);
  }
  await db.kv.put({ key: KV_KEYS.collapsedSubtrees, value: map });
}

function updateNode(id: string, patch: Partial<QANode>) {
  useTreeStore.setState((s) => {
    const cur = s.nodes.get(id);
    if (!cur) return s;
    const next = new Map(s.nodes);
    next.set(id, { ...cur, ...patch });
    return { nodes: next };
  });
}

function abortAndCleanup(nodeId: string) {
  const ctl = streamControllers.get(nodeId);
  if (ctl && !ctl.signal.aborted) ctl.abort();
  streamControllers.delete(nodeId);
}

function markStreaming(nodeId: string, on: boolean) {
  useTreeStore.setState((s) => {
    const next = new Set(s.streamingNodeIds);
    if (on) next.add(nodeId);
    else next.delete(nodeId);
    return { streamingNodeIds: next };
  });
}

async function runStream(args: {
  nodeId: string;
  parentNodeId: string;
  promptForContext: string;
  provider: ProviderConfig;
  proxy: ProxyConfig;
}) {
  const { nodeId, parentNodeId, promptForContext, provider, proxy } = args;
  const ctl = new AbortController();
  streamControllers.set(nodeId, ctl);
  markStreaming(nodeId, true);

  try {
    const state = useTreeStore.getState();
    let messages: ReturnType<typeof buildMessages>;
    try {
      messages = buildMessages({
        nodes: state.nodes,
        edges: state.edges,
        parentNodeId,
        userPrompt: promptForContext,
        provider,
      });
    } catch (e) {
      updateNode(nodeId, {
        status: 'error',
        finishReason: 'error',
        errorMessage: `构造上下文失败：${(e as Error).message}`,
      });
      return;
    }

    const result = await streamChat({
      provider,
      proxy,
      messages,
      signal: ctl.signal,
      onDelta: (_, full) => {
        updateNode(nodeId, { content: full });
        scheduleFlush(nodeId);
      },
    });

    let status: NodeStatus;
    let finishReason: FinishReason;
    if (ctl.signal.aborted || result.finishReason === 'abort') {
      status = 'aborted';
      finishReason = 'abort';
    } else {
      status = 'done';
      finishReason = result.finishReason;
    }
    updateNode(nodeId, {
      content: result.content,
      status,
      finishReason,
      model: result.model ?? provider.defaultModel,
      tokenUsage: result.usage,
      errorMessage: undefined,
    });
  } catch (e) {
    if (ctl.signal.aborted) {
      updateNode(nodeId, { status: 'aborted', finishReason: 'abort' });
    } else {
      const msg =
        e instanceof LLMError ? e.message : `请求失败：${(e as Error).message}`;
      updateNode(nodeId, {
        status: 'error',
        finishReason: 'error',
        errorMessage: msg,
      });
    }
  } finally {
    streamControllers.delete(nodeId);
    markStreaming(nodeId, false);
    await flushNode(nodeId);
  }
}

export const useTreeStore = create<TreeState>((set, get) => ({
  loadedSessionId: null,
  nodes: new Map(),
  edges: new Map(),
  selectedNodeId: null,
  selectedEdgeId: null,
  collapsedNodeIds: new Set(),
  streamingNodeIds: new Set(),

  loadSession: async (sessionId) => {
    // Idempotent: same session already loaded → no-op (callers can fire-and-forget).
    if (get().loadedSessionId === sessionId) return;

    for (const id of streamControllers.keys()) abortAndCleanup(id);
    for (const id of flushTimers.keys()) await flushNode(id);

    if (!sessionId) {
      set({
        loadedSessionId: null,
        nodes: new Map(),
        edges: new Map(),
        selectedNodeId: null,
        selectedEdgeId: null,
        collapsedNodeIds: new Set(),
        streamingNodeIds: new Set(),
      });
      return;
    }

    const [nodes, edges, collapsed] = await Promise.all([
      db.nodes.where('sessionId').equals(sessionId).toArray(),
      db.edges.where('sessionId').equals(sessionId).toArray(),
      readCollapsed(sessionId),
    ]);
    set({
      loadedSessionId: sessionId,
      nodes: new Map(nodes.map((n) => [n.id, n])),
      edges: new Map(edges.map((e) => [e.id, e])),
      selectedNodeId: null,
      selectedEdgeId: null,
      collapsedNodeIds: collapsed,
      streamingNodeIds: new Set(),
    });
  },

  selectNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
  selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),

  toggleCollapse: async (nodeId) => {
    const sessionId = get().loadedSessionId;
    if (!sessionId) return;
    const next = new Set(get().collapsedNodeIds);
    if (next.has(nodeId)) next.delete(nodeId);
    else next.add(nodeId);
    set({ collapsedNodeIds: next });
    await writeCollapsed(sessionId, next);
  },

  expandAll: async () => {
    const sessionId = get().loadedSessionId;
    if (!sessionId) return;
    set({ collapsedNodeIds: new Set() });
    await writeCollapsed(sessionId, new Set());
  },

  collapseAll: async () => {
    const sessionId = get().loadedSessionId;
    if (!sessionId) return;
    // 折叠所有非叶子的 assistant 节点
    const nodes = get().nodes;
    const edges = get().edges;
    const hasChildren = new Set<string>();
    for (const e of edges.values()) hasChildren.add(e.fromNodeId);
    const next = new Set<string>();
    for (const n of nodes.values()) {
      if (n.role === 'assistant' && hasChildren.has(n.id)) next.add(n.id);
    }
    set({ collapsedNodeIds: next });
    await writeCollapsed(sessionId, next);
  },

  sendPrompt: async ({ parentNodeId, prompt, provider, proxy }) => {
    const sessionId = get().loadedSessionId;
    if (!sessionId) throw new Error('没有载入的 session');
    const parent = snapshotNode(get(), parentNodeId);
    if (!parent) throw new Error(`父节点不存在：${parentNodeId}`);

    const now = Date.now();
    const edgeId = newId();
    const nodeId = newId();
    const edge: QAEdge = {
      id: edgeId,
      sessionId,
      fromNodeId: parentNodeId,
      toNodeId: nodeId,
      prompt,
      createdAt: now,
    };
    const node: QANode = {
      id: nodeId,
      sessionId,
      parentEdgeId: edgeId,
      role: 'assistant',
      content: '',
      status: 'streaming',
      model: provider.defaultModel,
      createdAt: now,
    };

    // 先落盘再流式（核心不变量）
    await db.transaction('rw', db.nodes, db.edges, async () => {
      await db.edges.put(edge);
      await db.nodes.put(node);
    });

    set((s) => {
      const nodes = new Map(s.nodes);
      const edges = new Map(s.edges);
      nodes.set(nodeId, node);
      edges.set(edgeId, edge);
      return { nodes, edges, selectedNodeId: nodeId, selectedEdgeId: null };
    });

    // 同步 touch session 的 updatedAt
    void useSessionsStore.getState().touchSession(sessionId);

    await runStream({
      nodeId,
      parentNodeId,
      promptForContext: prompt,
      provider,
      proxy,
    });
  },

  retryNode: async (nodeId, { provider, proxy }) => {
    const sessionId = get().loadedSessionId;
    if (!sessionId) throw new Error('没有载入的 session');
    const node = snapshotNode(get(), nodeId);
    if (!node) throw new Error(`节点不存在：${nodeId}`);
    if (!node.parentEdgeId) throw new Error('root 节点不可重试');
    const edge = get().edges.get(node.parentEdgeId);
    if (!edge) throw new Error('入边缺失');

    const existingCtl = streamControllers.get(nodeId);
    if (get().streamingNodeIds.has(nodeId) || (existingCtl && !existingCtl.signal.aborted)) {
      return;
    }

    abortAndCleanup(nodeId);

    updateNode(nodeId, {
      content: '',
      status: 'streaming',
      finishReason: undefined,
      errorMessage: undefined,
      model: provider.defaultModel,
      tokenUsage: undefined,
    });
    await flushNode(nodeId);
    void useSessionsStore.getState().touchSession(sessionId);

    await runStream({
      nodeId,
      parentNodeId: edge.fromNodeId,
      promptForContext: edge.prompt,
      provider,
      proxy,
    });
  },

  abortStream: (nodeId) => {
    abortAndCleanup(nodeId);
  },
}));

export const selectChildEdges = (parentNodeId: string) => (state: TreeState) =>
  Array.from(state.edges.values()).filter((e) => e.fromNodeId === parentNodeId);
