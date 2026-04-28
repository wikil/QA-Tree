import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  CornerDownLeft,
  GitFork,
  Pencil,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Markdown } from '@/components/Markdown';
import { useTreeStore } from '@/stores/treeStore';
import { useResolvedProvider } from '@/hooks/useResolvedProvider';
import { useI18n } from '@/lib/i18n';
import { walkPathToRoot } from '@/lib/context';
import { formatAbsoluteTime, formatTokenUsage } from '@/lib/format';
import { STATUS_BADGE_STYLE, SuggestionChip } from './AnswerNode';
import { resolveStructuredErrorText } from './structuredErrorText';
import { MAX_SUGGESTION_CHIPS } from './layout';
import type { NodeStatus, QAEdge, QANode } from '@/types';

const STATUS_LABEL: Record<NodeStatus, string> = {
  streaming: 'STREAMING',
  done: 'DONE',
  aborted: 'ABORTED',
  error: 'ERROR',
};

interface Turn {
  edge: QAEdge;
  node: QANode;
  depth: number;
}

export function ChatThread() {
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
  const forkEditPrompt = useTreeStore((s) => s.forkEditPrompt);
  const requestRegenerateFork = useTreeStore((s) => s.requestRegenerateFork);
  const requestDeleteSubtree = useTreeStore((s) => s.requestDeleteSubtree);
  const abortStream = useTreeStore((s) => s.abortStream);
  const sendPrompt = useTreeStore((s) => s.sendPrompt);
  const { provider, proxy } = useResolvedProvider();

  const blockedByOtherSession =
    activeStreamSessionId !== null && activeStreamSessionId !== loadedSessionId;
  const canFork = provider != null && !blockedByOtherSession;
  const forkUnavailableReason = !provider
    ? t.detail.forkUnavailableNoProvider
    : blockedByOtherSession
      ? t.detail.forkUnavailableBlocked
      : null;

  const anchorId =
    selectedNodeId ??
    (selectedEdgeId ? edges.get(selectedEdgeId)?.toNodeId ?? null : null);

  const turns: Turn[] = useMemo(() => {
    if (!anchorId) return [];
    const walk = walkPathToRoot(nodes, edges, anchorId);
    const out: Turn[] = [];
    let depth = 0;
    for (const step of walk) {
      if (!step.node || step.node.role === 'root' || !step.edge) continue;
      depth += 1;
      out.push({ edge: step.edge, node: step.node, depth });
    }
    return out;
  }, [nodes, edges, anchorId]);

  const empty = turns.length === 0;

  // ---- Inline edit-fork state ----------------------------------------------
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // If the editing edge falls off the path (user clicked another branch),
  // drop the edit silently. Don't disturb edits inside the active path.
  useEffect(() => {
    if (!editingEdgeId) return;
    if (!turns.some((tr) => tr.edge.id === editingEdgeId)) {
      setEditingEdgeId(null);
      setEditDraft('');
    }
  }, [turns, editingEdgeId]);

  useEffect(() => {
    if (!editingEdgeId) return;
    const el = editTextareaRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    try {
      el.setSelectionRange(len, len);
    } catch {
      /* readonly states throw — ignore */
    }
  }, [editingEdgeId]);

  const beginEdit = useCallback((edge: QAEdge) => {
    setEditingEdgeId(edge.id);
    setEditDraft(edge.prompt);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingEdgeId(null);
    setEditDraft('');
  }, []);

  const submitEdit = useCallback(async () => {
    if (!editingEdgeId || !provider) return;
    const trimmed = editDraft.trim();
    if (!trimmed) return;
    try {
      await forkEditPrompt(editingEdgeId, trimmed, { provider, proxy });
      setEditingEdgeId(null);
      setEditDraft('');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[ChatThread] forkEditPrompt failed:', e);
    }
  }, [editingEdgeId, editDraft, provider, proxy, forkEditPrompt]);

  // ---- Scroll: bubble refs + selection-driven scroll-into-view -------------
  const bubbleRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const setBubbleRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) bubbleRefs.current.set(id, el);
    else bubbleRefs.current.delete(id);
  }, []);

  useEffect(() => {
    const targetId = selectedNodeId
      ? `node:${selectedNodeId}`
      : selectedEdgeId
        ? `edge:${selectedEdgeId}`
        : null;
    if (!targetId) return;
    const el = bubbleRefs.current.get(targetId);
    if (!el) return;
    // RAF so layout settles after path recompute
    const raf = requestAnimationFrame(() => {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [selectedNodeId, selectedEdgeId, turns.length]);

  // ---- Pin-to-bottom while the latest assistant streams --------------------
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pinnedToBottomRef = useRef(true);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const c = e.currentTarget;
    const distance = c.scrollHeight - c.scrollTop - c.clientHeight;
    pinnedToBottomRef.current = distance < 80;
  }, []);

  const lastTurn = turns[turns.length - 1] ?? null;
  const lastNodeIsStreaming =
    lastTurn != null && streamingNodeIds.has(lastTurn.node.id);
  const lastNodeContent = lastTurn?.node.content ?? '';

  useEffect(() => {
    if (!lastNodeIsStreaming) return;
    if (!pinnedToBottomRef.current) return;
    const c = scrollContainerRef.current;
    if (!c) return;
    c.scrollTop = c.scrollHeight;
  }, [lastNodeIsStreaming, lastNodeContent]);

  // ---- Suggestion chip fork (last assistant only) --------------------------
  const forkSuggestion = useCallback(
    async (parentNodeId: string, prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed || !provider || !canFork) return;
      try {
        await sendPrompt({ parentNodeId, prompt: trimmed, provider, proxy });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[ChatThread] suggestion fork failed:', e);
      }
    },
    [provider, proxy, canFork, sendPrompt],
  );

  // ---- Render --------------------------------------------------------------
  if (empty) {
    return <EmptyThread loaded={loadedSessionId != null} />;
  }

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="flex h-full flex-col gap-5 overflow-y-auto px-5 py-5"
    >
      {turns.map((turn, i) => {
        const isLast = i === turns.length - 1;
        const isStreaming = streamingNodeIds.has(turn.node.id);
        const isEditing = editingEdgeId === turn.edge.id;
        const userSelected = selectedEdgeId === turn.edge.id;
        const assistantSelected = selectedNodeId === turn.node.id;
        const suggestions =
          isLast && !isStreaming
            ? turn.node.structured?.suggestedQuestions ?? []
            : [];
        return (
          <TurnView
            key={turn.node.id}
            turn={turn}
            isStreaming={isStreaming}
            isEditing={isEditing}
            userSelected={userSelected}
            assistantSelected={assistantSelected}
            canFork={canFork}
            forkUnavailableReason={forkUnavailableReason}
            suggestions={suggestions}
            editDraft={editDraft}
            editTextareaRef={editTextareaRef}
            registerRef={setBubbleRef}
            onSelectEdge={selectEdge}
            onSelectNode={selectNode}
            onBeginEdit={beginEdit}
            onCancelEdit={cancelEdit}
            onChangeEditDraft={setEditDraft}
            onSubmitEdit={submitEdit}
            onRegenerate={requestRegenerateFork}
            onDelete={requestDeleteSubtree}
            onAbort={abortStream}
            onForkSuggestion={(p) => void forkSuggestion(turn.node.id, p)}
          />
        );
      })}
    </div>
  );
}

