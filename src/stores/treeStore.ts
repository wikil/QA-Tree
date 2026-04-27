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
  /** Active streaming session. Same session may have multiple concurrent streams. */
  activeStreamSessionId: string | null;
  /** Streaming nodes for the currently loaded session only. */
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
  abortSessionStreams: (sessionId: string) => void;
}

interface StreamRecord {
  runId: string;
  sessionId: string;
  nodeId: string;
  controller: AbortController;
  node: QANode;
  deleted: boolean;
}

// Module-level stream records keep in-flight requests alive while the user views
// another session. Deltas always persist through IndexedDB and only mirror into
// the Zustand store when their session is currently loaded.
const streamRecords = new Map<string, StreamRecord>();
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

function snapshotNode(state: TreeState, id: string): QANode | undefined {
  return state.nodes.get(id);
}

function getActiveStreamSessionId(): string | null {
  for (const rec of streamRecords.values()) {
    if (!rec.deleted) return rec.sessionId;
  }
  return null;
}

function getStreamingNodeIdsForSession(sessionId: string | null): Set<string> {
  if (!sessionId) return new Set();
  const ids = new Set<string>();
  for (const rec of streamRecords.values()) {
    if (!rec.deleted && rec.sessionId === sessionId) ids.add(rec.nodeId);
  }
  return ids;
}

function syncStreamingState() {
  const state = useTreeStore.getState();
  useTreeStore.setState({
    activeStreamSessionId: getActiveStreamSessionId(),
    streamingNodeIds: getStreamingNodeIdsForSession(state.loadedSessionId),
  });
}

function isCurrentRecord(rec: StreamRecord): boolean {
  const cur = streamRecords.get(rec.nodeId);
  return cur?.runId === rec.runId && !cur.deleted;
}

function clearFlushTimer(nodeId: string) {
  const timer = flushTimers.get(nodeId);
  if (timer) {
    clearTimeout(timer);
    flushTimers.delete(nodeId);
  }
}

function putLoadedNode(sessionId: string, node: QANode) {
  useTreeStore.setState((s) => {
    if (s.loadedSessionId !== sessionId) return s;
    const cur = s.nodes.get(node.id);
    if (!cur) return s;
    const nodes = new Map(s.nodes);
    nodes.set(node.id, node);
    return { nodes };
  });
}

function applyRecordPatch(rec: StreamRecord, patch: Partial<QANode>) {
  if (!isCurrentRecord(rec)) return;
  rec.node = { ...rec.node, ...patch };
  putLoadedNode(rec.sessionId, rec.node);
}

async function flushRecord(rec: StreamRecord): Promise<void> {
  clearFlushTimer(rec.nodeId);
  if (isCurrentRecord(rec)) await db.nodes.put(rec.node);
}

function scheduleFlush(rec: StreamRecord) {
  if (flushTimers.has(rec.nodeId)) return; // leading throttle
  const runId = rec.runId;
  const nodeId = rec.nodeId;
  const t = setTimeout(() => {
    flushTimers.delete(nodeId);
    const cur = streamRecords.get(nodeId);
    if (cur?.runId === runId && !cur.deleted) void db.nodes.put(cur.node);
  }, FLUSH_DELAY_MS);
  flushTimers.set(nodeId, t);
}

function abortRecord(rec: StreamRecord) {
  if (!rec.controller.signal.aborted) rec.controller.abort();
}

function discardRecord(nodeId: string) {
  const rec = streamRecords.get(nodeId);
  if (!rec) return;
  rec.deleted = true;
  abortRecord(rec);
  streamRecords.delete(nodeId);
  clearFlushTimer(nodeId);
}

export function discardStreamsForSession(sessionId: string) {
  for (const rec of Array.from(streamRecords.values())) {
    if (rec.sessionId === sessionId) discardRecord(rec.nodeId);
  }
  syncStreamingState();
}

