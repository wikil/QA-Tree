import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelativeTimeForLocale, useI18n } from '@/lib/i18n';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSessionsStore } from '@/stores/sessionsStore';
import type { Session } from '@/types';

interface SessionRowProps {
  session: Session;
  isCurrent: boolean;
  isStreaming: boolean;
  nodeCount?: number;
  onSelect: () => void;
}

export function SessionRow({
  session,
  isCurrent,
  isStreaming,
  nodeCount,
  onSelect,
}: SessionRowProps) {
  const { locale, t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.title);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const renameSession = useSessionsStore((s) => s.renameSession);
  const deleteSession = useSessionsStore((s) => s.deleteSession);

  useEffect(() => {
    if (!editing) setDraft(session.title);
  }, [session.title, editing]);

  useEffect(() => {
    if (editing) {
      // rAF — radix restores focus to trigger on close; rAF runs after that
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing]);

  const startEditing = () => {
    setDraft(session.title);
    setEditing(true);
  };

  const commitRename = async () => {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed && trimmed !== session.title) {
      await renameSession(session.id, trimmed);
    }
  };

  const cancelEditing = () => {
    setDraft(session.title);
    setEditing(false);
  };

  const meta = (
    <span className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
      {nodeCount !== undefined && (
        <>
          <span>
            {Math.max(0, nodeCount - 1)} {t.sessionRow.nodes}
          </span>
          <span className="text-muted-foreground/40">·</span>
        </>
      )}
      {isStreaming && (
        <>
          <span className="text-accent">{t.sessionRow.streaming}</span>
          <span className="text-muted-foreground/40">·</span>
        </>
      )}
      <span>{formatRelativeTimeForLocale(session.updatedAt, locale)}</span>
    </span>
  );

  return (
    <>
      <div
        className={cn(
          'group/item relative flex flex-col items-start border-l-2 transition-colors',
          isCurrent
            ? 'border-accent bg-accent/5'
            : 'border-transparent hover:border-hairline/40 hover:bg-card/60',
        )}
      >
        {editing ? (
          <div className="flex w-full flex-col gap-1 px-3.5 py-2.5">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void commitRename();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEditing();
                }
              }}
              onBlur={() => void commitRename()}
              className="w-full border-b border-accent/60 bg-transparent pb-0.5 font-display text-[14.5px] leading-tight text-foreground outline-none"
              style={{ fontFeatureSettings: '"ss01"' }}
              maxLength={120}
            />
            {meta}
          </div>
        ) : (
          <button
            type="button"
            onClick={onSelect}
            onDoubleClick={startEditing}
            className="flex w-full flex-col items-start gap-1 px-3.5 py-2.5 text-left"
          >
            <span
              className="truncate pr-7 font-display text-[14.5px] leading-tight text-foreground"
              style={{ fontFeatureSettings: '"ss01"' }}
            >
              {session.title}
            </span>
            {meta}
          </button>
        )}

        {!editing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t.sessionRow.actions}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  'absolute right-1.5 top-2 grid h-6 w-6 place-items-center rounded-[2px]',
                  'text-muted-foreground transition-opacity hover:bg-secondary hover:text-foreground',
                  'opacity-0 group-hover/item:opacity-80 data-[state=open]:opacity-100 focus-visible:opacity-100',
                )}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={4} className="w-36">
              <DropdownMenuItem onSelect={() => startEditing()}>
                <Pencil className="mr-2 h-3 w-3" />
                {t.sessionRow.rename}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setConfirmOpen(true)}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <Trash2 className="mr-2 h-3 w-3" />
                {t.sessionRow.delete}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-[420px] border-hairline/60 bg-card">
          <DialogHeader>
            <DialogTitle className="font-display text-[20px] italic">
              {t.sessionRow.deleteTitle}
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-[1.65]">
              <span className="font-display italic text-foreground">
                「{session.title}」
              </span>{' '}
              {t.sessionRow.deleteDescriptionSuffix}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              className="rounded-[2px] border border-hairline/60 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:border-hairline hover:text-foreground"
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              onClick={async () => {
                setConfirmOpen(false);
                await deleteSession(session.id);
              }}
              className="rounded-[2px] border border-destructive/60 bg-destructive/10 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
            >
              {t.sessionRow.permanentDelete}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
