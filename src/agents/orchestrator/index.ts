import type { ChatMessage } from '../../types';

export type OrchestratorStage = 'plan' | 'search' | 'code' | 'synthesize' | 'critic';

export interface CriticDecision {
  needsLoop: boolean;
  focus: string;
  queries: string[];
}

export function buildPlanSystemPrompt(): string {
  return '你是研究编排器中的 Plan 子 Agent。输出 3-6 条执行计划（中文），每条以 "- " 开头，包含目标、证据需求、成功标准。仅输出计划正文。';
}

export function buildCodeSystemPrompt(): string {
  return '你是 Code 子 Agent。基于给定候选文献标题，输出“证据编码表”（markdown 表格），列为：文献/核心结论/方法/局限/与用户问题关系。仅输出表格和最多3条观察。';
}

export function buildSynthesizeSystemPrompt(): string {
  return `你是研究编排器中的 Synthesize 子 Agent。请综合 Plan + Search + Code 结果，输出可执行的最终答复。
要求：先给结论，再给依据（引用候选文献标题），最后给下一步建议；中文；完整独立，不输出内部流程标签。`;
}

export function buildCriticSystemPrompt(): string {
  return '你是 Critic 子 Agent。判断当前答案是否存在明显证据缺口。仅输出 JSON：{"needsLoop":boolean,"focus":"...","queries":["..."]}，queries 最多3条。';
}

export function parseCriticDecision(raw: string): CriticDecision {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return { needsLoop: false, focus: '', queries: [] };
  try {
    const obj = JSON.parse(m[0]) as { needsLoop?: boolean; focus?: string; queries?: string[] };
    return {
      needsLoop: Boolean(obj?.needsLoop),
      focus: typeof obj?.focus === 'string' ? obj.focus : '',
      queries: Array.isArray(obj?.queries) ? obj.queries.map((x) => String(x).trim()).filter(Boolean).slice(0, 5) : [],
    };
  } catch {
    return { needsLoop: false, focus: '', queries: [] };
  }
}

export function makeSubAgentMessage(
  stage: OrchestratorStage,
  thinkingNarrative: string,
  content: string
): ChatMessage {
  const stageName: Record<OrchestratorStage, string> = {
    plan: 'Plan',
    search: 'Search',
    code: 'Code',
    synthesize: 'Synthesize',
    critic: 'Critic',
  };
  return {
    id: `msg-stage-${stage}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: 'assistant',
    thinkingNarrative: thinkingNarrative.trim(),
    content: `【${stageName[stage]} 子Agent输出】\n${content.trim()}`,
    thinkingTrace: [],
  };
}
