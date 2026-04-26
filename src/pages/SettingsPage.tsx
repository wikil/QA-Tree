import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Link
            to="/"
            aria-label="返回画布"
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'icon' }),
              'h-8 w-8',
            )}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-sm font-semibold tracking-tight">设置</h1>
        </div>
        <ThemeToggle />
      </header>

      <div className="border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
        API key 仅保存在本机浏览器的 IndexedDB，请勿在不可信设备上使用本工具；
        如需更高安全性，请等待后续主密码加密功能。
      </div>

      <main className="flex-1 overflow-y-auto p-6">
        <section className="mx-auto max-w-2xl space-y-2">
          <h2 className="text-base font-medium">Providers</h2>
          <p className="text-sm text-muted-foreground">
            Provider CRUD 与内置预设将在里程碑 2 实现。
          </p>
        </section>
      </main>
    </div>
  );
}
