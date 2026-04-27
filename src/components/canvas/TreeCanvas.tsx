import { useCallback, useEffect, useMemo, useRef } from 'react';
import { fillTemplate } from '@/lib/i18n';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  type OnNodeDrag,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  AnswerNode,
  SuggestedRail,
  type AnswerNodeData,
  type SuggestedRailData,
} from './AnswerNode';
import { PromptEdge, type PromptEdgeData } from './PromptEdge';
import { StartPill } from './StartPill';
import { CanvasToolbar } from './CanvasToolbar';
import { EmptyState } from './EmptyState';
import { DeleteSubtreeDialog } from './DeleteSubtreeDialog';
import { RegenerateForkDialog } from './RegenerateForkDialog';
import {
  layoutTree,
  NODE_HEIGHT,
  NODE_WIDTH,
  START_NODE_ID,
  SUGGESTED_RAIL_GAP,
  SUGGESTED_RAIL_NODE_TYPE,
  SUGGESTED_RAIL_WIDTH,
  suggestedRailHeight,
} from './layout';
import { pathHighlight, EMPTY_HIGHLIGHT } from './pathHighlight';
import { useTreeStore } from '@/stores/treeStore';
import { useResolvedProvider } from '@/hooks/useResolvedProvider';
import { useI18n } from '@/lib/i18n';
import { walkPathToRoot } from '@/lib/context';
import { summarizeText } from '@/lib/format';
import type { QANode } from '@/types';

const nodeTypes = {
  answer: AnswerNode,
  start: StartPill,
  [SUGGESTED_RAIL_NODE_TYPE]: SuggestedRail,
};

const edgeTypes = {
  prompt: PromptEdge,
};

interface TreeCanvasProps {
  onAddBranchFocus?: () => void;
  /** Concept chips invoke this so the user can refine the prompt before sending. */
  onPrefillAsk?: (text: string) => void;
}

