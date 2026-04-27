import type { ProviderConfig, ProxyConfig } from '@/types';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type FinishReason = 'stop' | 'length' | 'abort' | 'error';

export interface StreamChatOptions {
  provider: ProviderConfig;
  proxy?: ProxyConfig;
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onDelta?: (delta: string, full: string) => void;
}

export interface StreamChatResult {
  content: string;
  finishReason: FinishReason;
  model?: string;
  usage?: { prompt: number; completion: number };
}

export interface CompleteChatOptions {
  provider: ProviderConfig;
  proxy?: ProxyConfig;
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface CompleteChatResult {
  content: string;
  finishReason: FinishReason;
  model?: string;
  usage?: { prompt: number; completion: number };
}

export class LLMError extends Error {
  status?: number;
  constructor(message: string, status?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LLMError';
    this.status = status;
  }
}

interface OpenAIStreamChunk {
  model?: string;
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface OpenAICompleteResponse {
  model?: string;
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

const stripTrailingSlash = (s: string) => s.replace(/\/+$/, '');

function buildRequestTarget(
  provider: ProviderConfig,
  proxy: ProxyConfig | undefined,
  accept: string,
) {
  const upstreamUrl = `${stripTrailingSlash(provider.baseUrl)}/chat/completions`;
  const useProxy = proxy?.enabled === true && !!proxy.url;
  const url = useProxy ? `${stripTrailingSlash(proxy!.url)}/forward` : upstreamUrl;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: accept,
  };
  if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
  if (useProxy) headers['X-Upstream-URL'] = upstreamUrl;

  return { url, headers };
}

function buildBaseBody(opts: {
  provider: ProviderConfig;
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream: boolean;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: opts.model ?? opts.provider.defaultModel,
    messages: opts.messages,
    stream: opts.stream,
  };
  const temperature = opts.temperature ?? opts.provider.temperature;
  if (temperature !== undefined) body.temperature = temperature;
  const maxTokens = opts.maxTokens ?? opts.provider.maxTokens;
  if (maxTokens !== undefined) body.max_tokens = maxTokens;
  return body;
}

function normalizeFinishReason(value: string | null | undefined): FinishReason {
  if (value === 'length' || value === 'abort' || value === 'error') return value;
  return 'stop';
}

export async function streamChat(opts: StreamChatOptions): Promise<StreamChatResult> {
  const { provider, proxy, messages, signal, onDelta } = opts;
  const { url, headers } = buildRequestTarget(provider, proxy, 'text/event-stream');
  const body = buildBaseBody({
    provider,
    messages,
    model: opts.model,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    stream: true,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (signal?.aborted) return { content: '', finishReason: 'abort' };
    throw new LLMError(`请求失败：${(e as Error).message}`, undefined, { cause: e });
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const detail = text ? ` — ${text.slice(0, 400)}` : '';
    throw new LLMError(`${response.status} ${response.statusText}${detail}`, response.status);
  }
  if (!response.body) {
    throw new LLMError('响应缺少 body，可能不是流式响应');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let content = '';
  let finishReason: FinishReason = 'stop';
  let model: string | undefined = body.model as string;
  let usage: StreamChatResult['usage'];

  const handleEvent = (rawEvent: string): boolean => {
    const dataLines = rawEvent
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trimStart());
    if (dataLines.length === 0) return false;
    const data = dataLines.join('\n');
    if (data === '[DONE]') return true;

    let parsed: OpenAIStreamChunk;
    try {
      parsed = JSON.parse(data);
    } catch {
      return false;
    }
    const choice = parsed.choices?.[0];
    const piece = choice?.delta?.content;
    if (piece) {
      content += piece;
      onDelta?.(piece, content);
    }
    const fr = choice?.finish_reason;
    if (fr === 'stop' || fr === 'length' || fr === 'error') finishReason = fr;
    if (parsed.model) model = parsed.model;
    if (parsed.usage) {
      usage = {
        prompt: parsed.usage.prompt_tokens ?? 0,
        completion: parsed.usage.completion_tokens ?? 0,
      };
    }
    return false;
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (handleEvent(rawEvent)) {
          return { content, finishReason, model, usage };
        }
      }
    }
    if (buffer.trim().length > 0) {
      handleEvent(buffer);
    }
  } catch (e) {
    if (signal?.aborted) return { content, finishReason: 'abort', model, usage };
    throw new LLMError(`流读取失败：${(e as Error).message}`, undefined, { cause: e });
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }

  return { content, finishReason, model, usage };
}

export async function completeChat(
  opts: CompleteChatOptions,
): Promise<CompleteChatResult> {
  const { provider, proxy, messages, signal } = opts;
  const { url, headers } = buildRequestTarget(provider, proxy, 'application/json');
  const body = buildBaseBody({
    provider,
    messages,
    model: opts.model,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    stream: false,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (signal?.aborted) return { content: '', finishReason: 'abort' };
    throw new LLMError(`请求失败：${(e as Error).message}`, undefined, { cause: e });
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const detail = text ? ` — ${text.slice(0, 400)}` : '';
    throw new LLMError(`${response.status} ${response.statusText}${detail}`, response.status);
  }

  let parsed: OpenAICompleteResponse;
  try {
    parsed = (await response.json()) as OpenAICompleteResponse;
  } catch (e) {
    throw new LLMError(`响应 JSON 解析失败：${(e as Error).message}`, undefined, {
      cause: e,
    });
  }

  const choice = parsed.choices?.[0];
  const usage = parsed.usage
    ? {
        prompt: parsed.usage.prompt_tokens ?? 0,
        completion: parsed.usage.completion_tokens ?? 0,
      }
    : undefined;
  return {
    content: choice?.message?.content ?? '',
    finishReason: normalizeFinishReason(choice?.finish_reason),
    model: parsed.model ?? (body.model as string),
    usage,
  };
}
