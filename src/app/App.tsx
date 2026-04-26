import { Link } from 'react-router-dom';
import { Settings, Plus, Search } from 'lucide-react';
import { TreeCanvas } from '@/components/canvas/TreeCanvas';
import { fakeSession } from '@/components/canvas/fakeData';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const PLACEHOLDER_SESSIONS = [
  { id: fakeSession.id, title: fakeSession.title, count: 7 },
  { id: 'demo-2', title: '傅里叶变换的几何直觉', count: 4 },
  { id: 'demo-3', title: 'CAP 与一致性模型', count: 2 },
];

export default function App() {
  return (
    <div className="flex h-full w-full">
      <aside className="flex w-[260px] shrink-0 flex-col border-r border-border bg-card/40">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 pb-3 pt-4">
          <div className="flex items-baseline gap-1.5">
            <span
              className="font-display text-[19px] italic leading-none text-foreground"
              style={{ fontFeatureSettings: '"ss01"' }}
            >
              QA-Tree
            </span>
            <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-accent">
              ·v0
            </span>
          </div>
          <Link
            to="/settings"
            aria-label="Settings"
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'icon' }),
              'h-7 w-7',
            )}
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>

        <div className="border-b border-border px-3 py-2.5">
          <button
            type="button"
            className={cn(
              'flex w-full items-center justify-between gap-2 rounded-sm border border-hairline/50 bg-background/40 px-2.5 py-1.5',
              'font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground',
              'transition-colors hover:border-accent/60 hover:text-accent',
            )}
          >
            <span className="flex items-center gap-1.5">
              <Plus className="h-3 w-3" />
              新建会话
            </span>
            <span className="text-muted-foreground/60">⌘N</span>
          </button>
        </div>

        <div className="border-b border-border px-3 py-2">
          <div className="flex items-center gap-2 rounded-sm bg-background/40 px-2 py-1.5">
            <Search className="h-3 w-3 text-muted-foreground" />
            <input
              type="text"
              placeholder="搜索 sessions…"
              className="w-full bg-transparent font-mono text-[11px] tracking-wide text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {PLACEHOLDER_SESSIONS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={cn(
                'group/item flex w-full flex-col items-start gap-1 border-l-2 px-3.5 py-2.5 text-left transition-colors',
                i === 0
                  ? 'border-accent bg-accent/5'
                  : 'border-transparent hover:border-hairline/40 hover:bg-card/60',
              )}
            >
              <span
                className="font-display text-[14.5px] leading-tight text-foreground"
                style={{ fontFeatureSettings: '"ss01"' }}
              >
                {s.title}
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground">
                <span>{s.count} nodes</span>
                <span className="text-muted-foreground/40">·</span>
                <span>just now</span>
              </span>
            </button>
          ))}
        </div>

        <div className="border-t border-border px-4 py-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/70">
            local · indexeddb
          </p>
          <p className="mt-1 font-display text-[11.5px] italic text-muted-foreground/80">
            no server, no telemetry.
          </p>
        </div>
      </aside>

      <main className="flex flex-1 flex-col overflow-hidden">
        <section className="flex-1 overflow-hidden">
          <TreeCanvas />
        </section>
        <section className="h-[260px] shrink-0 border-t border-border bg-card/40">
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                detail
              </span>
              <span className="text-muted-foreground/40">›</span>
              <span className="font-display text-[12.5px] italic text-muted-foreground">
                选择节点或边以查看完整内容
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="max-w-[720px]">
                <p className="font-display text-[14.5px] leading-[1.7] text-foreground/80">
                  Detail panel 占位（里程碑 6 / 7）。这里会渲染选中节点的完整 markdown
                  或选中边的完整 prompt，并常驻一个 AskBox 用于继续追问。
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    next ↦
                  </span>
                  <span className="font-mono text-[10.5px] text-foreground/70">
                    M6 streaming pipeline · M7 multi-branch interactions
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