function hasChild(edges: ReadonlyMap<string, QAEdge>, nodeId: string): boolean {
  for (const edge of edges.values()) {
    if (edge.fromNodeId === nodeId) return true;
  }
  return false;
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

function setLoadedNode(node: QANode) {
  useTreeStore.setState((s) => {
    if (s.loadedSessionId !== node.sessionId) return s;
    const cur = s.nodes.get(node.id);
    if (!cur) return s;
    const nodes = new Map(s.nodes);
    nodes.set(node.id, node);
    return { nodes };
  });
}

function assertCanStartStream(sessionId: string) {
  const activeSessionId = getActiveStreamSessionId();
  if (activeSessionId && activeSessionId !== sessionId) {
    throw new Error('另一个 session 正在生成，当前 session 暂不能发起新请求');
  }
}

async function runStream(args: {
  sessionId: string;
  nodeId: string;
  parentNodeId: string;
  promptForContext: string;
  initialNode: QANode;
  provider: ProviderConfig;
  proxy: ProxyConfig;
}) {
  const { sessionId, nodeId, parentNodeId, promptForContext, initialNode, provider, proxy } = args;
  if (streamRecords.has(nodeId)) return;

  const rec: StreamRecord = {
    runId: newId(),
    sessionId,
    nodeId,
    controller: new AbortController(),
    node: initialNode,
    deleted: false,
  };
  streamRecords.set(nodeId, rec);
  syncStreamingState();

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
      applyRecordPatch(rec, {
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
      signal: rec.controller.signal,
      onDelta: (_, full) => {
        if (!isCurrentRecord(rec)) return;
        applyRecordPatch(rec, { content: full });
        scheduleFlush(rec);
      },
    });

    let status: NodeStatus;
    let finishReason: FinishReason;
    if (rec.controller.signal.aborted || result.finishReason === 'abort') {
      status = 'aborted';
      finishReason = 'abort';
    } else {
      status = 'done';
      finishReason = result.finishReason;
    }
    applyRecordPatch(rec, {
      content: result.content,
      status,
      finishReason,
      model: result.model ?? provider.defaultModel,
      tokenUsage: result.usage,
      errorMessage: undefined,
    });
  } catch (e) {
    if (rec.controller.signal.aborted) {
      applyRecordPatch(rec, { status: 'aborted', finishReason: 'abort' });
    } else {
      const msg =
        e instanceof LLMError ? e.message : `请求失败：${(e as Error).message}`;
      applyRecordPatch(rec, {
        status: 'error',
        finishReason: 'error',
        errorMessage: msg,
      });
    }
  } finally {
    if (isCurrentRecord(rec)) {
      const autoTitleSession = useSessionsStore.getState().sessions.find(
        (session) => session.id === sessionId && session.rootNodeId === parentNodeId,
      );
      const shouldAutoTitle =
        rec.node.status === 'done' &&
        (autoTitleSession?.titleSource === 'default' ||
          autoTitleSession?.titleSource === 'prompt');
      const titleAnswer = rec.node.content;
      await flushRecord(rec);
      streamRecords.delete(nodeId);
      syncStreamingState();
      if (shouldAutoTitle) {
        void useSessionsStore
          .getState()
          .autoTitleSession(sessionId, {
            provider,
            proxy,
            prompt: promptForContext,
            answer: titleAnswer,
          });
      }
    }
  }
}

