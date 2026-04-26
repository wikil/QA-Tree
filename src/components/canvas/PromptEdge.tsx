import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import { cn } from '@/lib/utils';

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

  // Sibling edges share sourceX/sourceY/targetX — only targetY is unique per
  // sibling. So we pin labelY into the vertical corridor between source and
  // target rows; each sibling's label naturally lands at a different Y and
  // they never stack. For same-row edges this collapses to the horizontal
  // line, with the -50%/-50% transform lifting the label over the stroke.
  const labelX = sourceX + (targetX - sourceX) * 0.5;
  const sameRow = Math.abs(targetY - sourceY) < 1;
  const labelY = sameRow ? sourceY - 12 : (sourceY + targetY) / 2;

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
          {truncate(prompt) || '（空）'}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const PromptEdge = memo(PromptEdgeComponent);
