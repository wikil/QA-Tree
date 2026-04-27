import { create } from 'zustand';
import {
  db,
  getNodePositions,
  KV_KEYS,
  setNodePositions,
  type NodePosition,
} from '@/lib/db';
import { newId } from '@/lib/ids';
import { buildMessages, buildSystemPrompt } from '@/lib/context';
import { LLMError, streamChat } from '@/lib/llm';
import { useSessionsStore } from '@/stores/sessionsStore';
import { useSettingsStore } from '@/stores/settingsStore';
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

interface ForkArgs {
  provider: ProviderConfig;
  proxy: ProxyConfig;
}

export interface SubtreeStats {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
  streamingCount: number;
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
  /** Node id whose subtree is being confirmed for deletion. Null = no dialog. */
  deleteTargetId: string | null;
  /** Node id awaiting a regenerate-fork confirm. Null = no dialog. */
  regenTargetId: string | null;
  /** Manually-pinned node positions for the loaded session. */
  positions: Record<string, NodePosition>;
  /**
   * Monotonic counter bumped on every structural change (add/remove/collapse/
   * fork/position). SSE deltas do NOT bump this — it is the layout memo's only
   * trigger. Resets to 0 on session switch (paired with `loadedSessionId` in
   * memo deps so a new session starting at 0 still recomputes).
   */
  layoutVersion: number;

  loadSession: (sessionId: string | null) => Promise<void>;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  toggleCollapse: (nodeId: string) => Promise<void>;
  expandAll: () => Promise<void>;
  collapseAll: () => Promise<void>;

  sendPrompt: (args: SendPromptArgs) => Promise<void>;
  /**
   * Regenerate a node's answer by spawning a NEW sibling branch under the same
   * parent (same prompt, fresh edge id + node id). The original node and any
   * descendants are left untouched — fork-only is a hard invariant of P3:
   * generated content is immutable, branches ARE the history.
   */
  forkRegenerate: (nodeId: string, args: ForkArgs) => Promise<string | null>;
  /**
   * Edit an edge's prompt by spawning a NEW sibling edge under the same
   * parent (new prompt + new node) and streaming. The original edge / node /
   * subtree are left untouched.
   */
  forkEditPrompt: (
    edgeId: string,
    newPrompt: string,
    args: ForkArgs,
  ) => Promise<string | null>;
  abortStream: (nodeId: string) => void;
  abortSessionStreams: (sessionId: string) => void;
  requestDeleteSubtree: (nodeId: string | null) => void;
  requestRegenerateFork: (nodeId: string | null) => void;
  confirmRegenerateFork: (args: ForkArgs) => Promise<string | null>;
  deleteNodeSubtree: (nodeId: string) => Promise<void>;
  setNodePosition: (nodeId: string, position: NodePosition) => void;
  clearAllPositions: () => Promise<void>;
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

function discardStreamRecords(nodeIds: Iterable<string>): number {
  let count = 0;
  for (const id of nodeIds) {
    if (streamRecords.has(id)) {
      discardRecord(id);
      count++;
    }
  }
  return count;
}

export function discardStreamsForSession(sessionId: string) {
  for (const rec of Array.from(streamRecords.values())) {
    if (rec.sessionId === sessionId) discardRecord(rec.nodeId);
  }
  syncStreamingState();
}

export function collectSubtreeStats(
  edges: ReadonlyMap<string, QAEdge>,
  rootId: string,
  streamingNodeIds: ReadonlySet<string>,
): SubtreeStats {
  const childrenByParent = new Map<string, string[]>();
  for (const e of edges.values()) {
    const arr = childrenByParent.get(e.fromNodeId) ?? [];
    arr.push(e.toNodeId);
    childrenByParent.set(e.fromNodeId, arr);
  }
  const nodeIds = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (nodeIds.has(id)) continue;
    nodeIds.add(id);
    for (const child of childrenByParent.get(id) ?? []) stack.push(child);
  }
  const edgeIds = new Set<string>();
  for (const e of edges.values()) {
    if (nodeIds.has(e.toNodeId) || nodeIds.has(e.fromNodeId)) edgeIds.add(e.id);
  }
  let streamingCount = 0;
  for (const id of nodeIds) if (streamingNodeIds.has(id)) streamingCount++;
  return { nodeIds, edgeIds, streamingCount };
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

function assertCanStartStream(sessionId: string) {
  const activeSessionId = getActiveStreamSessionId();
  if (activeSessionId && activeSessionId !== sessionId) {
    throw new Error('另一个 session 正在生成，当前 session 暂不能发起新请求');
  }
}

/**
 * Shared core for spawning a brand-new edge+node under an existing parent.
 * Used by sendPrompt, forkEditPrompt, and forkRegenerate. Always creates
 * fresh ids — never reuses an existing edge id (P3 invariant: branches ARE
 * the history; edges and nodes are 1:1 and immutable once created).
 */
async function createForkBranch(args: {
  sessionId: string;
  parentNodeId: string;
  prompt: string;
  provider: ProviderConfig;
  proxy: ProxyConfig;
}): Promise<string> {
  const { sessionId, parentNodeId, prompt, provider, proxy } = args;
  assertCanStartStream(sessionId);
  const state = useTreeStore.getState();
  const parent = state.nodes.get(parentNodeId);
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

  // 先落盘再流式（CLAUDE.md 红线 #2）
  await db.transaction('rw', db.nodes, db.edges, async () => {
    await db.edges.put(edge);
    await db.nodes.put(node);
  });

  useTreeStore.setState((s) => {
    if (s.loadedSessionId !== sessionId) return s;
    const nodes = new Map(s.nodes);
    const edges = new Map(s.edges);
    nodes.set(nodeId, node);
    edges.set(edgeId, edge);
    return {
      nodes,
      edges,
      selectedNodeId: nodeId,
      selectedEdgeId: null,
      layoutVersion: s.layoutVersion + 1,
    };
  });

  void runStream({
    sessionId,
    nodeId,
    parentNodeId,
    promptForContext: prompt,
    initialNode: node,
    provider,
    proxy,
  });

  return nodeId;
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
    const wantsStructured = provider.capabilities?.responseFormat !== 'unsupported';
    let messages: ReturnType<typeof buildMessages>;
    let plainMessages: ReturnType<typeof buildMessages>;
    try {
      messages = buildMessages({
        nodes: state.nodes,
        edges: state.edges,
        parentNodeId,
        userPrompt: promptForContext,
        provider,
        structured: wantsStructured,
      });
      // Same path, swap only the system prompt — avoids walking the path twice.
      // plainMessages is consumed only on JSON-mode rejection (rare), but
      // streamChat needs it ready in case the first request 4xxs.
      plainMessages = wantsStructured
        ? [{ role: 'system', content: buildSystemPrompt(provider) }, ...messages.slice(1)]
        : messages;
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
      plainMessages,
      structured: wantsStructured,
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
      structured: result.structured,
      structuredError: result.structuredError,
    });

