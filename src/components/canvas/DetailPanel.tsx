import { Fragment, useMemo } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTreeStore } from '@/stores/treeStore';
import { useSessionsStore, selectCurrentSession } from '@/stores/sessionsStore';
import { useResolvedProvider } from '@/hooks/useResolvedProvider';
import { useI18n, fillTemplate } from '@/lib/i18n';
import { walkPathToRoot } from '@/lib/context';
import { summarizeText, formatAbsoluteTime, formatTokenUsage } from '@/lib/format';
import { STATUS_BADGE_STYLE } from './AnswerNode';
import type { NodeStatus, QANode } from '@/types';

const STATUS_LABEL: Record<NodeStatus, string> = {
  streaming: 'STREAMING',
  done: 'DONE',
  aborted: 'ABORTED',
  error: 'ERROR',
};

interface BreadcrumbSeg {
  id: string;
  kind: 'root' | 'node' | 'edge';
  label: string;
}

const BREADCRUMB_BASE =
  'truncate transition-colors hover:text-foreground hover:underline underline-offset-[3px]';

function breadcrumbClass(seg: BreadcrumbSeg, isLast: boolean): string {
  if (seg.kind === 'root')
    return cn(BREADCRUMB_BASE, 'font-display text-[11px] italic text-muted-foreground');
  const base = cn(BREADCRUMB_BASE, 'font-mono text-[10px] uppercase tracking-[0.16em]');
  if (seg.kind === 'edge') return cn(base, 'text-accent');
  return cn(base, isLast ? 'text-foreground' : 'text-muted-foreground');
}

