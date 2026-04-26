export interface ProviderPreset {
  name: string;
  baseUrl: string;
  defaultModel: string;
  hint?: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    name: 'OpenAI 官方',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
  },
  {
    name: 'Moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
  },
  {
    name: 'Ollama 本地',
    baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    hint: '本地模型 apiKey 可留空；如浏览器报 CORS，请设 OLLAMA_ORIGINS=*。',
  },
];

export const COMMON_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-3.5-turbo',
  'o1-preview',
  'o1-mini',
  'deepseek-chat',
  'deepseek-reasoner',
  'moonshot-v1-8k',
  'moonshot-v1-32k',
  'moonshot-v1-128k',
  'llama3.2',
  'llama3.1',
  'qwen2.5',
  'mistral',
  'claude-3-5-sonnet-latest',
  'claude-3-5-haiku-latest',
];
