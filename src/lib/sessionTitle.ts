import { completeChat } from '@/lib/llm';
import type { ProviderConfig, ProxyConfig } from '@/types';

export interface GenerateSessionTitleOptions {
  provider: ProviderConfig;
  proxy?: ProxyConfig;
  prompt: string;
  answer: string;
  signal?: AbortSignal;
}

function cleanGeneratedTitle(raw: string): string {
  const firstLine = raw
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return '';

  const title = firstLine
    .replace(/^#+\s*/, '')
    .replace(/^标题[:：]\s*/, '')
    .replace(/^[`"'“”‘’]+|[`"'“”‘’]+$/g, '')
    .trim()
    .replace(/\s+/g, ' ');

  return title.length > 40 ? `${title.slice(0, 40)}...` : title;
}

export async function generateSessionTitle(
  opts: GenerateSessionTitleOptions,
): Promise<string> {
  const result = await completeChat({
    provider: opts.provider,
    proxy: opts.proxy,
    signal: opts.signal,
    temperature: 0.2,
    maxTokens: 48,
    messages: [
      {
        role: 'system',
        content:
          '用 8-12 字给以下问答取一个学习主题标题。只输出标题，不要解释，不要引号。',
      },
      {
        role: 'user',
        content: `问题：\n${opts.prompt}\n\n回答：\n${opts.answer.slice(0, 4000)}`,
      },
    ],
  });
  return cleanGeneratedTitle(result.content);
}
