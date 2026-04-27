import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n';
import { useResolvedProvider } from '@/hooks/useResolvedProvider';
import { useTreeStore } from '@/stores/treeStore';

export function RegenerateForkDialog() {
  const { t } = useI18n();
  const targetId = useTreeStore((s) => s.regenTargetId);
  const requestRegenerateFork = useTreeStore((s) => s.requestRegenerateFork);
  const confirmRegenerateFork = useTreeStore((s) => s.confirmRegenerateFork);
  const { provider, proxy } = useResolvedProvider();

  if (!targetId) return null;

  const close = () => requestRegenerateFork(null);

  const onConfirm = () => {
    if (!provider) {
      close();
      return;
    }
    void confirmRegenerateFork({ provider, proxy }).catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[RegenerateForkDialog] forkRegenerate failed:', e);
    });
  };

  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : close())}>
      <DialogContent className="max-w-[420px] border-hairline/60 bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-[20px] italic">
            {t.detail.regenerateForkTitle}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-[13px] leading-[1.65] text-muted-foreground">
              <p className="text-foreground/85">{t.detail.regenerateForkBody}</p>
              <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-accent">
                {t.detail.regenerateForkHint}
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            onClick={close}
            className="rounded-[2px] border border-hairline/60 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:border-hairline hover:text-foreground"
          >
            {t.common.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-[2px] border border-accent/60 bg-accent/10 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {t.detail.regenerateForkConfirm}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