    if (result.capabilityPatch) {
      await useSettingsStore.getState().patchProviderCapability(provider.id, result.capabilityPatch);
    }
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
  deleteTargetId: null,
  regenTargetId: null,
  positions: {},
  layoutVersion: 0,

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
        deleteTargetId: null,
        regenTargetId: null,
        positions: {},
        layoutVersion: 0,
      });
      return;
    }

    const [storedNodes, edges, collapsed, positions] = await Promise.all([
      db.nodes.where('sessionId').equals(sessionId).toArray(),
      db.edges.where('sessionId').equals(sessionId).toArray(),
      readCollapsed(sessionId),
      getNodePositions(sessionId),
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
      deleteTargetId: null,
      regenTargetId: null,
      positions,
      layoutVersion: 0,
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
    set((s) => ({ collapsedNodeIds: next, layoutVersion: s.layoutVersion + 1 }));
    await writeCollapsed(sessionId, next);
  },

  expandAll: async () => {
    const sessionId = get().loadedSessionId;
    if (!sessionId) return;
    if (get().collapsedNodeIds.size === 0) return;
    set((s) => ({
      collapsedNodeIds: new Set(),
      layoutVersion: s.layoutVersion + 1,
    }));
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
    set((s) => ({ collapsedNodeIds: next, layoutVersion: s.layoutVersion + 1 }));
    await writeCollapsed(sessionId, next);
  },

  sendPrompt: async ({ parentNodeId, prompt, provider, proxy }) => {
    const sessionId = get().loadedSessionId;
    if (!sessionId) throw new Error('没有载入的 session');
    const parent = snapshotNode(get(), parentNodeId);
    if (!parent) throw new Error(`父节点不存在：${parentNodeId}`);
    await createForkBranch({ sessionId, parentNodeId, prompt, provider, proxy });
    if (parent.role === 'root') {
      void useSessionsStore.getState().recordFirstPrompt(sessionId, prompt);
    } else {
      void useSessionsStore.getState().touchSession(sessionId);
    }
  },

  forkRegenerate: async (nodeId, { provider, proxy }) => {
    const sessionId = get().loadedSessionId;
    if (!sessionId) throw new Error('没有载入的 session');
    const node = snapshotNode(get(), nodeId);
    if (!node) throw new Error(`节点不存在：${nodeId}`);
    if (!node.parentEdgeId) throw new Error('root 节点不可重新生成');
    const edge = get().edges.get(node.parentEdgeId);
    if (!edge) throw new Error('入边缺失');
    const newNodeId = await createForkBranch({
      sessionId,
      parentNodeId: edge.fromNodeId,
      prompt: edge.prompt,
      provider,
      proxy,
    });
    void useSessionsStore.getState().touchSession(sessionId);
    return newNodeId;
  },

  forkEditPrompt: async (edgeId, newPrompt, { provider, proxy }) => {
    const sessionId = get().loadedSessionId;
    if (!sessionId) throw new Error('没有载入的 session');
    const edge = get().edges.get(edgeId);
    if (!edge) throw new Error('边不存在');
    const trimmed = newPrompt.trim();
    if (!trimmed) throw new Error('prompt 不能为空');
    const newNodeId = await createForkBranch({
      sessionId,
      parentNodeId: edge.fromNodeId,
      prompt: trimmed,
      provider,
      proxy,
    });
    void useSessionsStore.getState().touchSession(sessionId);
    return newNodeId;
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

  requestDeleteSubtree: (nodeId) => {
    if (!nodeId) {
      set({ deleteTargetId: null });
      return;
    }
    const target = get().nodes.get(nodeId);
    if (!target || target.role === 'root') return;
    set({ deleteTargetId: nodeId });
  },

  requestRegenerateFork: (nodeId) => {
    if (!nodeId) {
      set({ regenTargetId: null });
      return;
    }
    const target = get().nodes.get(nodeId);
    if (!target || target.role === 'root' || !target.parentEdgeId) return;
    set({ regenTargetId: nodeId });
  },

  confirmRegenerateFork: async (args) => {
    const target = get().regenTargetId;
    if (!target) return null;
    set({ regenTargetId: null });
    return get().forkRegenerate(target, args);
  },

  deleteNodeSubtree: async (nodeId) => {
    const sessionId = get().loadedSessionId;
    if (!sessionId) return;
    const state = get();
    const target = state.nodes.get(nodeId);
    if (!target || target.role === 'root') return;

    const { nodeIds, edgeIds } = collectSubtreeStats(
      state.edges,
      nodeId,
      state.streamingNodeIds,
    );

    discardStreamRecords(nodeIds);

    await db.transaction('rw', db.nodes, db.edges, async () => {
      await db.nodes.bulkDelete(Array.from(nodeIds));
      await db.edges.bulkDelete(Array.from(edgeIds));
    });

    const parentEdgeId = target.parentEdgeId;
    const parentNodeId = parentEdgeId
      ? state.edges.get(parentEdgeId)?.fromNodeId ?? null
      : null;

    // Track whether any deleted node was actually collapsed; skips the IDB
    // round-trip for the common case (delete a leaf with no folded children).
    let collapsedDirty = false;
    let positionsDirty = false;

    set((s) => {
      if (s.loadedSessionId !== sessionId) return s;
      const nextNodes = new Map(s.nodes);
      const nextEdges = new Map(s.edges);
      for (const id of nodeIds) nextNodes.delete(id);
      for (const id of edgeIds) nextEdges.delete(id);
      const nextCollapsed = new Set(s.collapsedNodeIds);
      for (const id of nodeIds) {
        if (nextCollapsed.delete(id)) collapsedDirty = true;
      }
      const nextPositions = { ...s.positions };
      for (const id of nodeIds) {
        if (id in nextPositions) {
          delete nextPositions[id];
          positionsDirty = true;
        }
      }
      const selectedNodeId =
        s.selectedNodeId && nodeIds.has(s.selectedNodeId) ? parentNodeId : s.selectedNodeId;
      const selectedEdgeId =
        s.selectedEdgeId && edgeIds.has(s.selectedEdgeId) ? null : s.selectedEdgeId;
      const deleteTargetId = s.deleteTargetId === nodeId ? null : s.deleteTargetId;
      return {
        nodes: nextNodes,
        edges: nextEdges,
        collapsedNodeIds: nextCollapsed,
        positions: nextPositions,
        selectedNodeId,
        selectedEdgeId,
        deleteTargetId,
        layoutVersion: s.layoutVersion + 1,
      };
    });

    if (collapsedDirty) {
      const persisted = await readCollapsed(sessionId);
      for (const id of nodeIds) persisted.delete(id);
      await writeCollapsed(sessionId, persisted);
    }

    if (positionsDirty) {
      // Flush immediately — the just-deleted nodes must not linger in the
      // persisted KV record.
      await setNodePositions(sessionId, get().positions);
    }

    void useSessionsStore.getState().touchSession(sessionId);
    syncStreamingState();
  },

  setNodePosition: (nodeId, position) => {
    const sessionId = get().loadedSessionId;
    if (!sessionId) return;
    let nextPositions: Record<string, NodePosition> | null = null;
    set((s) => {
      const node = s.nodes.get(nodeId);
      if (!node || node.role === 'root') return s;
      const cur = s.positions[nodeId];
      if (cur && cur.x === position.x && cur.y === position.y) return s;
      nextPositions = { ...s.positions, [nodeId]: position };
      return {
        positions: nextPositions,
        layoutVersion: s.layoutVersion + 1,
      };
    });
    if (nextPositions) {
      void setNodePositions(sessionId, nextPositions);
    }
  },

  clearAllPositions: async () => {
    const sessionId = get().loadedSessionId;
    if (!sessionId) return;
    if (Object.keys(get().positions).length === 0) return;
    set((s) => ({ positions: {}, layoutVersion: s.layoutVersion + 1 }));
    await setNodePositions(sessionId, {});
  },
}));

export const selectChildEdges = (parentNodeId: string) => (state: TreeState) =>
  Array.from(state.edges.values()).filter((e) => e.fromNodeId === parentNodeId);
