import Dexie, { type Table } from 'dexie';
import type { ProviderConfig, QAEdge, QANode, Session } from '@/types';

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
  }
}

export const db = new QATreeDB();

export const KV_KEYS = {
  defaultProviderId: 'settings.defaultProviderId',
  proxy: 'settings.proxy',
  collapsedSubtrees: 'settings.collapsedSubtrees',
} as const;
