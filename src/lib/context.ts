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

export interface WalkStep {
  /** Node at this step. */
  node: QANode | null;
  /** Incoming edge from parent. `null` for root or a broken link in lenient mode. */
  edge: QAEdge | null;
}

/**
 * Walk the parentEdge chain from `leafId` up to root, returning steps in
 * root → leaf order. Single source of truth for every breadcrumb / path
 * computation in the app.
 *
 * - `strict: true` throws on any missing link or cycle (used by LLM context
 *   builder where a corrupted path must not silently truncate).
 * - `strict: false` returns whatever it could walk; on broken link, returns
 *   the partial trail with the broken edge replaced by null.
 */
export function walkPathToRoot(
  nodes: ReadonlyMap<string, QANode>,
  edges: ReadonlyMap<string, QAEdge>,
  leafId: string,
  opts: { strict?: boolean } = {},
): WalkStep[] {
  const strict = opts.strict ?? false;
  const leaf = nodes.get(leafId);
  if (!leaf) {
    if (strict) throw new Error(`节点不存在：${leafId}`);
    return [];
  }
  const reversed: WalkStep[] = [];
  let cur: QANode | undefined = leaf;
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur.id)) {
      if (strict) throw new Error(`检测到环：${cur.id}`);
      break;
    }
    seen.add(cur.id);

    if (!cur.parentEdgeId) {
      reversed.push({ node: cur, edge: null });
      break;
    }

    const edge = edges.get(cur.parentEdgeId);
    if (!edge) {
      if (strict) throw new Error(`入边缺失：${cur.parentEdgeId}`);
      reversed.push({ node: cur, edge: null });
      break;
    }
    reversed.push({ node: cur, edge });

    cur = nodes.get(edge.fromNodeId);
    if (!cur && strict) throw new Error(`父节点缺失：${edge.fromNodeId}`);
  }
  if (strict && (reversed.length === 0 || reversed[reversed.length - 1].node?.role !== 'root')) {
    throw new Error('未回溯到 root');
  }
  return reversed.reverse();
}

/**
 * Strict variant returning {edge, node} pairs for every step BELOW root
 * (root itself omitted). Used by the LLM context builder.
 */
export function tracePath(
  nodes: ReadonlyMap<string, QANode>,
  edges: ReadonlyMap<string, QAEdge>,
  targetNodeId: string,
): PathStep[] {
  const walk = walkPathToRoot(nodes, edges, targetNodeId, { strict: true });
  const steps: PathStep[] = [];
  for (const { edge, node } of walk) {
    if (!edge || !node) continue;
    steps.push({ edge, node });
  }
  return steps;
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