function TreeCanvasInner({ onAddBranchFocus, onPrefillAsk }: TreeCanvasProps) {
  const { session, provider, proxy } = useResolvedProvider();
  const { t } = useI18n();
  const sessionTitle = session?.title ?? t.app.defaultSessionTitle;
  const rootNodeId = session?.rootNodeId ?? '';

  const nodesMap = useTreeStore((s) => s.nodes);
  const edgesMap = useTreeStore((s) => s.edges);
  const selectedNodeId = useTreeStore((s) => s.selectedNodeId);
  const selectedEdgeId = useTreeStore((s) => s.selectedEdgeId);
  const collapsedNodeIds = useTreeStore((s) => s.collapsedNodeIds);
  const streamingNodeIds = useTreeStore((s) => s.streamingNodeIds);
  const positions = useTreeStore((s) => s.positions);
  const layoutVersion = useTreeStore((s) => s.layoutVersion);
  const loadedSessionId = useTreeStore((s) => s.loadedSessionId);
  const selectNode = useTreeStore((s) => s.selectNode);
  const selectEdge = useTreeStore((s) => s.selectEdge);
  const toggleCollapse = useTreeStore((s) => s.toggleCollapse);
  const expandAll = useTreeStore((s) => s.expandAll);
  const collapseAll = useTreeStore((s) => s.collapseAll);
  const sendPrompt = useTreeStore((s) => s.sendPrompt);
  const setNodePosition = useTreeStore((s) => s.setNodePosition);
  const clearAllPositions = useTreeStore((s) => s.clearAllPositions);

  const requestDeleteSubtree = useTreeStore((s) => s.requestDeleteSubtree);
  const requestRegenerateFork = useTreeStore((s) => s.requestRegenerateFork);

  const { fitView, setCenter } = useReactFlow();
  const didInitialFit = useRef(false);

  // Reset initial-fit on session switch — kept in an effect so render is pure.
  useEffect(() => {
    didInitialFit.current = false;
  }, [session?.id]);

  const isEmpty = nodesMap.size <= 1;

  // childrenByParent / descendantCount: structurally stable during streaming
  // because edges are write-once (created on send, never mutated by deltas).
  const childrenByParent = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of edgesMap.values()) {
      const arr = m.get(e.fromNodeId) ?? [];
      arr.push(e.toNodeId);
      m.set(e.fromNodeId, arr);
    }
    return m;
  }, [edgesMap]);

  const descendantCount = useMemo(() => {
    const m = new Map<string, number>();
    const walk = (id: string): number => {
      if (m.has(id)) return m.get(id)!;
      const kids = childrenByParent.get(id) ?? [];
      let total = 0;
      for (const k of kids) total += 1 + walk(k);
      m.set(id, total);
      return total;
    };
    if (rootNodeId) walk(rootNodeId);
    return m;
  }, [childrenByParent, rootNodeId]);

  // Layout depends only on structure. `layoutVersion` is bumped by every
  // structural mutation in the store (add/remove/collapse/position/fork) but
  // never by SSE deltas, so dagre is skipped during streaming. We pair it with
  // `loadedSessionId` because `loadSession` resets layoutVersion to 0 — without
  // the session id in deps, switching to a fresh session at version 0 would
  // reuse the previous session's memoized layout.
  const layout = useMemo(
    () =>
      layoutTree({
        nodes: nodesMap,
        edges: edgesMap,
        collapsedNodeIds,
        rootNodeId,
        positions,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadedSessionId, layoutVersion, rootNodeId],
  );

  // pathHighlight only walks via edge chain; dropping `nodesMap` from deps
  // keeps the result stable across streaming deltas.
  const highlight = useMemo(() => {
    if (!selectedNodeId) return EMPTY_HIGHLIGHT;
    return pathHighlight({ nodes: nodesMap, edges: edgesMap, selectedNodeId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edgesMap, selectedNodeId]);

  const handleAddBranch = useCallback(
    (id: string) => {
      selectNode(id);
      onAddBranchFocus?.();
    },
    [selectNode, onAddBranchFocus],
  );

  const handleRetry = useCallback(
    (id: string) => requestRegenerateFork(id),
    [requestRegenerateFork],
  );

  const handleExpand = useCallback(
    (id: string) => {
      selectNode(id);
    },
    [selectNode],
  );

  const handleRequestDelete = useCallback(
    (id: string) => requestDeleteSubtree(id),
    [requestDeleteSubtree],
  );

  const handleForkOne = useCallback(
    async (parentNodeId: string, prompt: string) => {
      if (!provider) return;
      const trimmed = prompt.trim();
      if (!trimmed) return;
      try {
        await sendPrompt({ parentNodeId, prompt: trimmed, provider, proxy });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[TreeCanvas] fork sendPrompt failed:', e);
      }
    },
    [provider, proxy, sendPrompt],
  );

  const handleConceptChip = useCallback(
    (concept: string) => {
      onPrefillAsk?.(fillTemplate(t.answer.conceptPromptTemplate, { concept }));
    },
    [onPrefillAsk, t.answer.conceptPromptTemplate],
  );

  const activeStreamSessionId = useTreeStore((s) => s.activeStreamSessionId);
  const blockedByOtherSession =
    activeStreamSessionId != null && activeStreamSessionId !== loadedSessionId;
  const forkUnavailable = !provider || blockedByOtherSession;

  const reactFlowNodes: Node[] = useMemo(() => {
    const rfNodes: Node[] = [];
    rfNodes.push({
      id: START_NODE_ID,
      type: 'start',
      position: layout.startPos,
      data: {},
      draggable: false,
      selectable: false,
      focusable: false,
    });
    for (const pn of layout.nodes) {
      const node: QANode | undefined = nodesMap.get(pn.id);
      if (!node) continue;
      const childCount = (childrenByParent.get(pn.id) ?? []).length;
      const isPinned = positions[pn.id] != null;
      const data: AnswerNodeData = {
        node,
        childCount,
        hiddenDescendantCount: descendantCount.get(pn.id) ?? 0,
        isCollapsed: collapsedNodeIds.has(pn.id),
        isOnPath: highlight.nodeIds.has(pn.id),
        isSelected: selectedNodeId === pn.id,
        isRetryDisabled: streamingNodeIds.has(pn.id) || forkUnavailable,
        isDeleteDisabled: streamingNodeIds.has(pn.id),
        isPinned,
        isForkDisabled: forkUnavailable || streamingNodeIds.has(pn.id),
        onToggleCollapse: toggleCollapse,
        onAddBranch: handleAddBranch,
        onRetry: handleRetry,
        onExpand: handleExpand,
        onRequestDelete: handleRequestDelete,
        onConceptChip: handleConceptChip,
      };
      rfNodes.push({
        id: pn.id,
        type: 'answer',
        position: { x: pn.x, y: pn.y },
        data: data as unknown as Record<string, unknown>,
        draggable: true,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });

      // Rails are leaf-only so they never overlap descendant nodes/edges.
      const suggestions = node.structured?.suggestedQuestions;
      if (childCount === 0 && suggestions && suggestions.length > 0) {
        const railHeight = suggestedRailHeight(suggestions.length);
        const railData: SuggestedRailData = {
          suggestions,
          disabled: forkUnavailable || streamingNodeIds.has(pn.id),
          onPick: (prompt) => handleForkOne(pn.id, prompt),
        };
        rfNodes.push({
          id: `${pn.id}__rail`,
          type: SUGGESTED_RAIL_NODE_TYPE,
          position: {
            x: pn.x + NODE_WIDTH + SUGGESTED_RAIL_GAP,
            y: pn.y + Math.max(0, (NODE_HEIGHT - railHeight) / 2),
          },
          data: railData as unknown as Record<string, unknown>,
          draggable: false,
          selectable: false,
          focusable: false,
          width: SUGGESTED_RAIL_WIDTH,
          height: railHeight,
        });
      }
    }
    return rfNodes;
  }, [
    layout,
    nodesMap,
    childrenByParent,
    descendantCount,
    collapsedNodeIds,
    streamingNodeIds,
    positions,
    highlight.nodeIds,
    selectedNodeId,
    toggleCollapse,
    handleAddBranch,
    handleRetry,
    handleExpand,
    handleRequestDelete,
    handleConceptChip,
    handleForkOne,
    forkUnavailable,
  ]);

  const reactFlowEdges: Edge[] = useMemo(() => {
    const hasSelection = selectedNodeId != null || selectedEdgeId != null;
    return layout.edges.map((pe) => {
      const isOnPath =
        highlight.edgeIds.has(pe.id) || selectedEdgeId === pe.id;
      const data: PromptEdgeData = {
        prompt: pe.prompt,
        isOnPath,
        hasSelection,
      };
      return {
        id: pe.id,
        source: pe.source,
        target: pe.target,
        type: 'prompt',
        data: data as unknown as Record<string, unknown>,
        selected: selectedEdgeId === pe.id,
      };
    });
  }, [layout.edges, highlight.edgeIds, selectedNodeId, selectedEdgeId]);

  useEffect(() => {
    if (didInitialFit.current) return;
    if (reactFlowNodes.length <= 1) return;
    didInitialFit.current = true;
    requestAnimationFrame(() => {
      void fitView({ padding: 0.18, duration: 480 });
    });
  }, [reactFlowNodes.length, fitView]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      if (node.id === START_NODE_ID) return;
      if (node.type === SUGGESTED_RAIL_NODE_TYPE) return;
      selectNode(node.id);
    },
    [selectNode],
  );

  const onEdgeClick: EdgeMouseHandler = useCallback(
    (_, edge) => {
      selectEdge(edge.id);
    },
    [selectEdge],
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  const onNodeDragStop: OnNodeDrag = useCallback(
    (_, node) => {
      if (node.id === START_NODE_ID) return;
      setNodePosition(node.id, { x: node.position.x, y: node.position.y });
    },
    [setNodePosition],
  );

  const handleFit = useCallback(() => {
    void fitView({ padding: 0.18, duration: 480 });
  }, [fitView]);

  const handleReset = useCallback(() => {
    didInitialFit.current = false;
    selectNode(null);
    void expandAll();
    setCenter(layout.startPos.x + 120, layout.startPos.y + 18, {
      zoom: 0.9,
      duration: 480,
    });
  }, [selectNode, expandAll, layout.startPos.x, layout.startPos.y, setCenter]);

  const handleResetLayout = useCallback(() => {
    void clearAllPositions();
  }, [clearAllPositions]);

  // Compact path label for the toolbar — 'root › Q1 › Q2 › Q3'.
  // Walks via edge chain only; nodesMap content never affects the result.
  const pathLabel = useMemo(() => {
    if (!selectedNodeId) return undefined;
    const walk = walkPathToRoot(nodesMap, edgesMap, selectedNodeId);
    const segs = walk
      .map((s) => s.edge && summarizeText(s.edge.prompt, 14))
      .filter((s): s is string => !!s);
    if (segs.length === 0) return 'root';
    return 'root › ' + segs.join(' › ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edgesMap, selectedNodeId]);

  const visibleAnswerCount = layout.nodes.length;
  const collapsedCount = collapsedNodeIds.size;
  const pinnedCount = Object.keys(positions).length;

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <CanvasToolbar
        sessionTitle={sessionTitle}
        pathLabel={pathLabel}
        nodeCount={visibleAnswerCount}
        collapsedCount={collapsedCount}
        pinnedCount={pinnedCount}
        onFit={handleFit}
        onReset={handleReset}
        onResetLayout={handleResetLayout}
        onCollapseAll={() => void collapseAll()}
        onExpandAll={() => void expandAll()}
      />
      <div className="relative flex-1 overflow-hidden">
        {isEmpty ? (
          <EmptyState />
        ) : (
          <ReactFlow
            nodes={reactFlowNodes}
            edges={reactFlowEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onNodeDragStop={onNodeDragStop}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
            proOptions={{ hideAttribution: false }}
            minZoom={0.4}
            maxZoom={1.5}
            fitView={false}
            defaultEdgeOptions={{ type: 'prompt' }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={28}
              size={1.4}
              color="hsl(var(--canvas-grid))"
            />
            <Controls
              showInteractive={false}
              position="bottom-left"
              className="!gap-0"
            />
            <MiniMap
              pannable
              zoomable
              position="bottom-right"
              maskColor="hsl(var(--background) / 0.7)"
              nodeColor={(n) => {
                if (n.type === 'start') return 'hsl(var(--accent))';
                if (n.type === SUGGESTED_RAIL_NODE_TYPE) return 'transparent';
                return 'hsl(var(--foreground) / 0.45)';
              }}
              nodeStrokeColor="transparent"
              nodeBorderRadius={2}
              style={{ width: 148, height: 96 }}
            />
          </ReactFlow>
        )}
      </div>
      <DeleteSubtreeDialog />
      <RegenerateForkDialog />
    </div>
  );
}

export function TreeCanvas(props: TreeCanvasProps) {
  return (
    <ReactFlowProvider>
      <TreeCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
