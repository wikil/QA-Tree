export type NodeStatus = 'streaming' | 'done' | 'aborted' | 'error';
export type FinishReason = 'stop' | 'length' | 'abort' | 'error';
export type Locale = 'zh' | 'en';
export type SessionTitleSource = 'default' | 'prompt' | 'llm' | 'manual';
export type ResponseFormatCapability = 'unknown' | 'supported' | 'unsupported';
/** Discriminator the UI maps to a localized warning banner. */
export type StructuredErrorKind = 'parse-failed' | 'fallback';

export interface StructuredAnswer {
  /** 8–12 char topic title for headers and breadcrumbs. */
  title?: string;
  /** 2–4 sentence card summary. */
  summary?: string;
  /** Key terms surfaced as soft chips. */
  concepts?: string[];
  /** ★ The soul: 3–6 follow-up directions surfaced as fork chips. */
  suggestedQuestions?: string[];
  /** Renderable markdown body (also written into QANode.content on finalize). */
  answerMarkdown: string;
}

export interface Session {
  id: string;
  title: string;
  titleSource: SessionTitleSource;
  firstPrompt?: string;
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
  finishReason?: FinishReason;
  model?: string;
  tokenUsage?: { prompt: number; completion: number };
  errorMessage?: string;
  createdAt: number;
  /**
   * Structured payload parsed from the LLM JSON response. Optional —
   * absent on legacy nodes and on responses that fall back to plain text.
   * When present, `content` already mirrors `structured.answerMarkdown`.
   */
  structured?: StructuredAnswer;
  /** Discriminator for the soft warning banner; node still finishes as `done`. */
  structuredError?: StructuredErrorKind;
}

export interface QAEdge {
  id: string;
  sessionId: string;
  fromNodeId: string;
  toNodeId: string;
  prompt: string;
  createdAt: number;
}

export interface ProviderCapabilities {
  /**
   * Whether this provider accepts `response_format: { type: 'json_object' }`.
   * `unknown` until the first request probes; `unsupported` after a 4xx that
   * mentions response_format triggers the auto-retry without it.
   */
  responseFormat?: ResponseFormatCapability;
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
  capabilities?: ProviderCapabilities;
}

export interface ProxyConfig {
  enabled: boolean;
  url: string;
}
