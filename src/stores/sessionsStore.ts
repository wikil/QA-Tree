import { create } from 'zustand';
import { db, KV_KEYS } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { QANode, Session } from '@/types';

interface SessionsState {
  hydrated: boolean;
  sessions: Session[];
  currentSessionId: string | null;

  hydrate: () => Promise<void>;
  createSession: (title?: string) => Promise<Session>;
  renameSession: (id: string, title: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  setCurrentSessionId: (id: string | null) => Promise<void>;
  touchSession: (id: string) => Promise<void>;
  setSessionProvider: (id: string, providerId: string | undefined) => Promise<void>;
}

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

export const useSessionsStore = create<SessionsState>((set, get) => ({
  hydrated: false,
  sessions: [],
  currentSessionId: null,

  hydrate: async () => {
    if (get().hydrated) return;
    if (hydratePromise) return hydratePromise;
    hydratePromise = (async () => {
      const [sessions, currentRecord] = await Promise.all([
        db.sessions.toArray(),
        db.kv.get(KV_KEYS.currentSessionId),
      ]);
      sessions.sort(sortByUpdatedDesc);
      const persisted = (currentRecord?.value as string | null | undefined) ?? null;
      const stillExists = persisted && sessions.some((s) => s.id === persisted);
      set({
        hydrated: true,
        sessions,
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
      title: title?.trim() || '新会话',
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
