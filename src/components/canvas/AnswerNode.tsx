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
import type { QANode } from '@/types';

export interface AnswerNodeData {
  node: QANode;
  childCount: number;
  hiddenDescendantCount: number;
  isCollapsed: boolean;
  isOnPath: boolean;
  isSelected: boolean;
  onToggleCollapse?: (id: string) => void;
  onAddBranch?: (id: string) => void;
  onRetry?: (id: string) => void;
  onExpand?: (id: string) => void;
  [key: string]: unknown;
}

const ROLE_BADGE = '⌁'; // small editorial glyph for the model strip

function summarize(content: string): string {
  if (!content) return '';
  // First "段" — empty-line break — or first 280 chars.
  const firstBlock = content.split(/\n\s*\n/)[0]?.trim() ?? '';
  if (firstBlock.length > 280) return firstBlock.slice(0, 280).trimEnd() + '…';
  return firstBlock;
}

function formatTokens(usage?: { prompt: number; completion: number }) {
  if (!usage) return null;
  const total = (usage.prompt ?? 0) + (usage.completion ?? 0);
  if (total < 1000) return `${total} tok`;
  return `${(total / 1000).toFixed(1)}k tok`;
}

function AnswerNodeComponent({ data }: NodeProps) {
  const {
    node,
    childCount,
    hiddenDescendantCount,
    isCollapsed,
    isOnPath,
    isSelected,
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
  const summary = summarize(node.content);
  const tokens = formatTokens(node.tokenUsage);

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
            aria-label="重新生成"
            onClick={(e) => {
              e.stopPropagation();
              onRetry?.(node.id);
            }}
            className="grid h-6 w-6 place-items-center rounded-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <RefreshCw className="h-3 w-3" />
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
            {isAborted ? '回答被中止，可能不完整' : node.errorMessage ?? '请求失败'}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRetry?.(node.id);
            }}
            className="font-mono text-[10px] uppercase tracking-wider underline-offset-2 hover:underline"
          >
            重新生成
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
              {isStreaming ? '正在生成…' : '（空回答）'}
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
              ? `+${hiddenDescendantCount} 隐藏`
              : `折叠 ${childCount}`}
          </button>
        ) : (
          <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground/50">
            leaf
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
          展开 →
        </button>
      </div>

      {/* Hover branch-adder — slides out from right edge */}
      <button
        type="button"
        aria-label="新建分支"
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

export const AnswerNode = memo(AnswerNodeComponent);
