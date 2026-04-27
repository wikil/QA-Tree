import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CornerDownLeft,
  GitFork,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Markdown } from '@/components/Markdown';
import { useTreeStore } from '@/stores/treeStore';
import { useResolvedProvider } from '@/hooks/useResolvedProvider';
import { useI18n } from '@/lib/i18n';
import { walkPathToRoot } from '@/lib/context';
import { summarizeText, formatAbsoluteTime, formatTokenUsage } from '@/lib/format';
import { STATUS_BADGE_STYLE } from './AnswerNode';
import { resolveStructuredErrorText } from './structuredErrorText';
import type { NodeStatus, QAEdge, QANode } from '@/types';

const DEFAULT_HEIGHT = 360;
const COLLAPSED_HEIGHT = 32;
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 720;

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

const BREADCRUMB_BASE = 'truncate transition-colors hover:text-foreground hover:underline underline-offset-[3px]';

function breadcrumbClass(seg: BreadcrumbSeg, isLast: boolean): string {
  if (seg.kind === 'root') return cn(BREADCRUMB_BASE, 'font-display text-[11px] italic text-muted-foreground');
  const base = cn(BREADCRUMB_BASE, 'font-mono text-[10px] uppercase tracking-[0.16em]');
  if (seg.kind === 'edge') return cn(base, 'text-accent');
  return cn(base, isLast ? 'text-foreground' : 'text-muted-foreground');
}

