import type { QAEdge, QANode, Session } from '@/types';

/**
 * Static demo tree — Transformer learning thread, mirrors the worked example
 * in the design doc. Used by the canvas before milestone 6 wires the real
 * treeStore. Once treeStore is hooked up, delete this module.
 */
const SESSION_ID = 'demo-session';
const ROOT = 'n-root';

const nowMinutes = (m: number) => Date.now() - m * 60_000;

export const fakeSession: Session = {
  id: SESSION_ID,
  title: 'Transformer 深读',
  rootNodeId: ROOT,
  createdAt: nowMinutes(120),
  updatedAt: nowMinutes(2),
};

export const fakeNodes: QANode[] = [
  {
    id: ROOT,
    sessionId: SESSION_ID,
    parentEdgeId: null,
    role: 'root',
    content: '',
    status: 'done',
    createdAt: nowMinutes(120),
  },
  {
    id: 'a1',
    sessionId: SESSION_ID,
    parentEdgeId: 'q1',
    role: 'assistant',
    content:
      'Transformer 是一种基于 self-attention 的序列建模架构。它通过让每个位置同时关注其他所有位置，避开 RNN 的逐步依赖，在长程依赖与并行性上同时占优。\n\n核心组件包括：multi-head self-attention、position-wise FFN、残差连接与 LayerNorm，以及位置编码。',
    status: 'done',
    model: 'gpt-4o-mini',
    tokenUsage: { prompt: 42, completion: 318 },
    createdAt: nowMinutes(110),
  },
  {
    id: 'a2',
    sessionId: SESSION_ID,
    parentEdgeId: 'q2',
    role: 'assistant',
    content:
      'Self-attention 让序列中的每个 token 通过 Q/K/V 投影对所有 token 计算相似度权重，再做加权求和。它的优势是 O(1) 路径长度（任意两位置可直接交互），代价是 O(n²) 复杂度。\n\n直觉是「每个词都问其他所有词：你跟我有多相关？然后把相关的信息汇总进来」。',
    status: 'done',
    model: 'gpt-4o-mini',
    tokenUsage: { prompt: 380, completion: 412 },
    createdAt: nowMinutes(95),
  },
  {
    id: 'a3',
    sessionId: SESSION_ID,
    parentEdgeId: 'q3',
    role: 'assistant',
    content:
      '注意力机制的本质是一个「软查询」：用 Query 去和一组 Key 算相似度，softmax 后作为权重对 Value 求加权和。可以理解为可微分的字典查表。\n\n相比 RNN 的固定隐状态压缩，attention 让模型在每一步直接挑选相关的历史片段。',
    status: 'done',
    model: 'gpt-4o-mini',
    tokenUsage: { prompt: 820, completion: 256 },
    createdAt: nowMinutes(70),
  },
  {
    id: 'a4',
    sessionId: SESSION_ID,
    parentEdgeId: 'q4',
    role: 'assistant',
    content:
      '位置编码补回了 self-attention 丢失的次序信息。原版 Transformer 使用正弦/余弦的固定编码，让模型可推广到比训练更长的序列；后续工作演化出可学习编码、相对位置编码与 RoPE 等变体。',
    status: 'done',
    model: 'gpt-4o-mini',
    tokenUsage: { prompt: 790, completion: 198 },
    createdAt: nowMinutes(65),
  },
  {
    id: 'a5',
    sessionId: SESSION_ID,
    parentEdgeId: 'q5',
    role: 'assistant',
    content:
      'Multi-head 让模型在不同子空间并行学习不同类型的关联：有的 head 关注语法依存，有的关注共指，有的关注长程主题。等价于在低维空间里做多个独立的注意力，再拼回来线性投影。',
    status: 'streaming',
    model: 'gpt-4o-mini',
    createdAt: nowMinutes(3),
  },
  {
    id: 'a6',
    sessionId: SESSION_ID,
    parentEdgeId: 'q6',
    role: 'assistant',
    content:
      '原版 self-attention 是 O(n²) 时间与显存。常见的优化路径有：稀疏 attention（只关注局部 + 全局少数 token）、低秩近似（Linformer/Performer）、分块 + 重计算（FlashAttention 把 O(n²) 显存降为 O(n)），以及 KV cache 复用。',
    status: 'done',
    model: 'gpt-4o-mini',
    tokenUsage: { prompt: 1240, completion: 286 },
    createdAt: nowMinutes(40),
  },
  {
    id: 'a7',
    sessionId: SESSION_ID,
    parentEdgeId: 'q7',
    role: 'assistant',
    content:
      '位置编码与 LayerNorm 相对独立：前者修正"位置丢失"，后者稳定"训练动力学"。但二者会通过残差通道相互影响——RoPE 等近期方法通过对 Q/K 做旋转编码，让位置信号不被 LN 漂白，是工程上需要注意的细节。',
    status: 'aborted',
    model: 'gpt-4o-mini',
    finishReason: 'abort',
    createdAt: nowMinutes(20),
  },
];

export const fakeEdges: QAEdge[] = [
  {
    id: 'q1',
    sessionId: SESSION_ID,
    fromNodeId: ROOT,
    toNodeId: 'a1',
    prompt: '什么是 transformer？',
    createdAt: nowMinutes(112),
  },
  {
    id: 'q2',
    sessionId: SESSION_ID,
    fromNodeId: 'a1',
    toNodeId: 'a2',
    prompt: 'self-attention 怎么工作？',
    createdAt: nowMinutes(100),
  },
  {
    id: 'q3',
    sessionId: SESSION_ID,
    fromNodeId: 'a1',
    toNodeId: 'a3',
    prompt: '注意力机制的直觉？',
    createdAt: nowMinutes(75),
  },
  {
    id: 'q4',
    sessionId: SESSION_ID,
    fromNodeId: 'a1',
    toNodeId: 'a4',
    prompt: '位置编码是怎么设计的？',
    createdAt: nowMinutes(70),
  },
  {
    id: 'q5',
    sessionId: SESSION_ID,
    fromNodeId: 'a3',
    toNodeId: 'a5',
    prompt: '为什么要 multi-head？',
    createdAt: nowMinutes(45),
  },
  {
    id: 'q6',
    sessionId: SESSION_ID,
    fromNodeId: 'a3',
    toNodeId: 'a6',
    prompt: '复杂度如何优化？',
    createdAt: nowMinutes(42),
  },
  {
    id: 'q7',
    sessionId: SESSION_ID,
    fromNodeId: 'a4',
    toNodeId: 'a7',
    prompt: '和 LayerNorm 的关系？',
    createdAt: nowMinutes(22),
  },
];

export const fakeRootNodeId = ROOT;
