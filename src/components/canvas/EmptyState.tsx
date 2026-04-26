import { useState, type KeyboardEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  onSubmit?: (prompt: string) => void;
  disabled?: boolean;
}

const SAMPLES = [
  '什么是 transformer 的注意力机制？',
  '怎么从零理解傅里叶变换？',
  '股息折现模型 vs 自由现金流估值？',
];

export function EmptyState({ onSubmit, disabled }: EmptyStateProps) {
  const [value, setValue] = useState('');

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit?.(trimmed);
    setValue('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="relative flex h-full w-full items-center justify-center px-8">
      {/* Decorative parchment rule */}
      <div className="pointer-events-none absolute inset-x-12 top-16 h-px bg-hairline/20" />
      <div className="pointer-events-none absolute inset-x-12 bottom-16 h-px bg-hairline/20" />

      <div className="relative w-full max-w-[640px]">
        <div className="mb-6 flex items-baseline gap-3">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground">
            Session · 00
          </span>
          <span className="h-px flex-1 bg-hairline/30" />
          <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground">
            Recursive Inquiry
          </span>
        </div>

        <h1
          className="mb-2 font-display text-[44px] leading-[1.05] text-foreground"
          style={{ fontFeatureSettings: '"ss01"' }}
        >
          开始你的
          <span className="italic text-accent"> 第一个 </span>
          问题。
        </h1>
        <p className="mb-8 max-w-[480px] text-[14px] leading-[1.65] text-muted-foreground">
          每一次回答都是一个节点。沿任何节点继续追问，会长出新的分支；
          兄弟分支彼此完全隔离。<span className="font-mono text-[12.5px] text-foreground/80">↵</span> 发送，<span className="font-mono text-[12.5px] text-foreground/80">⌘↵</span> 强制发送。
        </p>

        <div
          className={cn(
            'group relative flex items-end gap-3 rounded-[var(--radius)] border border-hairline/40 bg-card p-4',
            'qa-card-shadow focus-within:border-accent/60 focus-within:qa-card-shadow-active',
            'transition-shadow duration-200',
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
            placeholder="在这里写下你想深入探索的问题…"
            rows={3}
            className={cn(
              'min-h-[88px] w-full resize-none bg-transparent pt-5 text-[15.5px] leading-[1.55] text-foreground',
              'placeholder:font-display placeholder:italic placeholder:text-muted-foreground/60',
              'focus:outline-none',
            )}
            style={{ fontFamily: 'var(--font-display)', fontWeight: 400 }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={disabled || !value.trim()}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-[var(--radius)] px-3.5 py-2',
              'font-mono text-[10.5px] uppercase tracking-[0.18em]',
              'border border-hairline/60 bg-foreground text-background',
              'hover:bg-accent hover:border-accent disabled:opacity-40 disabled:hover:bg-foreground disabled:hover:border-hairline/60',
              'transition-colors',
            )}
          >
            发送
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {SAMPLES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setValue(s)}
              className={cn(
                'rounded-full border border-hairline/30 bg-card/60 px-3 py-1.5',
                'font-display text-[12.5px] italic text-muted-foreground',
                'transition-colors hover:border-accent/50 hover:text-accent',
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