export function DetailPanel() {
  const { t } = useI18n();
  const nodes = useTreeStore((s) => s.nodes);
  const edges = useTreeStore((s) => s.edges);
  const selectedNodeId = useTreeStore((s) => s.selectedNodeId);
  const selectedEdgeId = useTreeStore((s) => s.selectedEdgeId);
  const streamingNodeIds = useTreeStore((s) => s.streamingNodeIds);
  const activeStreamSessionId = useTreeStore((s) => s.activeStreamSessionId);
  const loadedSessionId = useTreeStore((s) => s.loadedSessionId);
  const selectNode = useTreeStore((s) => s.selectNode);
  const selectEdge = useTreeStore((s) => s.selectEdge);
  const requestDeleteSubtree = useTreeStore((s) => s.requestDeleteSubtree);
  const requestRegenerateFork = useTreeStore((s) => s.requestRegenerateFork);
  const forkEditPrompt = useTreeStore((s) => s.forkEditPrompt);
  const { provider, proxy } = useResolvedProvider();

  const blockedByOtherSession =
    activeStreamSessionId !== null && activeStreamSessionId !== loadedSessionId;
  const canFork = provider != null && !blockedByOtherSession;

  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editingEdgeId && selectedEdgeId !== editingEdgeId) {
      setEditingEdgeId(null);
      setEditDraft('');
    }
  }, [selectedEdgeId, editingEdgeId]);

  useEffect(() => {
    if (editingEdgeId && editTextareaRef.current) {
      const el = editTextareaRef.current;
      el.focus();
      const len = el.value.length;
      try {
        el.setSelectionRange(len, len);
      } catch {
        /* ignore */
      }
    }
  }, [editingEdgeId]);

  const beginEditPrompt = useCallback((edge: QAEdge) => {
    setEditingEdgeId(edge.id);
    setEditDraft(edge.prompt);
  }, []);

  const cancelEditPrompt = useCallback(() => {
    setEditingEdgeId(null);
    setEditDraft('');
  }, []);

  const submitEditPrompt = useCallback(async () => {
    if (!editingEdgeId || !provider) return;
    const trimmed = editDraft.trim();
    if (!trimmed) return;
    try {
      await forkEditPrompt(editingEdgeId, trimmed, { provider, proxy });
      setEditingEdgeId(null);
      setEditDraft('');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[DetailPanel] forkEditPrompt failed:', e);
    }
  }, [editingEdgeId, editDraft, provider, proxy, forkEditPrompt]);

  const [open, setOpen] = useState(false);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const draggingRef = useRef(false);
  const dragStartYRef = useRef(0);
  const dragStartHRef = useRef(0);

  // Auto-open only on the transition from no-selection → selection. Do NOT
  // override a manual fold, and do NOT auto-close on selection clear.
  const prevHadSelectionRef = useRef(false);
  useEffect(() => {
    const has = selectedNodeId != null || selectedEdgeId != null;
    if (has && !prevHadSelectionRef.current) setOpen(true);
    prevHadSelectionRef.current = has;
  }, [selectedNodeId, selectedEdgeId]);

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
          label: `A${depth} · ${summarizeText(node.content, 18)}`,
        });
      }
    }
    if (selectedEdgeId) {
      const edge = edges.get(selectedEdgeId);
      if (edge) {
        segs.push({
          id: edge.id,
          kind: 'edge',
          label: `Q${depth + 1} · ${summarizeText(edge.prompt, 18) || t.detail.emptyPrompt}`,
        });
      }
    }
    return segs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges, selectedNodeId, selectedEdgeId, t.detail.emptyPrompt]);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (!open) return;
      draggingRef.current = true;
      dragStartYRef.current = e.clientY;
      dragStartHRef.current = height;
    },
    [open, height],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const dy = dragStartYRef.current - e.clientY;
      const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, dragStartHRef.current + dy));
      setHeight(next);
    };
    const onUp = () => {
      draggingRef.current = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const goto = (seg: BreadcrumbSeg) => {
    if (seg.kind === 'edge') selectEdge(seg.id);
    else if (seg.kind === 'root') selectNode(null);
    else selectNode(seg.id);
  };

  const hasSelection = trail.length > 0;
  const totalHeight = open ? height : COLLAPSED_HEIGHT;

  const selectedNode = selectedNodeId ? nodes.get(selectedNodeId) : undefined;
  const selectedEdge = selectedEdgeId ? edges.get(selectedEdgeId) : undefined;

  // Streaming descendants don't block deletion: the dialog warns and the
  // store action aborts them. Only the clicked node itself blocks.
  const canDeleteSelected =
    selectedNode != null &&
    selectedNode.role !== 'root' &&
    !streamingNodeIds.has(selectedNode.id);

  return (
    <div
      className="flex shrink-0 flex-col overflow-hidden border-t border-border/60 bg-card/95 transition-[height] duration-200 ease-out"
      style={{ height: `${totalHeight}px` }}
    >
      <div
        className={cn(
          'group/bar relative flex h-8 shrink-0 items-center px-6 backdrop-blur-[1px]',
          open ? 'cursor-ns-resize' : hasSelection ? 'cursor-pointer' : 'cursor-default',
        )}
        onMouseDown={open ? onDragStart : undefined}
        onClick={!open && hasSelection ? () => setOpen(true) : undefined}
      >
        {open && (
          <span className="pointer-events-none absolute left-1/2 top-[3px] h-[3px] w-6 -translate-x-1/2 rounded-[1px] bg-accent/40 transition-all duration-200 group-hover/bar:w-8 group-hover/bar:bg-accent" />
        )}

        <nav className="flex flex-1 items-center gap-1.5 overflow-hidden">
          {hasSelection ? (
            trail.map((seg, i) => (
              <Fragment key={`${seg.kind}-${seg.id}`}>
                {i > 0 && (
                  <span className="font-mono text-[9px] text-muted-foreground/40">
                    {seg.kind === 'edge' ? '→' : '›'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goto(seg);
                  }}
                  className={breadcrumbClass(seg, i === trail.length - 1)}
                  title={seg.label}
                >
                  {seg.label}
                </button>
              </Fragment>
            ))
          ) : (
            <span className="font-display text-[12px] italic text-muted-foreground/70">
              {t.detail.noSelection}
            </span>
          )}
        </nav>

        {hasSelection && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
            className="ml-2 flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
            aria-label={open ? t.detail.collapsePanel : t.detail.expandPanel}
          >
            {open ? (
              <>
                <ChevronDown className="h-3 w-3" />
                {t.detail.collapse}
              </>
            ) : (
              <>
                <ChevronUp className="h-3 w-3" />
                {t.detail.expand}
              </>
            )}
          </button>
        )}
      </div>

      {open && hasSelection && (
        <div className="flex flex-1 flex-col overflow-hidden border-t border-border/30">
          {selectedNode && selectedNode.role !== 'root' && (
            <NodeMetaStrip
              node={selectedNode}
              canDelete={canDeleteSelected}
              streaming={streamingNodeIds.has(selectedNode.id)}
              canRegenerate={canFork && !streamingNodeIds.has(selectedNode.id)}
              onDelete={() => requestDeleteSubtree(selectedNode.id)}
              onRegenerate={() => requestRegenerateFork(selectedNode.id)}
            />
          )}
          {selectedEdge && !selectedNode && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/30 px-8 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              <span>
                Q ·{' '}
                <span className="text-foreground/80">
                  {selectedEdge.prompt.length} {t.detail.chars}
                </span>
              </span>
              <span>{formatAbsoluteTime(selectedEdge.createdAt)}</span>
              <button
                type="button"
                disabled={!canFork || editingEdgeId === selectedEdge.id}
                onClick={() => beginEditPrompt(selectedEdge)}
                title={
                  !provider
                    ? t.detail.forkUnavailableNoProvider
                    : blockedByOtherSession
                      ? t.detail.forkUnavailableBlocked
                      : t.detail.editForkHint
                }
                className="ml-auto flex items-center gap-1 rounded-[2px] border border-transparent px-1.5 py-px text-accent transition-colors hover:enabled:border-accent/50 hover:enabled:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <GitFork className="h-3 w-3" />
                <span>{t.detail.editFork}</span>
              </button>
            </div>
          )}

          <div className="qa-detail-scroll flex-1 overflow-y-auto px-10 py-6">
            {selectedNode && selectedNode.role !== 'root' && (
              <div className="space-y-4">
                {resolveStructuredErrorText(selectedNode.structuredError, t.answer) && (
                  <div className="rounded-[2px] border border-hairline/60 bg-secondary/40 px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
                    ⚠ {resolveStructuredErrorText(selectedNode.structuredError, t.answer)}
                  </div>
                )}
                {selectedNode.structured?.title && (
                  <h2
                    className="font-display text-[20px] italic leading-tight text-foreground"
                    style={{ fontFeatureSettings: '"ss01"' }}
                  >
                    {selectedNode.structured.title}
                  </h2>
                )}
                {selectedNode.structured?.summary && (
                  <p className="qa-prose-summary text-[13.5px] italic leading-[1.6] text-muted-foreground">
                    {selectedNode.structured.summary}
                  </p>
                )}
                <Markdown content={selectedNode.content || t.detail.emptyNodeMarkdown} />
              </div>
            )}
            {selectedNode && selectedNode.role === 'root' && (
              <p className="font-display text-[14px] italic text-muted-foreground">
                {t.detail.rootDescription}
              </p>
            )}
            {selectedEdge && !selectedNode && (
              <div>
                {editingEdgeId === selectedEdge.id ? (
                  <div className="space-y-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {t.detail.editForkBannerTitle}
                    </p>
                    <textarea
                      ref={editTextareaRef}
                      rows={4}
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                          e.preventDefault();
                          void submitEditPrompt();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelEditPrompt();
                        }
                      }}
                      className={cn(
                        'w-full resize-y rounded-[2px] border border-accent/40 bg-background/60 px-3 py-2',
                        'text-[14px] leading-[1.55] text-foreground outline-none focus:border-accent',
                      )}
                      style={{ fontFamily: 'var(--font-display)' }}
                      placeholder={t.detail.editForkPlaceholder}
                    />
                    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      <span className="text-foreground/70">{t.detail.editForkHint}</span>
                      <button
                        type="button"
                        onClick={cancelEditPrompt}
                        className="ml-auto rounded-[2px] border border-hairline/60 px-2 py-1 text-muted-foreground hover:border-hairline hover:text-foreground"
                      >
                        {t.common.cancel}
                      </button>
                      <button
                        type="button"
                        onClick={() => void submitEditPrompt()}
                        disabled={!provider || editDraft.trim().length === 0}
                        className={cn(
                          'flex items-center gap-1 rounded-[2px] border px-2 py-1',
                          'border-accent/60 text-accent hover:enabled:bg-accent hover:enabled:text-accent-foreground',
                          'disabled:cursor-not-allowed disabled:opacity-40',
                        )}
                      >
                        {t.detail.editForkSubmit}
                        <span className="flex items-center gap-0.5 text-[9px] tracking-[0.22em] opacity-60">
                          ⌘<CornerDownLeft className="h-2.5 w-2.5" />
                        </span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="qa-prose-prompt">{selectedEdge.prompt}</p>
                    <div className="mt-6 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      <span>→</span>
                      <button
                        type="button"
                        className="text-foreground hover:text-accent hover:underline underline-offset-2"
                        onClick={() => selectNode(selectedEdge.toNodeId)}
                      >
                        {t.detail.jumpTarget} A{trail.filter((s) => s.kind === 'node').length}
                      </button>
                      <button
                        type="button"
                        className="ml-auto flex items-center gap-1 text-muted-foreground hover:text-foreground"
                        onClick={() => selectEdge(null)}
                      >
                        {t.detail.cancelSelection} <X className="h-3 w-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

function NodeMetaStrip({
  node,
  canDelete,
  streaming,
  canRegenerate,
  onDelete,
  onRegenerate,
}: {
  node: QANode;
  canDelete: boolean;
  streaming: boolean;
  canRegenerate: boolean;
  onDelete: () => void;
  onRegenerate: () => void;
}) {
  const { t } = useI18n();
  const tokens = formatTokenUsage(node.tokenUsage);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/30 px-8 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
      <span>
        MODEL · <span className="text-foreground/80">{node.model ?? 'unknown'}</span>
      </span>
      {tokens && <span className="text-foreground/80">{tokens}</span>}
      <span>{formatAbsoluteTime(node.createdAt)}</span>
      <span className={cn('rounded-[2px] border px-1.5 py-px text-[9px]', STATUS_BADGE_STYLE[node.status])}>
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
