import { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { fillTemplate, useI18n } from '@/lib/i18n';
import { collectSubtreeStats, useTreeStore } from '@/stores/treeStore';

export function DeleteSubtreeDialog() {
  const { t } = useI18n();
  const targetId = useTreeStore((s) => s.deleteTargetId);
  const edges = useTreeStore((s) => s.edges);
  const streamingNodeIds = useTreeStore((s) => s.streamingNodeIds);
  const requestDeleteSubtree = useTreeStore((s) => s.requestDeleteSubtree);
  const deleteNodeSubtree = useTreeStore((s) => s.deleteNodeSubtree);

  const stats = useMemo(
    () => (targetId ? collectSubtreeStats(edges, targetId, streamingNodeIds) : null),
    [targetId, edges, streamingNodeIds],
  );

  if (!targetId || !stats) return null;

  const descendantCount = Math.max(0, stats.nodeIds.size - 1);
  const edgeCount = stats.edgeIds.size;

  const close = () => requestDeleteSubtree(null);

  return (
    <Dialog open onOpenChange={(o) => (o ? undefined : close())}>
      <DialogContent className="max-w-[440px] border-hairline/60 bg-card">
        <DialogHeader>
          <DialogTitle className="font-display text-[20px] italic">
            {t.answer.deleteSubtreeTitle}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-[13px] leading-[1.65] text-muted-foreground">
              <p className="text-foreground/85">
                {fillTemplate(t.answer.deleteSubtreeBody, {
                  descendants: descendantCount,
                  edges: edgeCount,
                })}
              </p>
              {stats.streamingCount > 0 && (
                <p className="text-accent">
                  {fillTemplate(t.answer.deleteSubtreeStreamingWarn, {
                    streaming: stats.streamingCount,
                  })}
                </p>
              )}
              <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-destructive/80">
                {t.answer.deleteSubtreeIrreversible}
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
            onClick={() => {
              void deleteNodeSubtree(targetId);
            }}
            className="rounded-[2px] border border-destructive/60 bg-destructive/10 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground"
          >
            {t.answer.deleteSubtreeConfirm}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
