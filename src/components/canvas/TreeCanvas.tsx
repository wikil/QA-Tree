import { useCallback, useEffect, useMemo, useRef } from 'react';
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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { AnswerNode, type AnswerNodeData } from './AnswerNode';
import { PromptEdge, type PromptEdgeData } from './PromptEdge';
import { StartPill } from './StartPill';
import { CanvasToolbar } from './CanvasToolbar';
import { EmptyState } from './EmptyState';
import {
  layoutTree,
  NODE_HEIGHT,
  NODE_WIDTH,
  START_NODE_ID,
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
};

const edgeTypes = {
  prompt: PromptEdge,
};

interface TreeCanvasProps {
  onAddBranchFocus?: () => void;
}

function TreeCanvasInner({ onAddBranchFocus }: TreeCanvasProps) {
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
  const selectNode = useTreeStore((s) => s.selectNode);
  const selectEdge = useTreeStore((s) => s.selectEdge);
  const toggleCollapse = useTreeStore((s) => s.toggleCollapse);
  const expandAll = useTreeStore((s) => s.expandAll);
  const collapseAll = useTreeStore((s) => s.collapseAll);
  const retryNode = useTreeStore((s) => s.retryNode);

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

  // Layout depends only on structure (size + edges + collapsed + root). Streaming
  // content updates change `nodesMap` reference but not size, so dagre is skipped
  // during streaming — the canvas would otherwise re-layout 10-50 times/sec.
  const layout = useMemo(
    () =>
      layoutTree({
        nodes: nodesMap,
        edges: edgesMap,
        collapsedNodeIds,
        rootNodeId,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodesMap.size, edgesMap, collapsedNodeIds, rootNodeId],
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
    (id: string) => {
      if (!provider) return;
      void retryNode(id, { provider, proxy });
    },
    [provider, proxy, retryNode],
  );

  const handleExpand = useCallback(
    (id: string) => {
      selectNode(id);
    },
    [selectNode],
  );

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
      const data: AnswerNodeData = {
        node,
        childCount,
        hiddenDescendantCount: descendantCount.get(pn.id) ?? 0,
        isCollapsed: collapsedNodeIds.has(pn.id),
        isOnPath: highlight.nodeIds.has(pn.id),
        isSelected: selectedNodeId === pn.id,
        isRetryDisabled: streamingNodeIds.has(pn.id) || childCount > 0,
        onToggleCollapse: toggleCollapse,
        onAddBranch: handleAddBranch,
        onRetry: handleRetry,
        onExpand: handleExpand,
      };
      rfNodes.push({
        id: pn.id,
        type: 'answer',
        position: { x: pn.x, y: pn.y },
        data: data as unknown as Record<string, unknown>,
        draggable: false,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
    }
    return rfNodes;
  }, [
    layout,
    nodesMap,
    childrenByParent,
    descendantCount,
    collapsedNodeIds,
    streamingNodeIds,
    highlight.nodeIds,
    selectedNodeId,
    toggleCollapse,
    handleAddBranch,
    handleRetry,
    handleExpand,
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

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <CanvasToolbar
        sessionTitle={sessionTitle}
        pathLabel={pathLabel}
        nodeCount={visibleAnswerCount}
        collapsedCount={collapsedCount}
        onFit={handleFit}
        onReset={handleReset}
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
            nodesDraggable={false}
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
              nodeColor={(n) =>
                n.type === 'start'
                  ? 'hsl(var(--accent))'
                  : 'hsl(var(--foreground) / 0.45)'
              }
              nodeStrokeColor="transparent"
              nodeBorderRadius={2}
              style={{ width: 148, height: 96 }}
            />
          </ReactFlow>
        )}
      </div>
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
