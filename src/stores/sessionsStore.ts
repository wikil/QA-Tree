import { create } from 'zustand';
import { db, KV_KEYS } from '@/lib/db';
import { newId } from '@/lib/ids';
import { discardStreamsForSession } from '@/stores/treeStore';
import type { QANode, Session } from '@/types';

interface SessionsState {
  hydrated: boolean;
  sessions: Session[];
  currentSessionId: string | null;

  hydrate: () => Promise<void>;
  createSession: (title?: string) => Promise<Session>;
  renameSession: (id: string, title: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  recordFirstPrompt: (id: string, prompt: string) => Promise<void>;
  setCurrentSessionId: (id: string | null) => Promise<void>;
  touchSession: (id: string) => Promise<void>;
  setSessionProvider: (id: string, providerId: string | undefined) => Promise<void>;
}

const DEFAULT_SESSION_TITLE = '新会话';
const sortByUpdatedDesc = (a: Session, b: Session) => b.updatedAt - a.updatedAt;

let hydratePromise: Promise<void> | null = null;

const COLLAPSED_KV_KEY = KV_KEYS.collapsedSubtrees;

async function clearCollapsedForSession(sessionId: string) {
  const record = await db.kv.get(COLLAPSED_KV_KEY);
  const map = (record?.value as Record<string, string[]> | undefined) ?? {};
  if (sessionId in map) {
    delete map[sessionId];
    await db.kv.put({ key: COLLAPSED_KV_KEY, value: map });
  }
}

function makeTitleFromPrompt(prompt: string): string {
  const title = prompt.trim().replace(/\s+/g, ' ');
  return title.length > 36 ? `${title.slice(0, 36)}...` : title;
}

export const useSessionsStore = create<SessionsState>((set, get) => ({
  hydrated: false,
  sessions: [],
  currentSessionId: null,

  hydrate: async () => {
    if (get().hydrated) return;
    if (hydratePromise) return hydratePromise;
    hydratePromise = (async () => {
      const [sessions, edges, currentRecord] = await Promise.all([
        db.sessions.toArray(),
        db.edges.toArray(),
        db.kv.get(KV_KEYS.currentSessionId),
      ]);
      const firstPromptBySession = new Map<string, string>();
      for (const edge of edges.sort((a, b) => a.createdAt - b.createdAt)) {
        if (!firstPromptBySession.has(edge.sessionId)) {
          firstPromptBySession.set(edge.sessionId, edge.prompt);
        }
      }
      const hydratedSessions = sessions.map((session) =>
        session.firstPrompt
          ? session
          : { ...session, firstPrompt: firstPromptBySession.get(session.id) },
      );
      hydratedSessions.sort(sortByUpdatedDesc);
      const persisted = (currentRecord?.value as string | null | undefined) ?? null;
      const stillExists = persisted && hydratedSessions.some((s) => s.id === persisted);
      set({
        hydrated: true,
        sessions: hydratedSessions,
        currentSessionId: stillExists ? persisted : null,
      });
    })();
    return hydratePromise;
  },

  createSession: async (title) => {
    const now = Date.now();
    const sessionId = newId();
    const rootNodeId = newId();
    const root: QANode = {
      id: rootNodeId,
      sessionId,
      parentEdgeId: null,
      role: 'root',
      content: '',
      status: 'done',
      createdAt: now,
    };
    const session: Session = {
      id: sessionId,
      title: title?.trim() || DEFAULT_SESSION_TITLE,
      createdAt: now,
      updatedAt: now,
      rootNodeId,
    };
    await db.transaction('rw', db.sessions, db.nodes, async () => {
      await db.nodes.put(root);
      await db.sessions.put(session);
    });
    set((s) => ({
      sessions: [session, ...s.sessions].sort(sortByUpdatedDesc),
    }));
    await get().setCurrentSessionId(sessionId);
    return session;
  },

  renameSession: async (id, title) => {
    const trimmed = title.trim() || '未命名会话';
    const now = Date.now();
    await db.sessions.update(id, { title: trimmed, updatedAt: now });
    set((s) => ({
      sessions: s.sessions
        .map((sess) =>
          sess.id === id ? { ...sess, title: trimmed, updatedAt: now } : sess,
        )
        .sort(sortByUpdatedDesc),
    }));
  },

  deleteSession: async (id) => {
    discardStreamsForSession(id);
    await db.transaction('rw', db.sessions, db.nodes, db.edges, db.kv, async () => {
      await db.nodes.where('sessionId').equals(id).delete();
      await db.edges.where('sessionId').equals(id).delete();
      await db.sessions.delete(id);
      await clearCollapsedForSession(id);
    });
    set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) }));
    if (get().currentSessionId === id) {
      const next = get().sessions[0]?.id ?? null;
      await get().setCurrentSessionId(next);
    }
  },

  recordFirstPrompt: async (id, prompt) => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      await get().touchSession(id);
      return;
    }
    const now = Date.now();
    const existing = get().sessions.find((s) => s.id === id);
    const firstPrompt = existing?.firstPrompt ?? trimmedPrompt;
    const shouldAutoTitle =
      !existing || existing.title.trim() === '' || existing.title === DEFAULT_SESSION_TITLE;
    const title = shouldAutoTitle ? makeTitleFromPrompt(trimmedPrompt) : existing.title;

    await db.sessions.update(id, { firstPrompt, title, updatedAt: now });
    set((s) => ({
      sessions: s.sessions
        .map((sess) =>
          sess.id === id ? { ...sess, firstPrompt, title, updatedAt: now } : sess,
        )
        .sort(sortByUpdatedDesc),
    }));
  },

  setCurrentSessionId: async (id) => {
    await db.kv.put({ key: KV_KEYS.currentSessionId, value: id });
    set({ currentSessionId: id });
  },

  touchSession: async (id) => {
    const now = Date.now();
    await db.sessions.update(id, { updatedAt: now });
    set((s) => ({
      sessions: s.sessions
        .map((sess) => (sess.id === id ? { ...sess, updatedAt: now } : sess))
        .sort(sortByUpdatedDesc),
    }));
  },

  setSessionProvider: async (id, providerId) => {
    await db.sessions.update(id, { providerId });
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id ? { ...sess, providerId } : sess,
      ),
    }));
  },
}));

export const selectCurrentSession = (state: SessionsState): Session | null =>
  state.currentSessionId
    ? state.sessions.find((s) => s.id === state.currentSessionId) ?? null
    : null;
