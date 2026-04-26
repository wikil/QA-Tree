import type { ChatMessage } from '@/lib/llm';
import type { ProviderConfig, QAEdge, QANode } from '@/types';

export const DEFAULT_SUMMARY_PROMPT = `你正在帮助用户进行"递归式学习"。请以这样的结构回答：
第一段：用 2-4 句话给出本回答的核心要点摘要，要能独立看懂。
之后：展开详细解释，可使用 markdown 标题、列表、代码块、公式等。
当用户基于路径上的某个回答继续追问时，沿用此结构。`;

export const ABORTED_MARKER = '\n\n[用户中止了上面的回答]';

export interface PathStep {
  edge: QAEdge;
  node: QANode;
}

/**
 * 从目标节点回溯到 root，返回沿途的边/节点对（不含 root，按 root → 当前节点顺序）。
 * 如果路径任一节点缺失（孤儿数据），抛错而不是悄悄返回不完整路径——这是项目灵魂，宁可失败也不污染。
 */
export function tracePath(
  nodes: ReadonlyMap<string, QANode>,
  edges: ReadonlyMap<string, QAEdge>,
  targetNodeId: string,
): PathStep[] {
  const target = nodes.get(targetNodeId);
  if (!target) throw new Error(`节点不存在：${targetNodeId}`);

  const reversed: PathStep[] = [];
  let current: QANode | undefined = target;
  const seen = new Set<string>();

  while (current && current.parentEdgeId) {
    if (seen.has(current.id)) throw new Error(`检测到环：${current.id}`);
    seen.add(current.id);
    const edge = edges.get(current.parentEdgeId);
    if (!edge) throw new Error(`入边缺失：${current.parentEdgeId}`);
    reversed.push({ edge, node: current });
    current = nodes.get(edge.fromNodeId);
    if (!current) throw new Error(`父节点缺失：${edge.fromNodeId}`);
  }

  if (!current || current.role !== 'root') {
    throw new Error('未回溯到 root');
  }

  return reversed.reverse();
}

export function buildSystemPrompt(provider: Pick<ProviderConfig, 'systemPrompt'>): string {
  const base = DEFAULT_SUMMARY_PROMPT;
  const custom = provider.systemPrompt?.trim();
  return custom ? `${base}\n\n${custom}` : base;
}

/**
 * 把 root → targetNodeId 路径 + 新输入构造成 OpenAI 兼容的 messages 序列。
 * 兄弟分支不可见 —— 这是 QA-Tree 的核心约束，所有 LLM 调用都应走这里。
 */
export function buildMessages(args: {
  nodes: ReadonlyMap<string, QANode>;
  edges: ReadonlyMap<string, QAEdge>;
  parentNodeId: string;
  userPrompt: string;
  provider: Pick<ProviderConfig, 'systemPrompt'>;
}): ChatMessage[] {
  const { nodes, edges, parentNodeId, userPrompt, provider } = args;
  const path = tracePath(nodes, edges, parentNodeId);

  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(provider) },
  ];

  for (const { edge, node } of path) {
    messages.push({ role: 'user', content: edge.prompt });
    const content =
      node.status === 'aborted' ? `${node.content}${ABORTED_MARKER}` : node.content;
    messages.push({ role: 'assistant', content });
  }

  messages.push({ role: 'user', content: userPrompt });
  return messages;
}
