import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { pathHighlight } from './pathHighlight';
import { fakeEdges, fakeNodes, fakeRootNodeId, fakeSession } from './fakeData';
import type { QAEdge, QANode } from '@/types';

const nodeTypes = {
  answer: AnswerNode,
  start: StartPill,
};

const edgeTypes = {
  prompt: PromptEdge,
};

interface TreeCanvasProps {
  /** Optional override — defaults to fake demo data. */
  nodes?: QANode[];
  edges?: QAEdge[];
  rootNodeId?: string;
  sessionTitle?: string;
}

function TreeCanvasInner({
  nodes: nodesProp,
  edges: edgesProp,
  rootNodeId: rootProp,
  sessionTitle: titleProp,
}: TreeCanvasProps) {
  const nodesData = nodesProp ?? fakeNodes;
  const edgesData = edgesProp ?? fakeEdges;
  const rootNodeId = rootProp ?? fakeRootNodeId;
  const sessionTitle = titleProp ?? fakeSession.title;

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());

  const { fitView, setCenter } = useReactFlow();
  const didInitialFit = useRef(false);

  const nodesMap = useMemo(
    () => new Map(nodesData.map((n) => [n.id, n] as const)),
    [nodesData],
  );
  const edgesMap = useMemo(
    () => new Map(edgesData.map((e) => [e.id, e] as const)),
    [edgesData],
  );

  const isEmpty = nodesData.length <= 1; // root only

  // child counts per node id (children visible OR hidden — we want the raw count too)
  const childrenByParent = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of edgesData) {
      const arr = m.get(e.fromNodeId) ?? [];
      arr.push(e.toNodeId);
      m.set(e.fromNodeId, arr);
    }
    return m;
  }, [edgesData]);

  // descendant counts (recursive) for collapsed-badge "+N" labels
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
    for (const id of nodesMap.keys()) walk(id);
    return m;
  }, [nodesMap, childrenByParent]);

  const layout = useMemo(
    () =>
      layoutTree({
        nodes: nodesMap,
        edges: edgesMap,
        collapsedNodeIds,
        rootNodeId,
      }),
    [nodesMap, edgesMap, collapsedNodeIds, rootNodeId],
  );

  const highlight = useMemo(
    () => pathHighlight({ nodes: nodesMap, edges: edgesMap, selectedNodeId }),
    [nodesMap, edgesMap, selectedNodeId],
  );

  const handleToggleCollapse = useCallback((id: string) => {
    setCollapsedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleAddBranch = useCallback((id: string) => {
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
    // Real branch creation lives in milestone 6 — here we just focus the node.
  }, []);

  const handleRetry = useCallback((_id: string) => {
    // Stub — wires to treeStore.retryNode in milestone 6.
  }, []);

  const handleExpand = useCallback((id: string) => {
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
  }, []);

  const reactFlowNodes: Node[] = useMemo(() => {
    const rfNodes: Node[] = [];
    // Start pill
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
      const node = nodesMap.get(pn.id);
      if (!node) continue;
      const childCount = (childrenByParent.get(pn.id) ?? []).length;
      const data: AnswerNodeData = {
        node,
        childCount,
        hiddenDescendantCount: descendantCount.get(pn.id) ?? 0,
        isCollapsed: collapsedNodeIds.has(pn.id),
        isOnPath: highlight.nodeIds.has(pn.id),
        isSelected: selectedNodeId === pn.id,
        onToggleCollapse: handleToggleCollapse,
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
    highlight.nodeIds,
    selectedNodeId,
    handleToggleCollapse,
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

  // Initial fit-view once layout has rendered
  useEffect(() => {
    if (didInitialFit.current) return;
    if (reactFlowNodes.length <= 1) return;
    didInitialFit.current = true;
    requestAnimationFrame(() => {
      void fitView({ padding: 0.18, duration: 480 });
    });
  }, [reactFlowNodes.length, fitView]);

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    if (node.id === START_NODE_ID) return;
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  }, []);

  const onEdgeClick: EdgeMouseHandler = useCallback((_, edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, []);

  const handleFit = useCallback(() => {
    void fitView({ padding: 0.18, duration: 480 });
  }, [fitView]);

  const handleReset = useCallback(() => {
    didInitialFit.current = false;
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setCollapsedNodeIds(new Set());
    setCenter(layout.startPos.x + 120, layout.startPos.y + 18, {
      zoom: 0.9,
      duration: 480,
    });
  }, [layout.startPos.x, layout.startPos.y, setCenter]);

  const handleCollapseAll = useCallback(() => {
    const next = new Set<string>();
    for (const [id, kids] of childrenByParent.entries()) {
      if (id === rootNodeId) continue;
      if (kids.length > 0) next.add(id);
    }
    setCollapsedNodeIds(next);
  }, [childrenByParent, rootNodeId]);

  const handleExpandAll = useCallback(() => {
    setCollapsedNodeIds(new Set());
  }, []);

  // Path label for toolbar — short version of breadcrumbs
  const pathLabel = useMemo(() => {
    if (!selectedNodeId) return undefined;
    let cur: QANode | undefined = nodesMap.get(selectedNodeId);
    const trail: string[] = [];
    const seen = new Set<string>();
    while (cur && cur.parentEdgeId && !seen.has(cur.id)) {
      seen.add(cur.id);
      const e = edgesMap.get(cur.parentEdgeId);
      if (!e) break;
      trail.unshift(e.prompt.slice(0, 14));
      cur = nodesMap.get(e.fromNodeId);
    }
    if (trail.length === 0) return 'root';
    return 'root › ' + trail.join(' › ');
  }, [selectedNodeId, nodesMap, edgesMap]);

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
        onCollapseAll={handleCollapseAll}
        onExpandAll={handleExpandAll}
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
