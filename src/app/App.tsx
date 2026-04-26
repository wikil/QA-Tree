import { Link } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';

export default function App() {
  return (
    <div className="flex h-full w-full">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-muted/30">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <span className="text-sm font-semibold tracking-tight">QA-Tree</span>
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
        <div className="flex-1 overflow-y-auto p-3">
          <p className="text-xs text-muted-foreground">
            Sessions 列表占位（里程碑 8）
          </p>
        </div>
      </aside>

      <main className="flex flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
          <div className="text-sm text-muted-foreground">画布占位（里程碑 5）</div>
          <ThemeToggle />
        </header>
        <section className="flex-1 overflow-hidden bg-background">
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            TreeCanvas 将渲染在此处
          </div>
        </section>
        <section className="h-64 shrink-0 border-t border-border bg-muted/30">
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
              Detail Panel 占位（里程碑 6 / 7）
            </div>
            <div className="flex-1 overflow-y-auto p-4 text-sm text-muted-foreground">
              选中节点 / 边后，完整 markdown 与 prompt 会展示在这里。
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