// --------------------------------------------------------------------------
// TurnView — one user bubble + one assistant bubble.
// --------------------------------------------------------------------------

interface TurnViewProps {
  turn: Turn;
  isStreaming: boolean;
  isEditing: boolean;
  userSelected: boolean;
  assistantSelected: boolean;
  canFork: boolean;
  forkUnavailableReason: string | null;
  suggestions: string[];
  editDraft: string;
  editTextareaRef: React.RefObject<HTMLTextAreaElement>;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
  onSelectEdge: (id: string) => void;
  onSelectNode: (id: string) => void;
  onBeginEdit: (edge: QAEdge) => void;
  onCancelEdit: () => void;
  onChangeEditDraft: (text: string) => void;
  onSubmitEdit: () => void | Promise<void>;
  onRegenerate: (id: string) => void;
  onDelete: (id: string) => void;
  onAbort: (id: string) => void;
  onForkSuggestion: (prompt: string) => void;
}

function TurnView({
  turn,
  isStreaming,
  isEditing,
  userSelected,
  assistantSelected,
  canFork,
  forkUnavailableReason,
  suggestions,
  editDraft,
  editTextareaRef,
  registerRef,
  onSelectEdge,
  onSelectNode,
  onBeginEdit,
  onCancelEdit,
  onChangeEditDraft,
  onSubmitEdit,
  onRegenerate,
  onDelete,
  onAbort,
  onForkSuggestion,
}: TurnViewProps) {
  const { t } = useI18n();
  const { edge, node, depth } = turn;

  // The streaming bubble can't be edited/regenerated/deleted — same gate as
  // canvas + DetailPanel ("当前节点仍在生成，请先中止").
  const editDisabled = !canFork || isStreaming;
  const regenDisabled = !canFork || isStreaming;
  const deleteDisabled = isStreaming;

  return (
    <div className="flex flex-col gap-2.5">
      {/* ---------- User bubble ---------- */}
      <div
        ref={(el) => registerRef(`edge:${edge.id}`, el)}
        onClick={(e) => {
          if (isEditing) return;
          if ((e.target as HTMLElement).closest('button, textarea, [role=button]'))
            return;
          onSelectEdge(edge.id);
        }}
        className={cn(
          'group/user ml-auto flex max-w-[88%] cursor-pointer flex-col gap-1.5',
          'rounded-[3px] border border-hairline/40 bg-secondary/30 px-3.5 py-2',
          'transition-colors hover:border-hairline/80',
          userSelected && 'ring-1 ring-accent/70 border-accent/50',
          isEditing && 'cursor-default ring-1 ring-accent/60 border-accent/60 bg-card/80',
        )}
      >
        <div className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground/80">
          <span className="text-accent">Q{depth}</span>
          <span className="text-muted-foreground/40">·</span>
          <span>
            {edge.prompt.length} {t.detail.chars}
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span>{formatAbsoluteTime(edge.createdAt)}</span>
          <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover/user:opacity-100">
            {!isEditing && (
              <>
                <CopyButton text={edge.prompt} />
                <button
                  type="button"
                  disabled={editDisabled}
                  title={
                    editDisabled
                      ? forkUnavailableReason ?? t.detail.editForkHint
                      : t.detail.editFork
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    if (editDisabled) return;
                    onBeginEdit(edge);
                  }}
                  className={cn(
                    'flex items-center gap-1 rounded-[2px] border border-transparent px-1.5 py-px',
                    'text-accent transition-colors hover:enabled:border-accent/50 hover:enabled:bg-accent/10',
                    'disabled:cursor-not-allowed disabled:opacity-40',
                  )}
                >
                  <Pencil className="h-3 w-3" />
                  <span>{t.common.edit}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {isEditing ? (
          <div className="flex flex-col gap-2 pt-1">
            <textarea
              ref={editTextareaRef}
              rows={4}
              value={editDraft}
              onChange={(e) => onChangeEditDraft(e.target.value)}
              onKeyDown={(e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void onSubmitEdit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  onCancelEdit();
                }
              }}
              placeholder={t.detail.editForkPlaceholder}
              className={cn(
                'w-full resize-y rounded-[2px] border border-accent/40 bg-background/70 px-3 py-2',
                'text-[13.5px] leading-[1.55] text-foreground outline-none focus:border-accent',
              )}
              style={{ fontFamily: 'var(--font-display)' }}
            />
            <div className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground">
              <GitFork className="h-3 w-3 text-accent" />
              <span>{t.detail.editForkBannerTitle}</span>
              <button
                type="button"
                onClick={onCancelEdit}
                className="ml-auto rounded-[2px] border border-hairline/60 px-2 py-1 text-muted-foreground hover:border-hairline hover:text-foreground"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                onClick={() => void onSubmitEdit()}
                disabled={editDisabled || editDraft.trim().length === 0}
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
          <p
            className="whitespace-pre-wrap text-[14px] leading-[1.55] text-foreground"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {edge.prompt || (
              <span className="italic text-muted-foreground/70">
                {t.detail.emptyPrompt}
              </span>
            )}
          </p>
        )}
      </div>

      {/* ---------- Assistant bubble ---------- */}
      <AssistantBubble
        node={node}
        depth={depth}
        isStreaming={isStreaming}
        selected={assistantSelected}
        regenDisabled={regenDisabled}
        deleteDisabled={deleteDisabled}
        forkUnavailableReason={forkUnavailableReason}
        suggestions={suggestions}
        registerRef={registerRef}
        onSelect={() => onSelectNode(node.id)}
        onRegenerate={() => onRegenerate(node.id)}
        onDelete={() => onDelete(node.id)}
        onAbort={() => onAbort(node.id)}
        onForkSuggestion={onForkSuggestion}
        suggestionsDisabled={!canFork}
      />
    </div>
  );
}

