export type NodeStatus = 'streaming' | 'done' | 'error';

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  rootNodeId: string;
  providerId?: string;
}

export interface QANode {
  id: string;
  sessionId: string;
  parentEdgeId: string | null;
  role: 'root' | 'assistant';
  content: string;
  status: NodeStatus;
  model?: string;
  tokenUsage?: { prompt: number; completion: number };
  errorMessage?: string;
  createdAt: number;
}

export interface QAEdge {
  id: string;
  sessionId: string;
  fromNodeId: string;
  toNodeId: string;
  prompt: string;
  createdAt: number;
}

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ProxyConfig {
  enabled: boolean;
  url: string;
}
