import { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  ListChecks,
  Pin,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { fillTemplate, useI18n } from '@/lib/i18n';
import { summarizeText, formatTokenUsage } from '@/lib/format';
import { resolveStructuredErrorText } from './structuredErrorText';
import type { NodeStatus, QANode } from '@/types';

export interface AnswerNodeData {
  node: QANode;
  childCount: number;
  hiddenDescendantCount: number;
  isCollapsed: boolean;
  isOnPath: boolean;
  isSelected: boolean;
  isRetryDisabled: boolean;
  isDeleteDisabled: boolean;
  isPinned: boolean;
  isForkDisabled: boolean;
  onToggleCollapse?: (id: string) => void;
  onAddBranch?: (id: string) => void;
  onRetry?: (id: string) => void;
  onExpand?: (id: string) => void;
  onRequestDelete?: (id: string) => void;
  /** Concept chip click — defers to AskBox so the user can refine the prompt. */
  onConceptChip?: (concept: string) => void;
  /** Fork one or more sibling branches under this node using the given prompts. */
  onForkPrompts?: (parentNodeId: string, prompts: string[]) => void;
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
    isDeleteDisabled,
    isPinned,
    isForkDisabled,
    onToggleCollapse,
    onAddBranch,
    onRetry,
    onExpand,
    onRequestDelete,
    onConceptChip,
    onForkPrompts,
  } = data as AnswerNodeData;

  const status = node.status;
  const isStreaming = status === 'streaming';
  const isAborted = status === 'aborted';
  const isError = status === 'error';
  const hasChildren = childCount > 0;
  const structured = node.structured;
  const headline = structured?.title?.trim();
  const summaryText = structured?.summary?.trim() || summarizeText(node.content, 220, 'firstBlock');
  const tokens = formatTokenUsage(node.tokenUsage);
  const concepts = structured?.concepts ?? [];
  const suggestions = structured?.suggestedQuestions ?? [];
  const hasConcepts = concepts.length > 0;
  const hasSuggestions = suggestions.length > 0;
  const structuredErrorText = resolveStructuredErrorText(node.structuredError, t.answer);

  return (
    <div
      className={cn(
        'group/node qa-node-enter relative flex h-[280px] w-[340px] flex-col bg-card text-card-foreground',
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
          isOnPath || isSelected ? 'bg-accent/80' : 'bg-hairline/40',
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
          {isPinned && (
            <span
              title={t.answer.pinnedHint}
              aria-label={t.answer.pinnedAria}
              className="inline-flex translate-y-[1px] items-center text-accent/85"
            >
              <Pin className="h-3 w-3 -rotate-12 fill-current" />
            </span>
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
            <RefreshCw className={cn('h-3 w-3', isStreaming && 'animate-spin')} />
          </button>
          <button
            type="button"
            aria-label={t.answer.deleteSubtree}
            title={
              isDeleteDisabled
                ? t.answer.deleteSubtreeDisabledStreaming
                : t.answer.deleteSubtree
            }
            disabled={isDeleteDisabled}
            onClick={(e) => {
              e.stopPropagation();
              if (isDeleteDisabled) return;
              onRequestDelete?.(node.id);
            }}
            className="grid h-6 w-6 place-items-center rounded-sm text-muted-foreground hover:enabled:bg-destructive/10 hover:enabled:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-3 w-3" />
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

      {!isStreaming && structuredErrorText && (
        <div className="flex items-center gap-2 border-b border-border/60 bg-secondary/40 px-3.5 py-1 text-[10.5px] text-muted-foreground">
          <AlertTriangle className="h-3 w-3" />
          <span className="truncate font-mono uppercase tracking-[0.14em]">
            {structuredErrorText}
          </span>
        </div>
      )}

      {/* Body — title + summary preview, faded at bottom */}
      <div className="relative flex-1 overflow-hidden">
        <div
          className={cn(
            'qa-fade-mask flex h-full flex-col gap-1.5 px-4 pb-2.5 pt-2.5',
            isStreaming && 'qa-stream-cursor',
          )}
        >
          {headline && (
            <h3
              className="font-display text-[15.5px] italic leading-tight text-foreground"
              style={{ fontFeatureSettings: '"ss01"' }}
            >
              {headline}
            </h3>
          )}
          <div
            className="flex-1 overflow-hidden text-[13px] leading-[1.55] text-foreground/90"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 400 }}
          >
            {summaryText || (
              <span className="font-sans text-[12.5px] italic text-muted-foreground/70">
                {isStreaming ? t.answer.generating : t.answer.emptyAnswer}
              </span>
            )}
          </div>
        </div>
      </div>

      {hasConcepts && (
        <ConceptStrip
          concepts={concepts}
          disabled={isForkDisabled || !onConceptChip}
          onPick={(c) => onConceptChip?.(c)}
        />
      )}

      {hasSuggestions && (
        <SuggestedStrip
          suggestions={suggestions}
          disabled={isForkDisabled}
          onForkOne={(prompt) => onForkPrompts?.(node.id, [prompt])}
          onForkMany={(prompts) => onForkPrompts?.(node.id, prompts)}
        />
      )}

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

function ConceptStrip({
  concepts,
  disabled,
  onPick,
}: {
  concepts: string[];
  disabled: boolean;
  onPick: (concept: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className="flex flex-wrap items-center gap-1 border-t border-border/60 bg-background/30 px-3 py-1.5"
      title={t.answer.conceptChipHint}
    >
      <span
        className="mr-1 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/70"
      >
        {t.answer.conceptsHeading} ·
      </span>
      {concepts.slice(0, 6).map((c) => (
        <button
          key={c}
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            if (disabled) return;
            onPick(c);
          }}
          className={cn(
            'rounded-[3px] border border-hairline/50 bg-background/40 px-1.5 py-0.5',
            'font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground',
            'transition-colors hover:enabled:border-accent/50 hover:enabled:text-foreground',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

function SuggestedStrip({
  suggestions,
  disabled,
  onForkOne,
  onForkMany,
}: {
  suggestions: string[];
  disabled: boolean;
  onForkOne: (prompt: string) => void;
  onForkMany: (prompts: string[]) => void;
}) {
  const { t } = useI18n();
  // null = single-click mode; Set = multi-select mode (entries are picked).
  // Single state keeps mode + selection in lockstep — no desync risk.
  const [selection, setSelection] = useState<Set<string> | null>(null);
  const multi = selection != null;
  const pickedSize = selection?.size ?? 0;

  const toggle = (q: string) => {
    setSelection((prev) => {
      if (!prev) return prev;
      const next = new Set(prev);
      if (next.has(q)) next.delete(q);
      else next.add(q);
      return next;
    });
  };

  const submit = () => {
    if (!selection || selection.size === 0) return;
    // Preserve the model's ordering rather than Set insertion order so paths
    // feel intentional.
    const ordered = suggestions.filter((q) => selection.has(q));
    onForkMany(ordered);
    setSelection(null);
  };

  return (
    <div
      className="flex flex-col gap-1 border-t border-accent/25 bg-accent/[0.04] px-3 pb-1.5 pt-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3 w-3 text-accent" />
        <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-accent">
          {t.answer.suggestedHeading}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground/60">
          · {multi ? `${pickedSize}/${suggestions.length}` : t.answer.suggestedSingleHint}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSelection(multi ? null : new Set());
          }}
          className={cn(
            'ml-auto flex items-center gap-1 rounded-[2px] border px-1.5 py-px',
            'font-mono text-[9.5px] uppercase tracking-[0.16em] transition-colors',
            multi
              ? 'border-accent bg-accent text-accent-foreground'
              : 'border-hairline/50 text-muted-foreground hover:border-accent/60 hover:text-accent',
          )}
        >
          <ListChecks className="h-2.5 w-2.5" />
          {multi ? t.answer.suggestedExitMulti : t.answer.suggestedMultiSelect}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {suggestions.slice(0, 6).map((q) => {
          const active = selection?.has(q) ?? false;
          return (
            <button
              key={q}
              type="button"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                if (disabled) return;
                if (multi) toggle(q);
                else onForkOne(q);
              }}
              className={cn(
                'flex items-center gap-1 rounded-[3px] border px-1.5 py-0.5',
                'font-display text-[11.5px] italic leading-tight text-foreground',
                'transition-colors',
                multi && active
                  ? 'border-accent bg-accent/15 text-foreground'
                  : 'border-accent/35 bg-card hover:enabled:border-accent hover:enabled:bg-accent/10',
                'disabled:cursor-not-allowed disabled:opacity-40',
              )}
              title={q}
            >
              {multi && (
                <span
                  className={cn(
                    'grid h-3 w-3 place-items-center rounded-[1px] border',
                    active
                      ? 'border-accent bg-accent text-accent-foreground'
                      : 'border-hairline/60 bg-background',
                  )}
                >
                  {active && <Check className="h-2 w-2" />}
                </span>
              )}
              <span className="max-w-[180px] truncate">{q}</span>
            </button>
          );
        })}
      </div>
      {multi && (
        <div className="flex items-center gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSelection(new Set(suggestions));
            }}
            className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
          >
            {t.answer.suggestedSelectAll}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSelection(new Set());
            }}
            className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
          >
            {t.answer.suggestedSelectClear}
          </button>
          <button
            type="button"
            disabled={disabled || pickedSize === 0}
            onClick={(e) => {
              e.stopPropagation();
              submit();
            }}
            title={pickedSize === 0 ? t.answer.suggestedBatchEmpty : undefined}
            className={cn(
              'ml-auto flex items-center gap-1 rounded-[2px] border px-2 py-px',
              'font-mono text-[9.5px] uppercase tracking-[0.18em] transition-colors',
              'border-accent/60 text-accent hover:enabled:bg-accent hover:enabled:text-accent-foreground',
              'disabled:cursor-not-allowed disabled:opacity-40',
            )}
          >
            {fillTemplate(t.answer.suggestedBatchSubmit, { n: pickedSize })}
          </button>
        </div>
      )}
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
    if (a.node.structuredError !== b.node.structuredError) return false;
    if (a.node.structured !== b.node.structured) return false;
    if (a.node.model !== b.node.model) return false;
    if (a.node.tokenUsage !== b.node.tokenUsage) return false;
  }
  if (a.childCount !== b.childCount) return false;
  if (a.hiddenDescendantCount !== b.hiddenDescendantCount) return false;
  if (a.isCollapsed !== b.isCollapsed) return false;
  if (a.isOnPath !== b.isOnPath) return false;
  if (a.isSelected !== b.isSelected) return false;
  if (a.isRetryDisabled !== b.isRetryDisabled) return false;
  if (a.isDeleteDisabled !== b.isDeleteDisabled) return false;
  if (a.isPinned !== b.isPinned) return false;
  if (a.isForkDisabled !== b.isForkDisabled) return false;
  // Callbacks come from useCallback in TreeCanvas — referentially stable, skip.
  return true;
}

export const AnswerNode = memo(AnswerNodeComponent, answerNodePropsEqual);
