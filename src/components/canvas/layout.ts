import dagre from 'dagre';
import type { QAEdge, QANode } from '@/types';

export const NODE_WIDTH = 340;
export const NODE_HEIGHT = 200;
export const START_PILL_WIDTH = 76;
export const START_PILL_HEIGHT = 36;
export const RANK_SEP = 220;
export const NODE_SEP = 64;
export const EDGE_SEP = 28;

export interface PositionedNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedEdge {
  id: string;
  source: string; // fromNodeId, "__start__" for the leftmost edges from virtual root
  target: string;
  prompt: string;
  rawFromNodeId: string;
}

export interface LayoutResult {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  startPos: { x: number; y: number };
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

const START_ID = '__start__';

/**
 * Walk down from each collapsed ancestor and mark all descendants as hidden.
 * Collapsed node itself is still visible — only its subtree disappears.
 */
function computeHiddenSet(
  edges: ReadonlyMap<string, QAEdge>,
  collapsedNodeIds: ReadonlySet<string>,
): Set<string> {
  if (collapsedNodeIds.size === 0) return new Set();
  const childMap = new Map<string, string[]>();
  for (const e of edges.values()) {
    const arr = childMap.get(e.fromNodeId) ?? [];
    arr.push(e.toNodeId);
    childMap.set(e.fromNodeId, arr);
  }
  const hidden = new Set<string>();
  const queue: string[] = [];
  for (const id of collapsedNodeIds) {
    for (const child of childMap.get(id) ?? []) queue.push(child);
  }
  while (queue.length) {
    const id = queue.shift()!;
    if (hidden.has(id)) continue;
    hidden.add(id);
    for (const c of childMap.get(id) ?? []) queue.push(c);
  }
  return hidden;
}

export function layoutTree(args: {
  nodes: ReadonlyMap<string, QANode>;
  edges: ReadonlyMap<string, QAEdge>;
  collapsedNodeIds: ReadonlySet<string>;
  rootNodeId: string;
  /**
   * Manually-pinned positions (top-left). Pinned nodes are still passed through
   * dagre so unpinned siblings/children get reasonable auto-layout, then the
   * stored values overwrite dagre's output for pinned ids only.
   */
  positions?: Readonly<Record<string, { x: number; y: number }>>;
}): LayoutResult {
  const { nodes, edges, collapsedNodeIds, rootNodeId, positions } = args;
  const hidden = computeHiddenSet(edges, collapsedNodeIds);

  const g = new dagre.graphlib.Graph({ multigraph: false });
  g.setGraph({
    rankdir: 'LR',
    ranksep: RANK_SEP,
    nodesep: NODE_SEP,
    edgesep: EDGE_SEP,
    ranker: 'tight-tree',
    marginx: 64,
    marginy: 64,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Virtual start node (for the first hop from root → first answers)
  g.setNode(START_ID, { width: START_PILL_WIDTH, height: START_PILL_HEIGHT });

  // Real assistant nodes (root excluded — never rendered)
  for (const node of nodes.values()) {
    if (node.id === rootNodeId) continue;
    if (hidden.has(node.id)) continue;
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  // Edges: rewrite root-origin edges to start from START_ID
  const positionedEdges: PositionedEdge[] = [];
  for (const e of edges.values()) {
    if (hidden.has(e.toNodeId)) continue;
    if (hidden.has(e.fromNodeId) && e.fromNodeId !== rootNodeId) continue;
    const source = e.fromNodeId === rootNodeId ? START_ID : e.fromNodeId;
    g.setEdge(source, e.toNodeId);
    positionedEdges.push({
      id: e.id,
      source,
      target: e.toNodeId,
      prompt: e.prompt,
      rawFromNodeId: e.fromNodeId,
    });
  }

  dagre.layout(g);

  const positionedNodes: PositionedNode[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  let startPos = { x: 0, y: 0 };
  for (const id of g.nodes()) {
    const v = g.node(id);
    if (!v) continue;
    // dagre returns center coords — convert to top-left for React Flow
    let x = v.x - v.width / 2;
    let y = v.y - v.height / 2;
    if (id === START_ID) {
      startPos = { x, y };
    } else {
      const pinned = positions?.[id];
      if (pinned) {
        x = pinned.x;
        y = pinned.y;
      }
      positionedNodes.push({ id, x, y, width: v.width, height: v.height });
    }
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + v.width);
    maxY = Math.max(maxY, y + v.height);
  }

  if (minX === Infinity) {
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }

  return {
    nodes: positionedNodes,
    edges: positionedEdges,
    startPos,
    bounds: { minX, minY, maxX, maxY },
  };
}

export const START_NODE_ID = START_ID;
