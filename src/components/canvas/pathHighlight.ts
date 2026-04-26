import type { QAEdge, QANode } from '@/types';

export interface PathHighlight {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
}

export const EMPTY_HIGHLIGHT: PathHighlight = {
  nodeIds: new Set(),
  edgeIds: new Set(),
};

/**
 * Walk parentEdge chain from selectedNodeId up to root, returning sets of
 * node ids and edge ids on that path. Used by the canvas to highlight the
 * trunk on selection — the project's signature visual move.
 *
 * Returns empty sets if the selected node is missing or any link is broken;
 * we never want a half-highlighted path leading the user astray.
 */
export function pathHighlight(args: {
  nodes: ReadonlyMap<string, QANode>;
  edges: ReadonlyMap<string, QAEdge>;
  selectedNodeId: string | null;
}): PathHighlight {
  const { nodes, edges, selectedNodeId } = args;
  if (!selectedNodeId) return EMPTY_HIGHLIGHT;
  const target = nodes.get(selectedNodeId);
  if (!target || target.role === 'root') return EMPTY_HIGHLIGHT;

  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const seen = new Set<string>();
  let cur: QANode | undefined = target;

  while (cur && cur.parentEdgeId) {
    if (seen.has(cur.id)) return EMPTY_HIGHLIGHT;
    seen.add(cur.id);
    if (cur.role !== 'root') nodeIds.add(cur.id);
    const edge = edges.get(cur.parentEdgeId);
    if (!edge) return EMPTY_HIGHLIGHT;
    edgeIds.add(edge.id);
    cur = nodes.get(edge.fromNodeId);
    if (!cur) return EMPTY_HIGHLIGHT;
  }

  return { nodeIds, edgeIds };
}