export const useTreeStore = create<TreeState>((set, get) => ({
  loadedSessionId: null,
  nodes: new Map(),
  edges: new Map(),
  selectedNodeId: null,
  selectedEdgeId: null,
  collapsedNodeIds: new Set(),
  activeStreamSessionId: null,
  streamingNodeIds: new Set(),

  loadSession: async (sessionId) => {
    // Idempotent: same session already loaded -> no-op (callers can fire-and-forget).
    if (get().loadedSessionId === sessionId) return;

    if (!sessionId) {
      set({
        loadedSessionId: null,
        nodes: new Map(),
        edges: new Map(),
        selectedNodeId: null,
        selectedEdgeId: null,
        collapsedNodeIds: new Set(),
        streamingNodeIds: new Set(),
        activeStreamSessionId: getActiveStreamSessionId(),
      });
      return;
    }

    const [storedNodes, edges, collapsed] = await Promise.all([
      db.nodes.where('sessionId').equals(sessionId).toArray(),
      db.edges.where('sessionId').equals(sessionId).toArray(),
      readCollapsed(sessionId),
    ]);

    const staleStreamingNodes: QANode[] = [];
    const nodes = storedNodes.map((node) => {
      const active = streamRecords.get(node.id);
      if (active && active.sessionId === sessionId && !active.deleted) return active.node;
      if (node.status === 'streaming') {
        const aborted: QANode = { ...node, status: 'aborted', finishReason: 'abort' };
        staleStreamingNodes.push(aborted);
        return aborted;
      }
      return node;
    });
    if (staleStreamingNodes.length > 0) {
      await db.nodes.bulkPut(staleStreamingNodes);
    }

    set({
      loadedSessionId: sessionId,
      nodes: new Map(nodes.map((n) => [n.id, n])),
      edges: new Map(edges.map((e) => [e.id, e])),
      selectedNodeId: null,
      selectedEdgeId: null,
      collapsedNodeIds: collapsed,
      streamingNodeIds: getStreamingNodeIdsForSession(sessionId),
      activeStreamSessionId: getActiveStreamSessionId(),
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
    assertCanStartStream(sessionId);
    const parent = snapshotNode(get(), parentNodeId);
    if (!parent) throw new Error(`父节点不存在：${parentNodeId}`);
    if (parent.status === 'streaming') {
      throw new Error('当前节点仍在生成，完成或中止后才能基于它继续提问');
    }

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

    if (parent.role === 'root') {
      void useSessionsStore.getState().recordFirstPrompt(sessionId, prompt);
    } else {
      void useSessionsStore.getState().touchSession(sessionId);
    }

    void runStream({
      sessionId,
      nodeId,
      parentNodeId,
      promptForContext: prompt,
      initialNode: node,
      provider,
      proxy,
    });
  },

  retryNode: async (nodeId, { provider, proxy }) => {
    const sessionId = get().loadedSessionId;
    if (!sessionId) throw new Error('没有载入的 session');
    assertCanStartStream(sessionId);
    const node = snapshotNode(get(), nodeId);
    if (!node) throw new Error(`节点不存在：${nodeId}`);
    if (!node.parentEdgeId) throw new Error('root 节点不可重试');
    if (hasChild(get().edges, nodeId)) return;
    const edge = get().edges.get(node.parentEdgeId);
    if (!edge) throw new Error('入边缺失');
    if (streamRecords.has(nodeId)) return;

    const nextNode: QANode = {
      ...node,
      content: '',
      status: 'streaming',
      finishReason: undefined,
      errorMessage: undefined,
      model: provider.defaultModel,
      tokenUsage: undefined,
    };
    await db.nodes.put(nextNode);
    setLoadedNode(nextNode);
    void useSessionsStore.getState().touchSession(sessionId);

    void runStream({
      sessionId,
      nodeId,
      parentNodeId: edge.fromNodeId,
      promptForContext: edge.prompt,
      initialNode: nextNode,
      provider,
      proxy,
    });
  },

  abortStream: (nodeId) => {
    const rec = streamRecords.get(nodeId);
    if (rec) abortRecord(rec);
  },

  abortSessionStreams: (sessionId) => {
    for (const rec of streamRecords.values()) {
      if (rec.sessionId === sessionId) abortRecord(rec);
    }
  },
}));

export const selectChildEdges = (parentNodeId: string) => (state: TreeState) =>
  Array.from(state.edges.values()).filter((e) => e.fromNodeId === parentNodeId);
