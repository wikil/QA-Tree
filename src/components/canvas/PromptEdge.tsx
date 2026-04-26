import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import { cn } from '@/lib/utils';

export interface PromptEdgeData {
  prompt: string;
  isOnPath: boolean;
  hasSelection: boolean;
  [key: string]: unknown;
}

const LABEL_LIMIT = 26;

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

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.32,
  });

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
            'pointer-events-auto absolute select-none',
            'rounded-[2px] border bg-card px-2 py-[3px]',
            'font-mono text-[10.5px] tracking-[0.02em] leading-none',
            active
              ? 'border-accent/70 text-accent'
              : 'border-hairline/30 text-foreground/75',
            dimmed && 'opacity-40',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'mr-1 inline-block text-[9px] uppercase',
              active ? 'text-accent/80' : 'text-muted-foreground/70',
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
