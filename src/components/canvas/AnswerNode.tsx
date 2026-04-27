import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { summarizeText, formatTokenUsage } from '@/lib/format';
import type { NodeStatus, QANode } from '@/types';

export interface AnswerNodeData {
  node: QANode;
  childCount: number;
  hiddenDescendantCount: number;
  isCollapsed: boolean;
  isOnPath: boolean;
  isSelected: boolean;
  isRetryDisabled: boolean;
  onToggleCollapse?: (id: string) => void;
  onAddBranch?: (id: string) => void;
  onRetry?: (id: string) => void;
  onExpand?: (id: string) => void;
  [key: string]: unknown;
}

const ROLE_BADGE = '⌁';

export const STATUS_BADGE_STYLE: Record<NodeStatus, string> = {
  streaming: 'border-accent/70 text-accent',
  done: 'border-hairline/40 text-foreground/70',
  aborted: 'border-accent/50 text-accent',
  error: 'border-destructive/60 text-destructive',
};

function AnswerNodeComponent({ data }: NodeProps) {
  const { t } = useI18n();
  const {
    node,
    childCount,
    hiddenDescendantCount,
    isCollapsed,
    isOnPath,
    isSelected,
    isRetryDisabled,
    onToggleCollapse,
    onAddBranch,
    onRetry,
    onExpand,
  } = data as AnswerNodeData;

  const status = node.status;
  const isStreaming = status === 'streaming';
  const isAborted = status === 'aborted';
  const isError = status === 'error';
  const hasChildren = childCount > 0;
  const summary = summarizeText(node.content, 280, 'firstBlock');
  const tokens = formatTokenUsage(node.tokenUsage);

  return (
    <div
      className={cn(
        'group/node qa-node-enter relative flex h-[200px] w-[340px] flex-col bg-card text-card-foreground',
        'rounded-[var(--radius)] qa-card-shadow',
        isSelected && 'qa-card-shadow-active',
        !isSelected && isOnPath && 'ring-1 ring-accent/60',
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="qa-handle"
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="qa-handle"
        isConnectable={false}
      />

      {/* Top-edge ink rule — the parchment binding */}
      <div
        className={cn(
          'absolute left-3 right-3 top-0 h-px',
          isOnPath || isSelected
            ? 'bg-accent/80'
            : 'bg-hairline/40',
        )}
      />

      {/* Header strip */}
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3.5 pb-1.5 pt-3">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="text-accent text-[11px] leading-none">{ROLE_BADGE}</span>
          <span className="truncate font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground">
            {node.model ?? 'unknown'}
          </span>
          {tokens && (
            <>
              <span className="text-muted-foreground/50 text-[10px]">·</span>
              <span className="font-mono text-[10px] text-muted-foreground/80">
                {tokens}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-0.5 opacity-60 transition-opacity group-hover/node:opacity-100">
          <button
            type="button"
            aria-label={t.answer.retry}
            title={isRetryDisabled ? t.answer.retryDisabled : t.answer.retry}
            disabled={isRetryDisabled}
            onClick={(e) => {
              e.stopPropagation();
              if (isRetryDisabled) return;
              onRetry?.(node.id);
            }}
            className="grid h-6 w-6 place-items-center rounded-sm text-muted-foreground hover:enabled:bg-secondary hover:enabled:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCw className={cn('h-3 w-3', isRetryDisabled && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Status banner (aborted / error) */}
      {(isAborted || isError) && (
        <div
          className={cn(
            'flex items-center gap-2 border-b border-border/60 px-3.5 py-1.5 text-[11px]',
            isAborted ? 'bg-accent/8 text-foreground' : 'bg-destructive/10 text-destructive',
          )}
        >
          <AlertTriangle className="h-3 w-3" />
          <span className="flex-1 truncate">
            {isAborted ? t.answer.aborted : node.errorMessage ?? t.answer.requestFailed}
          </span>
          <button
            type="button"
            disabled={isRetryDisabled}
            onClick={(e) => {
              e.stopPropagation();
              if (isRetryDisabled) return;
              onRetry?.(node.id);
            }}
            className="font-mono text-[10px] uppercase tracking-wider underline-offset-2 hover:enabled:underline disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t.answer.retry}
          </button>
        </div>
      )}

      {/* Body — first-paragraph summary, faded at bottom */}
      <div className="relative flex-1 overflow-hidden">
        <div
          className={cn(
            'qa-fade-mask h-full px-4 pb-3 pt-2.5 text-[13.5px] leading-[1.55] text-foreground/90',
            isStreaming && 'qa-stream-cursor',
          )}
          style={{ fontFamily: 'var(--font-display)', fontWeight: 400 }}
        >
          {summary || (
            <span className="font-sans text-[12.5px] italic text-muted-foreground/70">
              {isStreaming ? t.answer.generating : t.answer.emptyAnswer}
            </span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border/60 px-3 py-1.5">
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse?.(node.id);
            }}
            className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            {isCollapsed ? (
              <ChevronRight className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            {isCollapsed
              ? `+${hiddenDescendantCount} ${t.answer.hidden}`
              : `${t.answer.collapse} ${childCount}`}
          </button>
        ) : (
          <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground/50">
            {t.answer.leaf}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onExpand?.(node.id);
          }}
          className="font-display text-[12px] italic text-muted-foreground hover:text-foreground"
        >
          {t.answer.expand}
        </button>
      </div>

      {/* Hover branch-adder — slides out from right edge */}
      <button
        type="button"
        aria-label={t.answer.addBranch}
        onClick={(e) => {
          e.stopPropagation();
          onAddBranch?.(node.id);
        }}
        className={cn(
          'absolute -right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center',
          'rounded-full border border-hairline/60 bg-card text-foreground',
          'opacity-0 transition-all duration-200 ease-out',
          'group-hover/node:opacity-100 group-hover/node:translate-x-1',
          'hover:bg-accent hover:text-accent-foreground hover:border-accent',
        )}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function answerNodePropsEqual(
  prev: Readonly<NodeProps>,
  next: Readonly<NodeProps>,
): boolean {
  if (prev.id !== next.id) return false;
  if (prev.selected !== next.selected) return false;
  if (prev.dragging !== next.dragging) return false;
  const a = prev.data as AnswerNodeData;
  const b = next.data as AnswerNodeData;
  if (a === b) return true;
  if (a.node !== b.node) {
    if (a.node.content !== b.node.content) return false;
    if (a.node.status !== b.node.status) return false;
    if (a.node.errorMessage !== b.node.errorMessage) return false;
    if (a.node.model !== b.node.model) return false;
    if (a.node.tokenUsage !== b.node.tokenUsage) return false;
  }
  if (a.childCount !== b.childCount) return false;
  if (a.hiddenDescendantCount !== b.hiddenDescendantCount) return false;
  if (a.isCollapsed !== b.isCollapsed) return false;
  if (a.isOnPath !== b.isOnPath) return false;
  if (a.isSelected !== b.isSelected) return false;
  if (a.isRetryDisabled !== b.isRetryDisabled) return false;
  // Callbacks come from useCallback in TreeCanvas — referentially stable, skip.
  return true;
}

export const AnswerNode = memo(AnswerNodeComponent, answerNodePropsEqual);
