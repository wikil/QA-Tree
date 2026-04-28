import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

export interface PromptEdgeData {
  prompt: string;
  isOnPath: boolean;
  hasSelection: boolean;
  [key: string]: unknown;
}

const LABEL_LIMIT = 24;

function truncate(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= LABEL_LIMIT) return t;
  return t.slice(0, LABEL_LIMIT) + '…';
}

function PromptEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const { t } = useI18n();
  const edgeData = (data ?? {}) as PromptEdgeData;
  const { prompt = '', isOnPath = false, hasSelection = false } = edgeData;

  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
    offset: 24,
  });

  // TB layout: sibling edges share sourceX/sourceY/targetY — only targetX is
  // unique per sibling. We pin labelX into the horizontal corridor between
  // source and target columns so each sibling's label lands at a different X
  // and they never stack. For same-column edges this collapses to the vertical
  // line, with the -50%/-50% transform lifting the label off the stroke.
  const labelY = sourceY + (targetY - sourceY) * 0.5;
  const sameCol = Math.abs(targetX - sourceX) < 1;
  const labelX = sameCol ? sourceX + 12 : (sourceX + targetX) / 2;

  const active = selected || isOnPath;
  const dimmed = hasSelection && !active;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        className={cn(
          'transition-[stroke,opacity] duration-200',
          active && 'qa-edge--active',
          dimmed && 'qa-edge--dimmed',
        )}
        style={{
          strokeDasharray: selected ? '4 3' : undefined,
        }}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
          className={cn(
            'pointer-events-auto absolute select-none whitespace-nowrap',
            'rounded-[2px] bg-background/85 px-1.5 py-[2px] backdrop-blur-[1px]',
            'font-mono text-[10px] tracking-[0.02em] leading-none',
            active
              ? 'text-accent'
              : 'text-foreground/70',
            dimmed && 'opacity-30',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'mr-1 inline-block text-[8.5px] uppercase tracking-[0.18em]',
              active ? 'text-accent/80' : 'text-muted-foreground/60',
            )}
          >
            Q
          </span>
          {truncate(prompt) || t.detail.emptyPrompt}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const PromptEdge = memo(PromptEdgeComponent);
