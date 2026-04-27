import { useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { useTreeStore } from '@/stores/treeStore';
import { useResolvedProvider } from '@/hooks/useResolvedProvider';

export function EmptyState() {
  const [value, setValue] = useState('');
  const { session, provider, proxy } = useResolvedProvider();
  const { t } = useI18n();
  const sendPrompt = useTreeStore((s) => s.sendPrompt);
  const activeStreamSessionId = useTreeStore((s) => s.activeStreamSessionId);

  const noSession = !session;
  const noProvider = !provider;
  const blockedByOtherSession =
    activeStreamSessionId !== null && activeStreamSessionId !== session?.id;
  const disabled = noSession || noProvider || blockedByOtherSession;

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed || !session || !provider) return;
    setValue('');
    try {
      await sendPrompt({
        parentNodeId: session.rootNodeId,
        prompt: trimmed,
        provider,
        proxy,
      });
    } catch (e) {
      setValue(trimmed);
      // eslint-disable-next-line no-console
      console.error('[EmptyState] sendPrompt failed:', e);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className="relative flex h-full w-full items-center justify-center px-8">
      <div className="pointer-events-none absolute inset-x-12 top-16 h-px bg-hairline/20" />
      <div className="pointer-events-none absolute inset-x-12 bottom-16 h-px bg-hairline/20" />

      <div className="relative w-full max-w-[640px]">
        <div className="mb-6 flex items-baseline gap-3">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground">
            {session ? `Session · ${session.title.slice(0, 20)}` : t.empty.sessionMissing}
          </span>
          <span className="h-px flex-1 bg-hairline/30" />
          <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground">
            {t.empty.mode}
          </span>
        </div>

        <h1
          className="mb-2 font-display text-[44px] leading-[1.05] text-foreground"
          style={{ fontFeatureSettings: '"ss01"' }}
        >
          {t.empty.headingPrefix}
          <span className="italic text-accent">{t.empty.headingAccent}</span>
          {t.empty.headingSuffix}
        </h1>
        <p className="mb-8 max-w-[480px] text-[14px] leading-[1.65] text-muted-foreground">
          {t.empty.description}{' '}
          <span className="font-mono text-[12.5px] text-foreground/80">⌘↵</span>{' '}
          {t.empty.sendHint}
        </p>

        {noProvider && !noSession && (
          <Link
            to="/settings"
            className={cn(
              'mb-4 inline-flex items-center gap-1.5 rounded-[2px] border border-accent/60 px-3 py-1.5',
              'font-mono text-[10.5px] uppercase tracking-[0.22em] text-accent',
              'hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {t.empty.configureProvider} <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}

        <div
          className={cn(
            'group relative flex items-end gap-3 rounded-[var(--radius)] border border-hairline/40 bg-card p-4',
            'qa-card-shadow focus-within:border-accent/60 focus-within:qa-card-shadow-active',
            'transition-shadow duration-200',
            disabled && 'opacity-60',
          )}
        >
          <span className="absolute left-4 top-2 font-mono text-[9.5px] uppercase tracking-[0.2em] text-muted-foreground">
            Q1 ↦
          </span>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={disabled}
            placeholder={
              noSession
                ? t.empty.noSessionPlaceholder
                : noProvider
                ? t.empty.noProviderPlaceholder
                : blockedByOtherSession
                ? t.empty.blockedPlaceholder
                : t.empty.promptPlaceholder
            }
            rows={3}
            className={cn(
              'min-h-[88px] w-full resize-none bg-transparent pt-5 text-[15.5px] leading-[1.55] text-foreground',
              'placeholder:font-display placeholder:italic placeholder:text-muted-foreground/60',
              'focus:outline-none disabled:cursor-not-allowed',
            )}
            style={{ fontFamily: 'var(--font-display)', fontWeight: 400 }}
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={disabled || !value.trim()}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-[var(--radius)] px-3.5 py-2',
              'font-mono text-[10.5px] uppercase tracking-[0.18em]',
              'border border-hairline/60 bg-foreground text-background',
              'hover:bg-accent hover:border-accent disabled:opacity-40 disabled:hover:bg-foreground disabled:hover:border-hairline/60',
              'transition-colors',
            )}
          >
            {t.empty.send}
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {t.empty.samples.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setValue(s)}
              disabled={disabled}
              className={cn(
                'rounded-full border border-hairline/30 bg-card/60 px-3 py-1.5',
                'font-display text-[12.5px] italic text-muted-foreground',
                'transition-colors hover:border-accent/50 hover:text-accent',
                'disabled:opacity-50 disabled:hover:border-hairline/30 disabled:hover:text-muted-foreground',
              )}
            >
              “{s}”
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
