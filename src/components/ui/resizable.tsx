import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type PanelGroupProps,
  type PanelProps,
  type PanelResizeHandleProps,
} from 'react-resizable-panels';
import { cn } from '@/lib/utils';

export function ResizablePanelGroup({ className, ...props }: PanelGroupProps) {
  return (
    <PanelGroup
      {...props}
      className={cn(
        'flex h-full w-full data-[panel-group-direction=vertical]:flex-col',
        className,
      )}
    />
  );
}

export const ResizablePanel = (props: PanelProps) => <Panel {...props} />;

export function ResizableHandle({
  className,
  withHandle,
  ...props
}: PanelResizeHandleProps & { withHandle?: boolean }) {
  return (
    <PanelResizeHandle
      {...props}
      className={cn(
        // 1px hairline that turns accent on hover / drag — matches the rest of
        // the canvas chrome (border-l border-border).
        'group/handle relative flex w-px shrink-0 items-center justify-center bg-border transition-colors',
        'hover:bg-accent/70 data-[resize-handle-state=hover]:bg-accent data-[resize-handle-state=drag]:bg-accent',
        // Vertical mode (not used today, but keep parity with shadcn template).
        'data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full',
        className,
      )}
    >
      {withHandle && (
        <span
          aria-hidden
          className={cn(
            'absolute z-10 grid h-7 w-3 place-items-center rounded-[2px] border border-hairline/60 bg-card/80',
            'opacity-0 transition-opacity group-hover/handle:opacity-100',
            'data-[panel-group-direction=vertical]:h-3 data-[panel-group-direction=vertical]:w-7',
          )}
        >
          <span className="block h-3 w-px bg-muted-foreground/60 group-hover/handle:bg-accent" />
        </span>
      )}
    </PanelResizeHandle>
  );
}