export function DetailPanel() {
  const { t } = useI18n();
  const nodes = useTreeStore((s) => s.nodes);
  const edges = useTreeStore((s) => s.edges);
  const treeNodeCount = useTreeStore((s) => s.nodes.size);
  const selectedNodeId = useTreeStore((s) => s.selectedNodeId);
  const selectedEdgeId = useTreeStore((s) => s.selectedEdgeId);
  const streamingNodeIds = useTreeStore((s) => s.streamingNodeIds);
  const activeStreamSessionId = useTreeStore((s) => s.activeStreamSessionId);
  const loadedSessionId = useTreeStore((s) => s.loadedSessionId);
  const selectNode = useTreeStore((s) => s.selectNode);
  const selectEdge = useTreeStore((s) => s.selectEdge);
  const requestDeleteSubtree = useTreeStore((s) => s.requestDeleteSubtree);
  const requestRegenerateFork = useTreeStore((s) => s.requestRegenerateFork);
  const session = useSessionsStore(selectCurrentSession);
  const { provider } = useResolvedProvider();

  const blockedByOtherSession =
    activeStreamSessionId !== null && activeStreamSessionId !== loadedSessionId;
  const canFork = provider != null && !blockedByOtherSession;

  const trail: BreadcrumbSeg[] = useMemo(() => {
    if (!selectedNodeId && !selectedEdgeId) return [];
    const anchorNodeId = selectedNodeId ?? edges.get(selectedEdgeId!)?.toNodeId;
    if (!anchorNodeId) return [];
    const walk = walkPathToRoot(nodes, edges, anchorNodeId);
    if (walk.length === 0) return [];
    const segs: BreadcrumbSeg[] = [];
    let depth = 0;
    for (const { node } of walk) {
      if (!node) continue;
      if (node.role === 'root') {
        segs.push({ id: node.id, kind: 'root', label: 'root' });
      } else {
        depth += 1;
        segs.push({
          id: node.id,
          kind: 'node',
          label: `A${depth} · ${summarizeText(node.content, 14)}`,
        });
      }
    }
    if (selectedEdgeId) {
      const edge = edges.get(selectedEdgeId);
      if (edge) {
        segs.push({
          id: edge.id,
          kind: 'edge',
          label: `Q${depth + 1} · ${summarizeText(edge.prompt, 14) || t.detail.emptyPrompt}`,
        });
      }
    }
    return segs;
  }, [edges, nodes, selectedNodeId, selectedEdgeId, t.detail.emptyPrompt]);

  const selectedNode = selectedNodeId ? nodes.get(selectedNodeId) : undefined;
  const selectedEdge = selectedEdgeId ? edges.get(selectedEdgeId) : undefined;

  const goto = (seg: BreadcrumbSeg) => {
    if (seg.kind === 'edge') selectEdge(seg.id);
    else if (seg.kind === 'root') selectNode(null);
    else selectNode(seg.id);
  };

  const hasSelection = trail.length > 0;

  // Streaming descendants don't block deletion: the dialog warns and the
  // store action aborts them. Only the clicked node itself blocks.
  const canDeleteSelected =
    selectedNode != null &&
    selectedNode.role !== 'root' &&
    !streamingNodeIds.has(selectedNode.id);
  const canRegenerateSelected =
    canFork &&
    selectedNode != null &&
    selectedNode.role !== 'root' &&
    !streamingNodeIds.has(selectedNode.id);

  return (
    <div className="flex shrink-0 flex-col border-b border-border/60 bg-card/95">
      {/* Line 1 — breadcrumb (or empty-state session label) */}
      <div className="flex h-7 items-center gap-1.5 px-4">
        {hasSelection ? (
          <nav className="flex flex-1 items-center gap-1.5 overflow-hidden">
            {trail.map((seg, i) => (
              <Fragment key={`${seg.kind}-${seg.id}`}>
                {i > 0 && (
                  <span className="font-mono text-[9px] text-muted-foreground/40">
                    {seg.kind === 'edge' ? '→' : '›'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => goto(seg)}
                  className={breadcrumbClass(seg, i === trail.length - 1)}
                  title={seg.label}
                >
                  {seg.label}
                </button>
              </Fragment>
            ))}
          </nav>
        ) : (
          <div className="flex flex-1 items-baseline gap-2 overflow-hidden">
            {session ? (
              <>
                <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground/70">
                  {t.detail.sessionLabel}
                </span>
                <span
                  className="truncate font-display text-[12.5px] italic text-foreground/80"
                  style={{ fontFeatureSettings: '"ss01"' }}
                  title={session.title}
                >
                  {session.title}
                </span>
                <span className="font-mono text-[9.5px] text-muted-foreground/40">
                  ·
                </span>
                <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground">
                  {fillTemplate(t.detail.nodesCount, {
                    count: Math.max(0, treeNodeCount - 1),
                  })}
                </span>
              </>
            ) : (
              <span className="font-display text-[12px] italic text-muted-foreground/70">
                {t.ask.noActiveSession}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Line 2 — meta strip (only when something is selected) */}
      {hasSelection && (
        <div className="border-t border-border/40">
          {selectedNode && selectedNode.role !== 'root' && (
            <NodeMetaStrip
              node={selectedNode}
              streaming={streamingNodeIds.has(selectedNode.id)}
              canDelete={canDeleteSelected}
              canRegenerate={canRegenerateSelected}
              onDelete={() => requestDeleteSubtree(selectedNode.id)}
              onRegenerate={() => requestRegenerateFork(selectedNode.id)}
            />
          )}
          {selectedEdge && !selectedNode && (
            <EdgeMetaStrip prompt={selectedEdge.prompt} createdAt={selectedEdge.createdAt} />
          )}
          {selectedNode && selectedNode.role === 'root' && (
            <div className="px-4 py-1.5 font-display text-[12px] italic text-muted-foreground/80">
              {t.detail.rootDescription}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NodeMetaStrip({
  node,
  streaming,
  canDelete,
  canRegenerate,
  onDelete,
  onRegenerate,
}: {
  node: QANode;
  streaming: boolean;
  canDelete: boolean;
  canRegenerate: boolean;
  onDelete: () => void;
  onRegenerate: () => void;
}) {
  const { t } = useI18n();
  const tokens = formatTokenUsage(node.tokenUsage);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
      <span>
        MODEL · <span className="text-foreground/80">{node.model ?? 'unknown'}</span>
      </span>
      {tokens && <span className="text-foreground/80">{tokens}</span>}
      <span>{formatAbsoluteTime(node.createdAt)}</span>
      <span
        className={cn(
          'rounded-[2px] border px-1.5 py-px text-[9px]',
          STATUS_BADGE_STYLE[node.status],
        )}
      >
        {STATUS_LABEL[node.status]}
      </span>
      {node.errorMessage && (
        <span className="normal-case tracking-normal text-destructive/80">
          · {node.errorMessage}
        </span>
      )}
      <button
        type="button"
        disabled={!canRegenerate}
        title={
          streaming
            ? t.answer.regenerateForkDisabledStreaming
            : t.answer.retry
        }
        onClick={onRegenerate}
        className="ml-auto flex items-center gap-1 rounded-[2px] border border-transparent px-1.5 py-px text-accent transition-colors hover:enabled:border-accent/50 hover:enabled:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <RefreshCw className="h-3 w-3" />
        <span>{t.answer.retry}</span>
      </button>
      <button
        type="button"
        disabled={!canDelete}
        title={
          streaming
            ? t.answer.deleteSubtreeDisabledStreaming
            : t.answer.deleteSubtree
        }
        onClick={onDelete}
        className="flex items-center gap-1 rounded-[2px] border border-transparent px-1.5 py-px text-destructive/80 transition-colors hover:enabled:border-destructive/50 hover:enabled:bg-destructive/10 hover:enabled:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Trash2 className="h-3 w-3" />
        <span>{t.answer.deleteSubtree}</span>
      </button>
    </div>
  );
}

function EdgeMetaStrip({
  prompt,
  createdAt,
}: {
  prompt: string;
  createdAt: number;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
      <span>
        Q ·{' '}
        <span className="text-foreground/80">
          {prompt.length} {t.detail.chars}
        </span>
      </span>
      <span>{formatAbsoluteTime(createdAt)}</span>
      <span className="font-display text-[10.5px] italic normal-case tracking-normal text-muted-foreground/70">
        ↳ {t.detail.editForkHint}
      </span>
    </div>
  );
}
