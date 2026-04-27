import type {
  ProviderConfig,
  ProxyConfig,
  ResponseFormatCapability,
  StructuredAnswer,
} from '@/types';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type FinishReason = 'stop' | 'length' | 'abort' | 'error';

export interface CapabilityPatch {
  responseFormat?: Exclude<ResponseFormatCapability, 'unknown'>;
}

export interface StreamChatOptions {
  provider: ProviderConfig;
  proxy?: ProxyConfig;
  messages: ChatMessage[];
  /** Plain-text messages used when JSON mode is rejected and we retry once. */
  plainMessages?: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** Ask the provider for `response_format: json_object` — fall back on 4xx. */
  structured?: boolean;
  /**
   * Streaming callback. `chunk` is the raw token piece. `displayContent` is
   * what should render in the UI: when structured mode succeeds we emit the
   * partial-parsed `answerMarkdown` value so the user sees clean markdown
   * mid-stream instead of raw JSON.
   */
  onDelta?: (chunk: string, displayContent: string) => void;
}

export type StructuredErrorKind = 'parse-failed' | 'fallback';

export interface StreamChatResult {
  /** Renderable body — markdown for structured success, raw text otherwise. */
  content: string;
  /** Untouched assistant text (the raw JSON in structured mode). */
  rawContent: string;
  finishReason: FinishReason;
  model?: string;
  usage?: { prompt: number; completion: number };
  /** Parsed payload when structured mode succeeds. */
  structured?: StructuredAnswer;
  /** Discriminator the UI maps to a localized banner. */
  structuredError?: StructuredErrorKind;
  /** Apply via settingsStore.patchProviderCapability so Zustand stays canonical. */
  capabilityPatch?: CapabilityPatch;
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
  responseFormat?: 'json_object';
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
  if (opts.responseFormat) body.response_format = { type: opts.responseFormat };
  return body;
}

function normalizeFinishReason(value: string | null | undefined): FinishReason {
  if (value === 'length' || value === 'abort' || value === 'error') return value;
  return 'stop';
}

/**
 * Heuristic: a 4xx body that mentions response_format / json_object is the
 * provider rejecting the JSON-mode flag. Loose on purpose — better to retry
 * a few false positives without JSON mode than to surface a confusing 4xx.
 */
function looksLikeResponseFormatRejection(status: number, text: string): boolean {
  if (status < 400 || status >= 500) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes('response_format') ||
    lower.includes('json_object') ||
    lower.includes('json mode') ||
    lower.includes('json schema')
  );
}

const SIMPLE_ESCAPE: Record<string, string> = {
  '"': '"', '\\': '\\', '/': '/',
  n: '\n', t: '\t', r: '\r', b: '\b', f: '\f',
};

/**
 * Stateful extractor for the in-progress value of a single JSON string field.
 * Holds scan/decode position across calls so each invocation is O(new bytes)
 * instead of O(total buffer) — critical because the SSE loop calls it per
 * chunk on a buffer that grows to thousands of chars over a stream.
 *
 * Returns the partial decoded string once the field opens, `null` while the
 * key hasn't appeared yet. Once the closing quote arrives, returns the final
 * decoded value on every subsequent call (no more scanning).
 */
function makePartialStringFieldExtractor(field: string) {
  const keyRegex = new RegExp(`"${field}"\\s*:\\s*"`);
  let cursor = -1; // index of the next char to inspect; -1 = key not yet found
  let decoded = '';
  let closed = false;

  return (buffer: string): string | null => {
    if (closed) return decoded;
    if (cursor === -1) {
      const m = keyRegex.exec(buffer);
      if (!m) return null;
      cursor = m.index + m[0].length;
    }
    let i = cursor;
    while (i < buffer.length) {
      const ch = buffer[i];
      if (ch === '"') {
        closed = true;
        cursor = i + 1;
        return decoded;
      }
      if (ch !== '\\') {
        decoded += ch;
        i++;
        continue;
      }
      if (i + 1 >= buffer.length) break; // partial escape — wait for next byte
      const next = buffer[i + 1];
      if (next === 'u') {
        if (i + 6 > buffer.length) break; // partial \uXXXX
        const hex = buffer.slice(i + 2, i + 6);
        decoded += /^[0-9a-fA-F]{4}$/.test(hex)
          ? String.fromCharCode(parseInt(hex, 16))
          : '\\u' + hex;
        i += 6;
        continue;
      }
      decoded += SIMPLE_ESCAPE[next] ?? next;
      i += 2;
    }
    cursor = i;
    return decoded;
  };
}

