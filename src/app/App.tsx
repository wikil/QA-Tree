import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, Plus, Search } from 'lucide-react';
import { TreeCanvas } from '@/components/canvas/TreeCanvas';
import { DetailPanel } from '@/components/canvas/DetailPanel';
import { AskBox, type AskBoxHandle } from '@/components/canvas/AskBox';
import { SessionRow } from '@/components/sidebar/SessionRow';
import { LanguageToggle } from '@/components/LanguageToggle';
import { buttonVariants } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useSessionsStore } from '@/stores/sessionsStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTreeStore } from '@/stores/treeStore';

export default function App() {
  const askBoxRef = useRef<AskBoxHandle | null>(null);
  const { t } = useI18n();

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
  const activeStreamSessionId = useTreeStore((s) => s.activeStreamSessionId);

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

  const prefillAskBox = useCallback((text: string) => {
    askBoxRef.current?.prefill(text);
  }, []);

  const handleNewSession = useCallback(async () => {
    await createSession(t.app.defaultSessionTitle);
    focusAskBox();
  }, [createSession, focusAskBox, t.app.defaultSessionTitle]);

  // ⌘N / Ctrl+N → new session.  Esc → clear canvas selection (only when no
  // input is focused, so SessionRow rename / AskBox / settings forms can keep
  // using Esc for their own cancel semantics).
  useEffect(() => {
    const isEditableTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        el.isContentEditable
      );
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        if (e.shiftKey || e.altKey) return;
        e.preventDefault();
        void handleNewSession();
        return;
      }
      if (e.key === 'Escape' && !isEditableTarget(e.target)) {
        const tree = useTreeStore.getState();
        if (tree.selectedNodeId != null || tree.selectedEdgeId != null) {
          e.preventDefault();
          tree.selectNode(null);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleNewSession]);

  const filteredSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) =>
      `${s.title} ${s.firstPrompt ?? ''}`.toLowerCase().includes(q),
    );
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
          <div className="flex items-center gap-1.5">
            <LanguageToggle />
            <Link
              to="/settings"
              aria-label={t.app.settingsAria}
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'icon' }),
                'h-7 w-7',
              )}
            >
              <Settings className="h-4 w-4" />
            </Link>
          </div>
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
              {t.app.newSession}
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
              placeholder={t.app.searchPlaceholder}
              className="w-full bg-transparent font-mono text-[11px] tracking-wide text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {!sessionsHydrated ? (
            <div className="px-3.5 py-4 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60">
              {t.common.loading}
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="flex flex-col gap-2 px-4 py-6 text-center">
              <span className="font-display text-[13px] italic text-muted-foreground/80">
                {sessions.length === 0
                  ? t.app.noSessions
                  : t.app.noMatchingSessions}
              </span>
              {sessions.length === 0 && (
                <button
                  type="button"
                  onClick={() => void handleNewSession()}
                  className="mx-auto mt-1 flex items-center gap-1.5 rounded-[2px] border border-accent/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-accent hover:bg-accent hover:text-accent-foreground"
                >
                  <Plus className="h-3 w-3" /> {t.app.newFirstSession}
                </button>
              )}
            </div>
          ) : (
            filteredSessions.map((s) => {
              const isCurrent = s.id === currentSessionId;
              return (
                <SessionRow
                  key={s.id}
                  session={s}
                  isCurrent={isCurrent}
                  isStreaming={s.id === activeStreamSessionId}
                  nodeCount={isCurrent ? treeNodeCount : undefined}
                  onSelect={() => void setCurrentSessionId(s.id)}
                />
              );
            })
          )}
        </div>

        <div className="border-t border-border px-4 py-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/70">
            {t.app.localStoreLabel}
          </p>
          <p className="mt-1 font-display text-[11.5px] italic text-muted-foreground/80">
            {t.app.localStoreDesc}
          </p>
        </div>
      </aside>

      <main className="flex flex-1 flex-col overflow-hidden">
        <section className="flex-1 overflow-hidden">
          {!settingsHydrated ? (
            <div className="flex h-full w-full items-center justify-center">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-muted-foreground">
                {t.common.loading}
              </span>
            </div>
          ) : (
            <TreeCanvas
              onAddBranchFocus={focusAskBox}
              onPrefillAsk={prefillAskBox}
            />
          )}
        </section>
        <DetailPanel />
        <AskBox ref={askBoxRef} />
      </main>
    </div>
  );
}
