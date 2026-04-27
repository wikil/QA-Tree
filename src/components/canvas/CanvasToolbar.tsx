import {
  Maximize2,
  RotateCcw,
  ChevronsRight,
  ChevronsLeft,
  PinOff,
} from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface CanvasToolbarProps {
  sessionTitle: string;
  pathLabel?: string;
  nodeCount: number;
  onFit: () => void;
  onReset: () => void;
  onResetLayout: () => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  collapsedCount: number;
  pinnedCount: number;
}

function ToolbarButton({
  label,
  onClick,
  icon: Icon,
  disabled,
  title,
}: {
  label: string;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'group flex items-center gap-1.5 rounded-sm border border-transparent px-2 py-1',
        'font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground',
        'transition-colors hover:enabled:border-hairline/40 hover:enabled:bg-card hover:enabled:text-foreground',
        'disabled:cursor-not-allowed disabled:opacity-40',
      )}
    >
      <Icon className="h-3 w-3" />
      <span>{label}</span>
    </button>
  );
}

export function CanvasToolbar({
  sessionTitle,
  pathLabel,
  nodeCount,
  onFit,
  onReset,
  onResetLayout,
  onCollapseAll,
  onExpandAll,
  collapsedCount,
  pinnedCount,
}: CanvasToolbarProps) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 border-b border-border bg-background/70 px-4 py-2 backdrop-blur-[2px]">
      <div className="flex min-w-0 items-baseline gap-3">
        <span
          className="font-display text-[18px] italic leading-none text-foreground"
          style={{ fontFeatureSettings: '"ss01"' }}
        >
          {sessionTitle}
        </span>
        <span className="hidden h-4 w-px bg-hairline/30 sm:block" />
        <span className="hidden truncate font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground sm:block">
          {pathLabel ?? t.toolbar.noSelection}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <span className="mr-3 hidden font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/80 md:block">
          {nodeCount} {t.toolbar.nodeLabel}
          {collapsedCount > 0 && (
            <>
              <span className="mx-1.5 text-muted-foreground/40">·</span>
              <span className="text-accent">
                {collapsedCount} {t.toolbar.foldedLabel}
              </span>
            </>
          )}
          {pinnedCount > 0 && (
            <>
              <span className="mx-1.5 text-muted-foreground/40">·</span>
              <span className="text-accent">
                {pinnedCount} {t.toolbar.pinnedLabel}
              </span>
            </>
          )}
        </span>
        <ToolbarButton label={t.toolbar.fit} icon={Maximize2} onClick={onFit} />
        <ToolbarButton label={t.toolbar.reset} icon={RotateCcw} onClick={onReset} />
        <ToolbarButton
          label={t.toolbar.resetLayout}
          icon={PinOff}
          onClick={onResetLayout}
          disabled={pinnedCount === 0}
          title={
            pinnedCount === 0
              ? t.toolbar.resetLayoutEmpty
              : t.toolbar.resetLayoutHint
          }
        />
        <ToolbarButton
          label={t.toolbar.collapse}
          icon={ChevronsLeft}
          onClick={onCollapseAll}
        />
        <ToolbarButton
          label={t.toolbar.expand}
          icon={ChevronsRight}
          onClick={onExpandAll}
        />
        <span className="mx-1 h-4 w-px bg-hairline/30" />
        <ThemeToggle />
      </div>
    </div>
  );
}
