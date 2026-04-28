import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, CornerDownLeft, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SuggestionChip } from './AnswerNode';
import { MAX_SUGGESTION_CHIPS } from './layout';
import { useTreeStore } from '@/stores/treeStore';
import { useSessionsStore } from '@/stores/sessionsStore';
import { useResolvedProvider } from '@/hooks/useResolvedProvider';
import { useI18n } from '@/lib/i18n';
import { walkPathToRoot } from '@/lib/context';
import { summarizeText } from '@/lib/format';

export interface AskBoxHandle {
  focus: () => void;
  /**
   * Replace the current draft and focus the textarea with the cursor at the
   * end. Used by node concept chips so the user can refine the injected
   * prompt before sending instead of forking immediately.
   */
  prefill: (text: string) => void;
}

interface BannerKind {
  variant: 'idle' | 'aborted' | 'no-session';
  label: string;
}

function placeholderFor(opts: {
  noSession: boolean;
  noProvider: boolean;
  blockedByOtherSession: boolean;
  parentStreaming: boolean;
  labels: {
    noSessionPlaceholder: string;
    noProviderPlaceholder: string;
    blockedPlaceholder: string;
    parentStreamingPlaceholder: string;
    promptPlaceholder: string;
  };
}): string {
  if (opts.noSession) return opts.labels.noSessionPlaceholder;
  if (opts.noProvider) return opts.labels.noProviderPlaceholder;
  if (opts.blockedByOtherSession) return opts.labels.blockedPlaceholder;
  if (opts.parentStreaming) return opts.labels.parentStreamingPlaceholder;
  return opts.labels.promptPlaceholder;
}

