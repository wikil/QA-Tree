import Dexie, { type Table } from 'dexie';
import type { ProviderConfig, QAEdge, QANode, Session } from '@/types';

type LegacySession = Omit<Session, 'titleSource'> &
  Partial<Pick<Session, 'titleSource'>>;

export interface KVRecord<T = unknown> {
  key: string;
  value: T;
}

export class QATreeDB extends Dexie {
  sessions!: Table<Session, string>;
  nodes!: Table<QANode, string>;
  edges!: Table<QAEdge, string>;
  providers!: Table<ProviderConfig, string>;
  kv!: Table<KVRecord, string>;

  constructor() {
    super('qa-tree');
    this.version(1).stores({
      sessions: 'id, updatedAt',
      nodes: 'id, sessionId, parentEdgeId',
      edges: 'id, sessionId, fromNodeId, toNodeId',
      providers: 'id',
      kv: 'key',
    });
    this.version(2)
      .stores({
        sessions: 'id, updatedAt',
        nodes: 'id, sessionId, parentEdgeId',
        edges: 'id, sessionId, fromNodeId, toNodeId',
        providers: 'id',
        kv: 'key',
      })
      .upgrade((tx) =>
        tx
          .table<LegacySession, string>('sessions')
          .toCollection()
          .modify((session) => {
            session.titleSource ??= 'prompt';
          }),
      );
  }
}

export const db = new QATreeDB();

export const KV_KEYS = {
  defaultProviderId: 'settings.defaultProviderId',
  proxy: 'settings.proxy',
  locale: 'settings.locale',
  collapsedSubtrees: 'settings.collapsedSubtrees',
  currentSessionId: 'app.currentSessionId',
  nodePositionsPrefix: 'positions:',
  legacyNodePositions: 'canvas.nodePositions',
} as const;

export type NodePosition = { x: number; y: number };
type SessionPositionMap = Record<string, NodePosition>;
type AllPositionsMap = Record<string, SessionPositionMap>;

function nodePositionsKey(sessionId: string): string {
  return `${KV_KEYS.nodePositionsPrefix}${sessionId}`;
}

async function readLegacyPositions(): Promise<AllPositionsMap> {
  const rec = await db.kv.get(KV_KEYS.legacyNodePositions);
  return (rec?.value as AllPositionsMap | undefined) ?? {};
}

async function removeLegacyPositions(sessionId: string): Promise<void> {
  const all = await readLegacyPositions();
  if (!(sessionId in all)) return;
  delete all[sessionId];
  if (Object.keys(all).length === 0) {
    await db.kv.delete(KV_KEYS.legacyNodePositions);
  } else {
    await db.kv.put({ key: KV_KEYS.legacyNodePositions, value: all });
  }
}

export async function getNodePositions(
  sessionId: string,
): Promise<SessionPositionMap> {
  const rec = await db.kv.get(nodePositionsKey(sessionId));
  if (rec) return (rec.value as SessionPositionMap | undefined) ?? {};

  // Backward compatibility for local data written by the first P2 draft, which
  // stored all sessions under one global KV record.
  const legacy = await readLegacyPositions();
  return legacy[sessionId] ?? {};
}

export async function setNodePositions(
  sessionId: string,
  positions: SessionPositionMap,
): Promise<void> {
  if (Object.keys(positions).length === 0) {
    await db.kv.delete(nodePositionsKey(sessionId));
  } else {
    await db.kv.put({ key: nodePositionsKey(sessionId), value: positions });
  }
  await removeLegacyPositions(sessionId);
}

export async function clearNodePositions(sessionId: string): Promise<void> {
  await setNodePositions(sessionId, {});
}