/**
 * Best-effort parse of a complete structured response. Strips an optional
 * ```json fence wrapper that some providers emit even under JSON mode.
 */
function parseStructuredAnswer(raw: string): StructuredAnswer | null {
  if (!raw) return null;
  let text = raw.trim();
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```$/;
  const m = fence.exec(text);
  if (m) text = m[1].trim();
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const answerMarkdown =
    typeof obj.answerMarkdown === 'string' && obj.answerMarkdown.trim().length > 0
      ? obj.answerMarkdown
      : null;
  if (!answerMarkdown) return null;
  const title =
    typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : undefined;
  const summary =
    typeof obj.summary === 'string' && obj.summary.trim() ? obj.summary.trim() : undefined;
  const concepts = Array.isArray(obj.concepts)
    ? obj.concepts.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    : undefined;
  const suggestedQuestions = Array.isArray(obj.suggestedQuestions)
    ? obj.suggestedQuestions.filter(
        (q): q is string => typeof q === 'string' && q.trim().length > 0,
      )
    : undefined;
  return {
    title,
    summary,
    concepts: concepts && concepts.length > 0 ? concepts : undefined,
    suggestedQuestions:
      suggestedQuestions && suggestedQuestions.length > 0 ? suggestedQuestions : undefined,
    answerMarkdown,
  };
}

interface RawStreamRun {
  rawContent: string;
  finishReason: FinishReason;
  model?: string;
  usage?: StreamChatResult['usage'];
  /** True when fetch returned a 4xx that looks like a response_format rejection. */
  responseFormatRejected?: boolean;
  /** Truthy when the upstream errored before we have anything useful. */
  fatalError?: LLMError;
}

async function rawStreamChat(opts: {
  provider: ProviderConfig;
  proxy?: ProxyConfig;
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  responseFormat?: 'json_object';
  onChunk: (chunk: string, fullRaw: string) => void;
}): Promise<RawStreamRun> {
  const { provider, proxy, messages, signal, responseFormat, onChunk } = opts;
  const { url, headers } = buildRequestTarget(provider, proxy, 'text/event-stream');
  const body = buildBaseBody({
    provider,
    messages,
    model: opts.model,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    stream: true,
    responseFormat,
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
    if (signal?.aborted) return { rawContent: '', finishReason: 'abort' };
    return {
      rawContent: '',
      finishReason: 'error',
      fatalError: new LLMError(`请求失败：${(e as Error).message}`, undefined, { cause: e }),
    };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    if (responseFormat && looksLikeResponseFormatRejection(response.status, text)) {
      return { rawContent: '', finishReason: 'error', responseFormatRejected: true };
    }
    const detail = text ? ` — ${text.slice(0, 400)}` : '';
    return {
      rawContent: '',
      finishReason: 'error',
      fatalError: new LLMError(
        `${response.status} ${response.statusText}${detail}`,
        response.status,
      ),
    };
  }
  if (!response.body) {
    return {
      rawContent: '',
      finishReason: 'error',
      fatalError: new LLMError('响应缺少 body，可能不是流式响应'),
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let rawContent = '';
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
      rawContent += piece;
      onChunk(piece, rawContent);
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
          return { rawContent, finishReason, model, usage };
        }
      }
    }
    if (buffer.trim().length > 0) {
      handleEvent(buffer);
    }
  } catch (e) {
    if (signal?.aborted) {
      return { rawContent, finishReason: 'abort', model, usage };
    }
    return {
      rawContent,
      finishReason: 'error',
      model,
      usage,
      fatalError: new LLMError(`流读取失败：${(e as Error).message}`, undefined, { cause: e }),
    };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }

  return { rawContent, finishReason, model, usage };
}

export async function streamChat(opts: StreamChatOptions): Promise<StreamChatResult> {
  const { provider, structured, onDelta } = opts;
  const cap = provider.capabilities?.responseFormat ?? 'unknown';
  const tryStructuredFirst = structured === true && cap !== 'unsupported';

  if (tryStructuredFirst) {
    let lastEmitted = '';
    const emit = (next: string) => {
      if (next === lastEmitted) return;
      const delta = next.startsWith(lastEmitted)
        ? next.slice(lastEmitted.length)
        : next;
      lastEmitted = next;
      onDelta?.(delta, next);
    };

    const extractMarkdown = makePartialStringFieldExtractor('answerMarkdown');
    const structuredRun = await rawStreamChat({
      provider,
      proxy: opts.proxy,
      messages: opts.messages,
      model: opts.model,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      signal: opts.signal,
      responseFormat: 'json_object',
      onChunk: (_chunk, fullRaw) => {
        // Wait until answerMarkdown opens before emitting — otherwise we'd
        // leak `{"title":"..."` into the card instead of clean markdown.
        const partial = extractMarkdown(fullRaw);
        if (partial == null) return;
        emit(partial);
      },
    });

    if (structuredRun.responseFormatRejected) {
      const fallback = await runPlainStream({
        ...opts,
        messages: opts.plainMessages ?? opts.messages,
      });
      return {
        ...fallback,
        structuredError:
          fallback.finishReason === 'abort' ? undefined : 'fallback',
        capabilityPatch: { responseFormat: 'unsupported' },
      };
    }
    if (structuredRun.fatalError) throw structuredRun.fatalError;

    const raw = structuredRun.rawContent;
    const parsed = parseStructuredAnswer(raw);
    const capabilityPatch: CapabilityPatch | undefined =
      cap === 'unknown' ? { responseFormat: 'supported' } : undefined;

    if (parsed) {
      // Reconcile the canonical markdown view with whatever the partial
      // extractor last emitted (e.g. trailing escapes that weren't yet decoded).
      emit(parsed.answerMarkdown);
      return {
        content: parsed.answerMarkdown,
        rawContent: raw,
        finishReason: structuredRun.finishReason,
        model: structuredRun.model,
        usage: structuredRun.usage,
        structured: parsed,
        capabilityPatch,
      };
    }

    // Aborted mid-stream: keep whatever partial markdown the user already saw
    // rather than swapping in the half-finished raw JSON.
    const aborted = structuredRun.finishReason === 'abort';
    return {
      content: aborted ? lastEmitted || raw : raw,
      rawContent: raw,
      finishReason: structuredRun.finishReason,
      model: structuredRun.model,
      usage: structuredRun.usage,
      structuredError: aborted ? undefined : 'parse-failed',
      capabilityPatch,
    };
  }

  return runPlainStream(opts);
}

async function runPlainStream(opts: StreamChatOptions): Promise<StreamChatResult> {
  const { onDelta } = opts;
  const plainRun = await rawStreamChat({
    provider: opts.provider,
    proxy: opts.proxy,
    messages: opts.messages,
    model: opts.model,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    signal: opts.signal,
    onChunk: (chunk, fullRaw) => onDelta?.(chunk, fullRaw),
  });
  if (plainRun.fatalError) throw plainRun.fatalError;
  return {
    content: plainRun.rawContent,
    rawContent: plainRun.rawContent,
    finishReason: plainRun.finishReason,
    model: plainRun.model,
    usage: plainRun.usage,
  };
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