export const AskBox = forwardRef<AskBoxHandle>(function AskBox(_, ref) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [draft, setDraft] = useState('');
  const { t } = useI18n();

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    prefill: (text: string) => {
      setDraft(text);
      const el = textareaRef.current;
      if (!el) return;
      // Defer to next frame so the value lands before we move the caret.
      requestAnimationFrame(() => {
        el.focus();
        const len = el.value.length;
        try {
          el.setSelectionRange(len, len);
        } catch {
          /* some readonly states throw — safe to ignore */
        }
      });
    },
  }));

  const { session, provider, proxy } = useResolvedProvider();

  const nodes = useTreeStore((s) => s.nodes);
  const edges = useTreeStore((s) => s.edges);
  const selectedNodeId = useTreeStore((s) => s.selectedNodeId);
  const sendPrompt = useTreeStore((s) => s.sendPrompt);
  const abortStream = useTreeStore((s) => s.abortStream);
  const abortSessionStreams = useTreeStore((s) => s.abortSessionStreams);
  const activeStreamSessionId = useTreeStore((s) => s.activeStreamSessionId);
  const streamingNodeIds = useTreeStore((s) => s.streamingNodeIds);
  const loadedSessionId = useTreeStore((s) => s.loadedSessionId);
  const activeStreamSession = useSessionsStore((s) =>
    activeStreamSessionId
      ? s.sessions.find((session) => session.id === activeStreamSessionId) ?? null
      : null,
  );

  const parentNodeId = selectedNodeId ?? session?.rootNodeId ?? null;
  const parent = parentNodeId ? nodes.get(parentNodeId) : undefined;

  // Depth via shared walker — also used by DetailPanel/TreeCanvas.
  const parentDepth = useMemo(() => {
    if (!parent || parent.role === 'root') return 0;
    const walk = walkPathToRoot(nodes, edges, parent.id);
    return Math.max(0, walk.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent?.id, edges]);

  const banner: BannerKind = useMemo(() => {
    if (!loadedSessionId) return { variant: 'no-session', label: t.ask.noActiveSession };
    if (!parent) return { variant: 'idle', label: t.ask.rootFirstQuestion };
    if (parent.role === 'root') return { variant: 'idle', label: t.ask.rootFirstQuestion };
    const summary = summarizeText(parent.content, 24);
    const label = `A${parentDepth} · ${summary || t.ask.emptyAnswer}`;
    if (parent.status === 'aborted') return { variant: 'aborted', label };
    return { variant: 'idle', label };
  }, [loadedSessionId, parent, parentDepth, t.ask.emptyAnswer, t.ask.noActiveSession, t.ask.rootFirstQuestion]);

  const streamingNodeId = streamingNodeIds.size > 0 ? streamingNodeIds.values().next().value ?? null : null;
  const streamingNode = streamingNodeId ? nodes.get(streamingNodeId) : undefined;
  const streamingCount = streamingNodeIds.size;

  const noSession = !loadedSessionId;
  const noProvider = !provider;
  const blockedByOtherSession =
    activeStreamSessionId !== null && activeStreamSessionId !== loadedSessionId;
  const parentStreaming = parent?.status === 'streaming';
  const disabled = noSession || noProvider || blockedByOtherSession || parentStreaming;

  const submit = async () => {
    const prompt = draft.trim();
    if (!prompt || !provider || !parentNodeId) return;
    setDraft('');
    try {
      await sendPrompt({ parentNodeId, prompt, provider, proxy });
    } catch (e) {
      setDraft(prompt);
      // eslint-disable-next-line no-console
      console.error('[AskBox] sendPrompt failed:', e);
    }
  };

  const selectedNode = selectedNodeId ? nodes.get(selectedNodeId) : undefined;
  const suggestions = selectedNode?.structured?.suggestedQuestions;

  const forkSuggestion = async (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed || !provider || !parentNodeId) return;
    try {
      await sendPrompt({ parentNodeId, prompt: trimmed, provider, proxy });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[AskBox] suggestion fork failed:', e);
    }
  };

  const onKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void submit();
    }
  };

  const nextDepth = parentDepth + 1;

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      {blockedByOtherSession && (
        <div className="flex items-center gap-3 border-b border-accent/25 bg-accent/8 px-6 py-1.5">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            {activeStreamSession?.title ?? t.ask.otherSession} {t.ask.generatingPaused}
          </span>
        </div>
      )}

      {!blockedByOtherSession && streamingNodeId && (
        <div className="flex items-center gap-3 border-b border-accent/25 bg-accent/8 px-6 py-1.5">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            {t.ask.generating} {streamingCount} ↳ {streamingNode?.model ?? '…'} ·{' '}
            {streamingNode?.content.length ?? 0} {t.ask.chars}
          </span>
          <button
            type="button"
            onClick={() =>
              streamingCount > 1 && loadedSessionId
                ? abortSessionStreams(loadedSessionId)
                : abortStream(streamingNodeId)
            }
            className="ml-auto flex items-center gap-1 rounded-[2px] border border-accent/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-accent hover:bg-accent hover:text-accent-foreground"
          >
            {streamingCount > 1 ? t.ask.abortAll : t.ask.abort}{' '}
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 px-6 pt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
        {banner.variant === 'aborted' ? (
          <span
            className="flex items-center gap-1.5 normal-case tracking-normal text-accent"
            style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic' }}
          >
            <AlertTriangle className="h-3 w-3" /> {banner.label} {t.ask.abortedCarry}
          </span>
        ) : banner.variant === 'no-session' ? (
          <span>{banner.label}</span>
        ) : (
          <span className="truncate">↳ {banner.label}</span>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-2 px-6 pb-4 pt-2">
        {suggestions && suggestions.length > 0 && !disabled && (
          <div className="flex flex-wrap items-center gap-1.5 pb-1">
            <span className="flex w-full shrink-0 items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.18em] text-accent">
              <Sparkles className="h-3 w-3" />
              {t.answer.suggestedHeading}
            </span>
            {suggestions.slice(0, MAX_SUGGESTION_CHIPS).map((q) => (
              <SuggestionChip
                key={q}
                text={q}
                dense
                onPick={() => void forkSuggestion(q)}
              />
            ))}
          </div>
        )}

        <span className="select-none font-mono text-[10.5px] uppercase tracking-[0.18em] text-accent">
          Q{nextDepth} ↦
        </span>
        <textarea
          ref={textareaRef}
          rows={4}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder={placeholderFor({
            noSession,
            noProvider,
            blockedByOtherSession,
            parentStreaming,
            labels: t.ask,
          })}
          className={cn(
            'w-full resize-none bg-transparent px-0 py-1.5 text-[14.5px] leading-[1.55] outline-none',
            'placeholder:italic placeholder:text-muted-foreground/55',
            'disabled:cursor-not-allowed disabled:text-muted-foreground/60',
          )}
          style={{ fontFamily: 'var(--font-display)' }}
        />
        {noProvider && !noSession ? (
          <Link
            to="/settings"
            className={cn(
              'group/cta flex items-center gap-1.5 self-end rounded-[2px] border border-accent/60 px-3 py-1.5',
              'font-mono text-[10.5px] uppercase tracking-[0.22em] text-accent',
              'hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {t.ask.configureProvider} <ArrowUpRight className="h-3 w-3" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => void submit()}
            disabled={disabled || draft.trim().length === 0}
            className={cn(
              'group/send flex items-center gap-2 self-end rounded-[2px] border px-3 py-1.5',
              'font-mono text-[10.5px] uppercase tracking-[0.22em] transition-colors',
              'disabled:cursor-not-allowed disabled:opacity-40',
              'border-hairline/60 text-foreground',
              'hover:enabled:border-accent hover:enabled:bg-accent hover:enabled:text-accent-foreground',
            )}
          >
            {t.ask.send}
            <span className="flex items-center gap-0.5 text-[9px] tracking-[0.22em] opacity-60 group-hover/send:opacity-100">
              ⌘<CornerDownLeft className="h-2.5 w-2.5" />
            </span>
          </button>
        )}
      </div>
    </div>
  );
});
