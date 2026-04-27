import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useI18n } from '@/lib/i18n';

/**
 * Hidden virtual root rendered as a small "Start" pill anchored at the
 * leftmost rank. Communicates the trunk-anchor visually without a node card.
 */
function StartPillComponent() {
  const { t } = useI18n();
  return (
    <div className="group/start relative flex h-9 w-[76px] items-center justify-center">
      <Handle
        type="source"
        position={Position.Right}
        className="qa-handle"
        isConnectable={false}
      />
      <div className="flex items-center gap-1.5 rounded-full border border-accent/70 bg-accent/8 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-accent">
        <span
          aria-hidden
          className="relative inline-flex h-1.5 w-1.5 items-center justify-center"
        >
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
        </span>
        {t.common.start}
      </div>
    </div>
  );
}

export const StartPill = memo(StartPillComponent);
