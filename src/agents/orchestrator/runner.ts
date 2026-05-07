import { buildCodeSystemPrompt, buildCriticSystemPrompt, buildPlanSystemPrompt, buildSynthesizeSystemPrompt, parseCriticDecision } from './index';
import type { DiscoveryCandidateItem, ToolTraceItem, DiscoveryTimelineItem } from '../../types';

type RoleMsg = { role: 'system' | 'user' | 'assistant'; content: string };

export interface RetrievalSnapshot {
  candidatePool: DiscoveryCandidateItem[];
  evidenceList: string[];
  topicClusters: string[];
  keywordTokens?: string[];
  searchQueries?: string[];
  toolTrace: ToolTraceItem[];
  timeline: DiscoveryTimelineItem[];
  reasoningTrace: string[];
}

export interface ExecuteOrchestratorDeps {
  chatCompletion: (prompt: RoleMsg[], _unused?: undefined, options?: { agentName?: string; sessionScope?: string; signal?: AbortSignal; finalOnly?: boolean }) => Promise<string>;
  sendByDualLane: (prompt: RoleMsg[], options: {
    agentName?: string;
    sessionScope?: string;
    signal?: AbortSignal;
    finalOnly?: boolean;
    onAnswer?: (text: string) => string;
    streamAnswerToBubble?: boolean;
    streamThinkingToBubble?: boolean;
    debugPhase?: string;
    debugRunId?: string;
    emitDebugFinalSnapshot?: boolean;
  }) => Promise<string>;
  runRealDiscoveryRetrieval: (input: { userQuestion: string; signal?: AbortSignal; rounds?: number; seedKeywords?: string[] }) => Promise<RetrievalSnapshot>;
  resolveOahAgentName: (agent: 'general' | 'reading' | 'writing' | 'personal_kb') => string;
}

export interface ExecuteOrchestratorInput {
  text: string;
  signal?: AbortSignal;
  runId: string;
  contextInfo: string;
  sanitizeAnswerLane: (s: string) => string;
  onStep?: (text: string) => void;
  onRetrieval?: (snapshot: RetrievalSnapshot) => void;
  onStageUpdate?: (stage: 'Plan' | 'Search' | 'Code' | 'Synthesize' | 'Critic', status: 'running' | 'completed', summary: string) => void;
  onStageDetail?: (stage: 'Plan' | 'Search' | 'Code' | 'Synthesize' | 'Critic', status: 'running' | 'completed', summary: string, detail: string, cycle: number) => void;
}

export interface ExecuteOrchestratorResult {
  synthesisText: string;
  criticRaw: string;
  retrievedSnapshot: RetrievalSnapshot | null;
}

