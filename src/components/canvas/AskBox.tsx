import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, CornerDownLeft, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTreeStore } from '@/stores/treeStore';
import { useResolvedProvider } from '@/hooks/useResolvedProvider';
import { walkPathToRoot } from '@/lib/context';
import { summarizeText } from '@/lib/format';

export interface AskBoxHandle {
  focus: () => void;
}

interface BannerKind {
  variant: 'idle' | 'aborted' | 'no-session';
  label: string;
}

function placeholderFor(opts: {
  noSession: boolean;
  noProvider: boolean;
  streaming: boolean;
}): string {
  if (opts.noSession) return '请先创建或选择一个 session…';
  if (opts.noProvider) return '请先在设置中配置 LLM provider…';
  if (opts.streaming) return '生成中，等当前回答完成…';
  return '继续推问，⌘↵ 送出…';
}

export const AskBox = forwardRef<AskBoxHandle>(function AskBox(_, ref) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [draft, setDraft] = useState('');

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }));

  const { session, provider, proxy } = useResolvedProvider();

  const nodes = useTreeStore((s) => s.nodes);
  const edges = useTreeStore((s) => s.edges);
  const selectedNodeId = useTreeStore((s) => s.selectedNodeId);
  const sendPrompt = useTreeStore((s) => s.sendPrompt);
  const abortStream = useTreeStore((s) => s.abortStream);
  const streamingNodeIds = useTreeStore((s) => s.streamingNodeIds);
  const loadedSessionId = useTreeStore((s) => s.loadedSessionId);

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
    if (!loadedSessionId) return { variant: 'no-session', label: '无活动 session' };
    if (!parent) return { variant: 'idle', label: 'root · 第一问' };
    if (parent.role === 'root') return { variant: 'idle', label: 'root · 第一问' };
    const summary = summarizeText(parent.content, 24);
    const label = `A${parentDepth} · ${summary || '（空回答）'}`;
    if (parent.status === 'aborted') return { variant: 'aborted', label };
    return { variant: 'idle', label };
  }, [loadedSessionId, parent, parentDepth]);

  const streamingNodeId = streamingNodeIds.size > 0 ? streamingNodeIds.values().next().value ?? null : null;
  const streamingNode = streamingNodeId ? nodes.get(streamingNodeId) : undefined;

  const noSession = !loadedSessionId;
  const noProvider = !provider;
  const disabled = noSession || noProvider || streamingNodeId !== null;

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

  const onKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void submit();
    }
  };

  const nextDepth = parentDepth + 1;

  return (
    <div className="border-t border-border/60 bg-background">
      {streamingNodeId && (
        <div className="flex items-center gap-3 border-b border-accent/25 bg-accent/8 px-6 py-1.5">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-accent">
            正在生成 ↳ {streamingNode?.model ?? '…'} · {streamingNode?.content.length ?? 0} 字
          </span>
          <button
            type="button"
            onClick={() => abortStream(streamingNodeId)}
            className="ml-auto flex items-center gap-1 rounded-[2px] border border-accent/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-accent hover:bg-accent hover:text-accent-foreground"
          >
            中止 <X className="h-2.5 w-2.5" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2 px-6 pt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
        {banner.variant === 'aborted' ? (
          <span
            className="flex items-center gap-1.5 normal-case tracking-normal text-accent"
            style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic' }}
          >
            <AlertTriangle className="h-3 w-3" /> {banner.label} 已中止 · 续问将带入残段
          </span>
        ) : banner.variant === 'no-session' ? (
          <span>{banner.label}</span>
        ) : (
          <span className="truncate">↳ {banner.label}</span>
        )}
      </div>

      <div className="flex items-end gap-3 px-6 pb-3 pt-1">
        <span className="select-none pb-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-accent">
          Q{nextDepth} ↦
        </span>
        <textarea
          ref={textareaRef}
          rows={2}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder={placeholderFor({
            noSession,
            noProvider,
            streaming: streamingNodeId !== null,
          })}
          className={cn(
            'flex-1 resize-none bg-transparent px-0 py-1.5 text-[14.5px] leading-[1.55] outline-none',
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
            配置 Provider <ArrowUpRight className="h-3 w-3" />
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
            送出
            <span className="flex items-center gap-0.5 text-[9px] tracking-[0.22em] opacity-60 group-hover/send:opacity-100">
              ⌘<CornerDownLeft className="h-2.5 w-2.5" />
            </span>
          </button>
        )}
      </div>
    </div>
  );
});
