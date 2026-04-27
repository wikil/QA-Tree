import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, Plus, Search } from 'lucide-react';
import { TreeCanvas } from '@/components/canvas/TreeCanvas';
import { DetailPanel } from '@/components/canvas/DetailPanel';
import { AskBox, type AskBoxHandle } from '@/components/canvas/AskBox';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/format';
import { useSessionsStore } from '@/stores/sessionsStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTreeStore } from '@/stores/treeStore';

export default function App() {
  const askBoxRef = useRef<AskBoxHandle | null>(null);

  const sessions = useSessionsStore((s) => s.sessions);
  const currentSessionId = useSessionsStore((s) => s.currentSessionId);
  const sessionsHydrated = useSessionsStore((s) => s.hydrated);
  const hydrateSessions = useSessionsStore((s) => s.hydrate);
  const createSession = useSessionsStore((s) => s.createSession);
  const setCurrentSessionId = useSessionsStore((s) => s.setCurrentSessionId);

  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const settingsHydrated = useSettingsStore((s) => s.hydrated);

  const loadSession = useTreeStore((s) => s.loadSession);
  const treeNodeCount = useTreeStore((s) => s.nodes.size);

  const [search, setSearch] = useState('');

  useEffect(() => {
    void hydrateSessions();
    void hydrateSettings();
  }, [hydrateSessions, hydrateSettings]);

  // loadSession is idempotent — fire whenever currentSessionId changes; same-id
  // re-fires are no-ops in the store.
  useEffect(() => {
    if (!sessionsHydrated) return;
    void loadSession(currentSessionId);
  }, [sessionsHydrated, currentSessionId, loadSession]);

  const focusAskBox = useCallback(() => {
    askBoxRef.current?.focus();
  }, []);

  const handleNewSession = useCallback(async () => {
    await createSession();
    focusAskBox();
  }, [createSession, focusAskBox]);

  // ⌘N / Ctrl+N to create a new session
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        // Avoid hijacking native new-window in browsers that allow it (most don't intercept Cmd+N anyway)
        if (e.shiftKey || e.altKey) return;
        e.preventDefault();
        void handleNewSession();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleNewSession]);

  const filteredSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  }, [sessions, search]);

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
            onClick={() => void handleNewSession()}
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索 sessions…"
              className="w-full bg-transparent font-mono text-[11px] tracking-wide text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {!sessionsHydrated ? (
            <div className="px-3.5 py-4 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
              loading…
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="flex flex-col gap-2 px-4 py-6 text-center">
              <span className="font-display text-[13px] italic text-muted-foreground/80">
                {sessions.length === 0
                  ? '还没有任何会话。'
                  : '没有匹配的会话。'}
              </span>
              {sessions.length === 0 && (
                <button
                  type="button"
                  onClick={() => void handleNewSession()}
                  className="mx-auto mt-1 flex items-center gap-1.5 rounded-[2px] border border-accent/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-accent hover:bg-accent hover:text-accent-foreground"
                >
                  <Plus className="h-3 w-3" /> 新建第一个会话
                </button>
              )}
            </div>
          ) : (
            filteredSessions.map((s) => {
              const isCurrent = s.id === currentSessionId;
              const nodeCount = isCurrent ? treeNodeCount : undefined;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => void setCurrentSessionId(s.id)}
                  className={cn(
                    'group/item flex w-full flex-col items-start gap-1 border-l-2 px-3.5 py-2.5 text-left transition-colors',
                    isCurrent
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
                    {nodeCount !== undefined && (
                      <>
                        <span>{Math.max(0, nodeCount - 1)} nodes</span>
                        <span className="text-muted-foreground/40">·</span>
                      </>
                    )}
                    <span>{formatRelativeTime(s.updatedAt)}</span>
                  </span>
                </button>
              );
            })
          )}
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
          {!settingsHydrated ? (
            <div className="flex h-full w-full items-center justify-center">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-muted-foreground">
                loading…
              </span>
            </div>
          ) : (
            <TreeCanvas onAddBranchFocus={focusAskBox} />
          )}
        </section>
        <DetailPanel />
        <AskBox ref={askBoxRef} />
      </main>
    </div>
  );
}