export async function executeGeneralOrchestrator(
  deps: ExecuteOrchestratorDeps,
  input: ExecuteOrchestratorInput
): Promise<ExecuteOrchestratorResult> {
  let retrievedSnapshot: RetrievalSnapshot | null = null;
  let synthesisText = '';
  let criticRaw = '';
  let cycle = 1;

  input.onStep?.('Plan：拆解问题并生成执行计划…');
  input.onStageUpdate?.('Plan', 'running', '正在拆解目标与证据需求');
  input.onStageDetail?.('Plan', 'running', '正在拆解目标与证据需求', '', cycle);
  const planText = await deps.chatCompletion(
    [
      { role: 'system', content: buildPlanSystemPrompt() },
      { role: 'user', content: input.text },
    ],
    undefined,
    { agentName: deps.resolveOahAgentName('general'), sessionScope: 'general_orchestrator_plan', signal: input.signal, finalOnly: true }
  );
  input.onStageUpdate?.('Plan', 'completed', (planText || '（Plan 未返回内容）').replace(/\s+/g, ' ').slice(0, 80));
  input.onStageDetail?.('Plan', 'completed', (planText || '（Plan 未返回内容）').replace(/\s+/g, ' ').slice(0, 80), planText || '（Plan 未返回内容）', cycle);

  input.onStep?.('Search：执行多轮检索（Round1/ Round2 滚雪球）…');
  input.onStageUpdate?.('Search', 'running', '正在进行多轮检索');
  input.onStageDetail?.('Search', 'running', '正在进行多轮检索', '', cycle);
  retrievedSnapshot = await deps.runRealDiscoveryRetrieval({
    userQuestion: input.text,
    rounds: 2,
    signal: input.signal,
  });
  input.onRetrieval?.(retrievedSnapshot);
  input.onStageUpdate?.('Search', 'completed', `候选 ${retrievedSnapshot.candidatePool.length} 条，证据 ${retrievedSnapshot.evidenceList.length} 条`);
  input.onStageDetail?.(
    'Search',
    'completed',
    `候选 ${retrievedSnapshot.candidatePool.length} 条，证据 ${retrievedSnapshot.evidenceList.length} 条`,
    [
      `检索式：${(retrievedSnapshot.searchQueries ?? []).slice(0, 5).join(' | ') || '（无）'}`,
      ...retrievedSnapshot.candidatePool.slice(0, 10).map((x, i) => `${i + 1}. ${x.title}`),
    ].join('\n'),
    cycle
  );

  input.onStep?.('Code：对证据进行编码与对齐（方法/结论/局限）…');
  input.onStageUpdate?.('Code', 'running', '正在编码证据');
  input.onStageDetail?.('Code', 'running', '正在编码证据', '', cycle);
  const codingText = await deps.chatCompletion(
    [
      { role: 'system', content: buildCodeSystemPrompt() },
      {
        role: 'user',
        content: [
          `用户问题：${input.text}`,
          `计划：\n${planText || '(无)'}`,
          `候选文献：\n${(retrievedSnapshot.candidatePool ?? []).slice(0, 12).map((x, i) => `${i + 1}. ${x.title}`).join('\n') || '(无)'}`,
        ].join('\n\n'),
      },
    ],
    undefined,
    { agentName: deps.resolveOahAgentName('general'), sessionScope: 'general_orchestrator_code', signal: input.signal, finalOnly: true }
  );
  input.onStageUpdate?.('Code', 'completed', (codingText || '（Code 未返回内容）').replace(/\s+/g, ' ').slice(0, 80));
  input.onStageDetail?.('Code', 'completed', (codingText || '（Code 未返回内容）').replace(/\s+/g, ' ').slice(0, 80), codingText || '（Code 未返回内容）', cycle);

  input.onStep?.('Synthesize：生成结构化最终回答…');
  input.onStageUpdate?.('Synthesize', 'running', '正在生成最终回答');
  input.onStageDetail?.('Synthesize', 'running', '正在生成最终回答', '', cycle);
  synthesisText = await deps.sendByDualLane(
    [
      { role: 'system', content: buildSynthesizeSystemPrompt() },
      {
        role: 'user',
        content: `用户问题：${input.text}\n\nPlan：\n${planText || '(无)'}\n\nSearch 上下文：\n${input.contextInfo}\n\nCode 输出：\n${codingText || '(无)'}`,
      },
    ],
    {
      agentName: deps.resolveOahAgentName('general'),
      sessionScope: 'general_orchestrator_synthesize',
      signal: input.signal,
      finalOnly: true,
      onAnswer: input.sanitizeAnswerLane,
      streamAnswerToBubble: false,
      streamThinkingToBubble: false,
      debugPhase: 'general',
      debugRunId: input.runId,
      emitDebugFinalSnapshot: true,
    }
  );
  input.onStageUpdate?.('Synthesize', 'completed', (synthesisText || '（Synthesize 未返回内容）').replace(/\s+/g, ' ').slice(0, 80));
  input.onStageDetail?.('Synthesize', 'completed', (synthesisText || '（Synthesize 未返回内容）').replace(/\s+/g, ' ').slice(0, 80), synthesisText || '（Synthesize 未返回内容）', cycle);

  input.onStep?.('Critic：检查缺口并判定是否局部回环…');
  input.onStageUpdate?.('Critic', 'running', '正在评估缺口与回环需求');
  input.onStageDetail?.('Critic', 'running', '正在评估缺口与回环需求', '', cycle);
  criticRaw = await deps.chatCompletion(
    [
      { role: 'system', content: buildCriticSystemPrompt() },
      { role: 'user', content: `问题：${input.text}\n\n答案：${synthesisText}\n\n检索候选数：${retrievedSnapshot?.candidatePool.length ?? 0}` },
    ],
    undefined,
    { agentName: deps.resolveOahAgentName('general'), sessionScope: 'general_orchestrator_critic', signal: input.signal, finalOnly: true }
  );
  input.onStageUpdate?.('Critic', 'completed', (criticRaw || '（Critic 未返回内容）').replace(/\s+/g, ' ').slice(0, 80));
  input.onStageDetail?.('Critic', 'completed', (criticRaw || '（Critic 未返回内容）').replace(/\s+/g, ' ').slice(0, 80), criticRaw || '（Critic 未返回内容）', cycle);

  const critic = parseCriticDecision(criticRaw);
  if (critic.needsLoop && critic.queries.length > 0) {
    cycle += 1;
    input.onStep?.(`Critic 判定需回环：${critic.focus || '补充证据'}，执行局部 Search`);
    input.onStageUpdate?.('Search', 'running', `第 ${cycle} 轮回环检索`);
    input.onStageDetail?.('Search', 'running', `第 ${cycle} 轮回环检索`, '', cycle);
    const retryRetrieved = await deps.runRealDiscoveryRetrieval({
      userQuestion: input.text,
      rounds: 1,
      seedKeywords: critic.queries,
      signal: input.signal,
    });
    retrievedSnapshot = retryRetrieved;
    input.onRetrieval?.(retryRetrieved);
    input.onStageUpdate?.('Search', 'completed', `局部回环完成：候选 ${retryRetrieved.candidatePool.length} 条`);
    input.onStageDetail?.(
      'Search',
      'completed',
      `局部回环完成：候选 ${retryRetrieved.candidatePool.length} 条`,
      [`回环检索式：${critic.queries.join(' | ')}`, ...retryRetrieved.candidatePool.slice(0, 10).map((x, i) => `${i + 1}. ${x.title}`)].join('\n'),
      cycle
    );
    if (retryRetrieved.candidatePool.length) {
      input.onStageUpdate?.('Synthesize', 'running', `第 ${cycle} 轮综合生成`);
      input.onStageDetail?.('Synthesize', 'running', `第 ${cycle} 轮综合生成`, '', cycle);
      synthesisText = await deps.sendByDualLane(
        [
          { role: 'system', content: '你是 Synthesize 子 Agent（二次回环）。整合新增检索证据，输出修订后的最终回答。中文，完整独立。' },
          { role: 'user', content: `问题：${input.text}\n\n新增候选：\n${retryRetrieved.candidatePool.slice(0, 10).map((x, i) => `${i + 1}. ${x.title}`).join('\n')}` },
        ],
        {
          agentName: deps.resolveOahAgentName('general'),
          sessionScope: 'general_orchestrator_synthesize_loop',
          signal: input.signal,
          finalOnly: true,
          onAnswer: input.sanitizeAnswerLane,
          streamAnswerToBubble: false,
          streamThinkingToBubble: false,
          debugPhase: 'general',
          debugRunId: input.runId,
          emitDebugFinalSnapshot: true,
        }
      );
      input.onStageUpdate?.('Synthesize', 'completed', `第 ${cycle} 轮综合已完成`);
      input.onStageDetail?.('Synthesize', 'completed', `第 ${cycle} 轮综合已完成`, synthesisText || '（空）', cycle);
    }
  }

  return { synthesisText, criticRaw, retrievedSnapshot };
}