// --------------------------------------------------------------------------
// AssistantBubble
// --------------------------------------------------------------------------

interface AssistantBubbleProps {
  node: QANode;
  depth: number;
  isStreaming: boolean;
  selected: boolean;
  regenDisabled: boolean;
  deleteDisabled: boolean;
  forkUnavailableReason: string | null;
  suggestions: string[];
  registerRef: (id: string, el: HTMLDivElement | null) => void;
  onSelect: () => void;
  onRegenerate: () => void;
  onDelete: () => void;
  onAbort: () => void;
  onForkSuggestion: (prompt: string) => void;
  suggestionsDisabled: boolean;
}

function AssistantBubble({
  node,
  depth,
  isStreaming,
  selected,
  regenDisabled,
  deleteDisabled,
  forkUnavailableReason,
  suggestions,
  registerRef,
  onSelect,
  onRegenerate,
  onDelete,
  onAbort,
  onForkSuggestion,
  suggestionsDisabled,
}: AssistantBubbleProps) {
  const { t } = useI18n();
  const tokens = formatTokenUsage(node.tokenUsage);
  const structuredErrorText = resolveStructuredErrorText(
    node.structuredError,
    t.answer,
  );
  const headline = node.structured?.title?.trim();
  const summary = node.structured?.summary?.trim();
  const hasContent = node.content.trim().length > 0;

  return (
    <div
      ref={(el) => registerRef(`node:${node.id}`, el)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, a, [role=button]')) return;
        onSelect();
      }}
      className={cn(
        'group/asst relative mr-auto w-full max-w-[97%] cursor-pointer',
        'rounded-[3px] border border-hairline/40 bg-card/95 px-4 pb-3 pt-2.5',
        'transition-colors hover:border-hairline/80',
        selected && 'ring-1 ring-accent/70 border-accent/50',
        isStreaming && 'qa-stream-cursor',
      )}
    >
      <div className="flex items-center gap-2 pb-1.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground/80">
        <span className="text-accent">A{depth}</span>
        <span className="text-muted-foreground/40">·</span>
        <span className="truncate text-foreground/70">
          {node.model ?? 'unknown'}
        </span>
        {tokens && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span>{tokens}</span>
          </>
        )}
        <span className="text-muted-foreground/40">·</span>
        <span>{formatAbsoluteTime(node.createdAt)}</span>
        <span
          className={cn(
            'rounded-[2px] border px-1.5 py-px text-[9px]',
            STATUS_BADGE_STYLE[node.status],
          )}
        >
          {STATUS_LABEL[node.status]}
        </span>
        {isStreaming && (
          <span className="inline-flex h-1.5 w-1.5 items-center">
            <span className="absolute inline-flex h-1.5 w-1.5 animate-ping rounded-full bg-accent/60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
        )}

        <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover/asst:opacity-100">
          {hasContent && <CopyButton text={node.content} />}
          {isStreaming ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAbort();
              }}
              className="flex items-center gap-1 rounded-[2px] border border-accent/60 px-1.5 py-px text-accent hover:bg-accent hover:text-accent-foreground"
            >
              <X className="h-3 w-3" />
              <span>{t.ask.abort}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={regenDisabled}
                title={
                  regenDisabled
                    ? forkUnavailableReason ??
                      t.answer.regenerateForkDisabledStreaming
                    : t.answer.retry
                }
                onClick={(e) => {
                  e.stopPropagation();
                  if (regenDisabled) return;
                  onRegenerate();
                }}
                className="flex items-center gap-1 rounded-[2px] border border-transparent px-1.5 py-px text-accent transition-colors hover:enabled:border-accent/50 hover:enabled:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <RefreshCw className="h-3 w-3" />
                <span>{t.answer.retry}</span>
              </button>
              <button
                type="button"
                disabled={deleteDisabled}
                title={
                  deleteDisabled
                    ? t.answer.deleteSubtreeDisabledStreaming
                    : t.answer.deleteSubtree
                }
                onClick={(e) => {
                  e.stopPropagation();
                  if (deleteDisabled) return;
                  onDelete();
                }}
                className="flex items-center gap-1 rounded-[2px] border border-transparent px-1.5 py-px text-destructive/80 transition-colors hover:enabled:border-destructive/50 hover:enabled:bg-destructive/10 hover:enabled:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-3 w-3" />
                <span>{t.answer.deleteSubtree}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {(node.status === 'aborted' || node.status === 'error') && (
        <div
          className={cn(
            'mb-2 flex items-center gap-2 rounded-[2px] border px-2 py-1 text-[11px]',
            node.status === 'aborted'
              ? 'border-accent/30 bg-accent/8 text-foreground'
              : 'border-destructive/40 bg-destructive/10 text-destructive',
          )}
        >
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span className="flex-1 truncate">
            {node.status === 'aborted'
              ? t.answer.aborted
              : node.errorMessage ?? t.answer.requestFailed}
          </span>
        </div>
      )}

      {!isStreaming && structuredErrorText && (
        <div className="mb-2 flex items-center gap-2 rounded-[2px] border border-hairline/60 bg-secondary/40 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <AlertTriangle className="h-3 w-3" />
          <span className="truncate">{structuredErrorText}</span>
        </div>
      )}

      {headline && (
        <h3
          className="font-display text-[16.5px] italic leading-tight text-foreground"
          style={{ fontFeatureSettings: '"ss01"' }}
        >
          {headline}
        </h3>
      )}
      {summary && (
        <p className="mt-1 text-[12.5px] italic leading-[1.55] text-muted-foreground">
          {summary}
        </p>
      )}

      <div className={cn((headline || summary) && 'mt-2.5')}>
        {hasContent ? (
          <Markdown content={node.content} />
        ) : isStreaming ? (
          <span className="font-display text-[13px] italic text-muted-foreground/70">
            {t.answer.generating}
          </span>
        ) : (
          <span className="font-display text-[13px] italic text-muted-foreground/70">
            {t.answer.emptyAnswer}
          </span>
        )}
      </div>

      {suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-hairline/40 pt-2">
          <span className="flex w-full items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.18em] text-accent">
            <Sparkles className="h-3 w-3" />
            {t.answer.suggestedHeading}
          </span>
          {suggestions.slice(0, MAX_SUGGESTION_CHIPS).map((q) => (
            <SuggestionChip
              key={q}
              text={q}
              dense
              disabled={suggestionsDisabled}
              onPick={() => onForkSuggestion(q)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// CopyButton — tiny, self-resetting "copied" feedback.
// --------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const onCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        if (timerRef.current != null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => setCopied(false), 1500);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[ChatThread] copy failed:', err);
      }
    },
    [text],
  );

  return (
    <button
      type="button"
      onClick={onCopy}
      title={copied ? t.detail.copied : t.detail.copy}
      className="flex items-center gap-1 rounded-[2px] border border-transparent px-1.5 py-px text-muted-foreground transition-colors hover:border-hairline/60 hover:text-foreground"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-accent" />
          <span>{t.detail.copied}</span>
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          <span>{t.detail.copy}</span>
        </>
      )}
    </button>
  );
}

// --------------------------------------------------------------------------
// EmptyThread
// --------------------------------------------------------------------------

function EmptyThread({ loaded }: { loaded: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <span
        className="font-display text-[15px] italic text-foreground/80"
        style={{ fontFeatureSettings: '"ss01"' }}
      >
        {loaded ? t.detail.threadEmpty : t.ask.noActiveSession}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
        {loaded ? t.detail.threadEmptyHint : ''}
      </span>
    </div>
  );
}
