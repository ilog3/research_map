import { useState, useRef, useEffect, useMemo } from 'react';
import { useStore, LITERATURE_REVIEW_PANELS } from '../../store';
import ChatMessage from './ChatMessage';
import {
  chatCompletion,
  buildPaperChatPrompt,
  buildReadingAssistantPrompt,
  parseReadingAssistantResponse,
  buildWritingAssistantPrompt,
  parseWritingAssistantResponse,
  classifyUserIntent,
  resolveOahAgentName,
  buildFramingTaskPrompt,
  parseFramingTaskResponse,
  buildDiscoveryExecutionPrompt,
  parseDiscoveryExecutionResponse,
  buildDiscoveryTracePreview,
  runRealDiscoveryRetrieval,
  buildLiteratureReviewPrompt,
  parseLiteratureReviewResponse,
  normalizePersonalLibraryLiteratureReview,
  getLiteratureReviewAgentName,
  buildDetailedPlanningThinkingPrompt,
  expandLiteratureReviewNarrative,
  MAX_LITERATURE_OUTLINE_SECTIONS,
  buildPersonalKbChatPrompt,
  type ChatStreamEvent,
  type LiteratureReviewResult,
} from '../../services/llm';
import type {
  ChatMessage as ChatMessageType,
  AgentRunState,
  ModelDebugKind,
  RightPanelCard,
  PersonalLibraryParsedDocumentForReview,
} from '../../types';
import {
  sanitizeThoughtLinesForUser,
  sanitizeThinkingStepLine,
  stripProtocolTags,
  stripInferenceAndThinkingFromProse,
} from '../../utils/thinkingDisplay';
import { parsePersonalKbStructuredSections } from '../../utils/personalKbDisplay';
import ModelDebugPanel from './ModelDebugPanel';
import { addMessageFavorite } from '../../utils/favoritesStorage';
import { parsePersonalLibraryPdfsForLiteratureReview } from '../../services/personalLibraryLiteratureReview';
import { executeGeneralOrchestrator } from '../../agents/orchestrator/runner';

function extractHttpMeta(message: string): { url?: string; status?: number } {
  const urlMatch = message.match(/url=([^\s]+)/);
  const statusMatch = message.match(/请求失败\((\d+)\)/);
  return {
    url: urlMatch?.[1],
    status: statusMatch ? Number(statusMatch[1]) : undefined,
  };
}

function dedupeRepeatedText(input: string): string {
  const s = input.trim();
  if (!s) return input;
  if (s.length % 2 === 0) {
    const half = s.length / 2;
    if (s.slice(0, half) === s.slice(half)) return s.slice(0, half);
  }
  const lines = s.split('\n').filter((x) => x.trim().length > 0);
  if (lines.length >= 6) {
    const mid = Math.floor(lines.length / 2);
    const a = lines.slice(0, mid).join('\n').trim();
    const b = lines.slice(mid).join('\n').trim();
    if (a && a === b) return a;
  }
  return input;
}

/**
 * 定位「结构化正文」起点。须兼容「。### 一、」同段粘连（仅匹配行首时会从「二、」才开始，导致丢掉「一、」整节）。
 */
function findStructuredBodyStart(s: string): number {
  const candidates: number[] = [];
  const reHash = /###\s*[一二三四五六七八九十百零〇]+[、.．]/g;
  let m: RegExpExecArray | null;
  while ((m = reHash.exec(s)) !== null) {
    candidates.push(m.index);
  }
  const reLine = /(?:^|[\n\r])\s*[一二三四五六七八九十百零〇]{1,5}[、.．]/gm;
  while ((m = reLine.exec(s)) !== null) {
    candidates.push(m.index);
  }
  if (candidates.length === 0) return -1;
  return Math.min(...candidates);
}

function sanitizeFinalAnswer(input: string): string {
  const raw = dedupeRepeatedText(input || '').trim();
  if (!raw) return raw;
  const withoutCodeFence = raw.replace(/```[\s\S]*?```/g, '').trim();
  const firstStructuredIdx = findStructuredBodyStart(withoutCodeFence);
  const bodyCandidate = firstStructuredIdx >= 0
    ? withoutCodeFence.slice(firstStructuredIdx).trim()
    : withoutCodeFence;
  const cleanedLines = withoutCodeFence
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((line) =>
      !/^Framing 输出回执[:：]?/i.test(line) &&
      !/^Discovery 输出回执[:：]?/i.test(line) &&
      !/^Discovery 诊断[:：]?/i.test(line) &&
      !/^关键词计划[:：]?/i.test(line) &&
      !/^检索式[:：]?/i.test(line) &&
      !/^兜底原因[:：]?/i.test(line) &&
      !/^tool[-_]/i.test(line) &&
      !/^<TASK_CARD_JSON>/i.test(line) &&
      !/^<\/TASK_CARD_JSON>/i.test(line)
    );
  const structuredLines = bodyCandidate
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((line) =>
      !/^(用户现在需要我|首先|对，就直接输出|然后是|现在整理出来|下面给出|按要求来|不用别的)/.test(line) &&
      !/^Framing 输出回执[:：]?/i.test(line) &&
      !/^Discovery 输出回执[:：]?/i.test(line) &&
      !/^Discovery 诊断[:：]?/i.test(line) &&
      !/^关键词计划[:：]?/i.test(line) &&
      !/^检索式[:：]?/i.test(line) &&
      !/^兜底原因[:：]?/i.test(line) &&
      !/^tool[-_]/i.test(line) &&
      !/^<TASK_CARD_JSON>/i.test(line) &&
      !/^<\/TASK_CARD_JSON>/i.test(line)
    );
  const picked = structuredLines.length > 0 ? structuredLines : cleanedLines;
  return picked.join('\n').trim();
}

function collapseRepeatedLineWindows(input: string): string {
  const lines = input.split('\n').map((x) => x.trimEnd());
  const nonEmpty = lines.filter((x) => x.trim().length > 0);
  // If the model repeats the same structured block, keep the first pass.
  for (let n = Math.min(12, Math.floor(nonEmpty.length / 2)); n >= 5; n--) {
    const sig = nonEmpty.slice(0, n).join('\n');
    const tail = nonEmpty.slice(n).join('\n');
    const idx = tail.indexOf(sig);
    if (idx >= 0) {
      const head = tail.slice(0, idx).trim();
      return [sig, head].filter(Boolean).join('\n').trim();
    }
  }
  return input;
}

function normalizeVisibleAnswer(input: string): string {
  const stripped = stripInferenceAndThinkingFromProse(dedupeRepeatedText(input || '').trim());
  if (!stripped) return '';
  const collapsed = collapseRepeatedLineWindows(stripped);
  return sanitizeFinalAnswer(collapsed) || collapsed;
}

/** 异步链路中仅在当前仍为「自由研究」时更新右栏，避免用户已切到阅读/写作仍被覆盖 */
function setGeneralRightPanelCardsIfActive(cards: RightPanelCard[]) {
  const { activeAgent, setRightPanelCards } = useStore.getState();
  if (activeAgent === 'general') setRightPanelCards(cards);
}

/** 综述助手完成一轮生成后刷新侧栏顺序（不覆盖用户已切走的其它助手） */
function setLiteratureReviewPanelsAfterGeneration() {
  const { activeAgent, setRightPanelCards } = useStore.getState();
  if (activeAgent === 'literature_review') setRightPanelCards([...LITERATURE_REVIEW_PANELS]);
}

function mergeUniqueTrace(prev: string[], incoming: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of [...prev, ...incoming]) {
    const item = x.trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

/** 中间栏「思考过程」单行摘要，避免过长 */
function truncateStepText(s: string, max = 140): string {
  const t = s.trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function extractFramingVisibleOutput(raw: string): string {
  const cleaned = stripProtocolTags(raw).trim();
  if (!cleaned) return '';
  return cleaned.length > 12000 ? `${cleaned.slice(0, 12000)}…` : cleaned;
}

/** 避免将整段提示词/OAH 原始报错直接展示给用户（完整信息仍在调试台） */
function shortenOahErrorMessage(raw: string): string {
  const m = raw.trim();
  if (!m) return 'unknown error';
  if (/你是文献综述写作助手|你是学术中文写作助手|硬性要求|OAH stream events/i.test(m) && m.length > 100) {
    return '模型服务异常（常见于单次请求过长或会话上下文超限）。请减少综述文献篇数或缩短问题后重试；完整报错见调试台。';
  }
  if (m.length > 220) {
    return `${m.slice(0, 100)}…（已截断，详见调试台）`;
  }
  return m;
}

/** 侧栏「综述成稿」：仅大纲 + 综述正文（可带进度提示）+ Gaps；不含对话摘要/思考过程（摘要只在气泡中展示）。 */
function composeLiteratureReviewDraft(
  review: LiteratureReviewResult,
  narrativeBody: string,
  extraStatus?: string
): string {
  const litDraftParts: string[] = [];
  if (review.outline?.length) {
    litDraftParts.push(
      `## 写作大纲\n${review.outline
        .map((o, i) => `${i + 1}. ${stripInferenceAndThinkingFromProse(o)}`)
        .join('\n')}`
    );
  }
  const nar = stripInferenceAndThinkingFromProse(narrativeBody.trim());
  const st = extraStatus?.trim();
  if (nar || st) {
    litDraftParts.push(`## 综述正文\n${nar}${nar && st ? '\n\n' : ''}${st ?? ''}`);
  }
  if (review.gaps.length > 0) {
    litDraftParts.push(
      `## 研究空白（Gaps）\n${review.gaps
        .map((g, i) => `${i + 1}. ${stripInferenceAndThinkingFromProse(g)}`)
        .join('\n')}`
    );
  }
  return litDraftParts.filter(Boolean).join('\n\n');
}

export default function AIChat() {
  type StageLive = { stage: 'Plan' | 'Search' | 'Code' | 'Synthesize' | 'Critic'; status: 'running' | 'completed'; summary: string };
  const papers = useStore((s) => s.papers);
  const selectedPaperId = useStore((s) => s.selectedPaperId);
  const clusters = useStore((s) => s.clusters);
  const visibleClusterIds = useStore((s) => s.visibleClusterIds);
  const yearRange = useStore((s) => s.yearRange);
  const searchQuery = useStore((s) => s.searchQuery);
  const agentMode = useStore((s) => s.agentMode);
  const readingSession = useStore((s) => s.readingSession);
  const reasoningLevel = useStore((s) => s.reasoningLevel);
  const setAgentMode = useStore((s) => s.setAgentMode);
  const startReadingByIntent = useStore((s) => s.startReadingByIntent);
  const switchReadingStyle = useStore((s) => s.switchReadingStyle);
  const setReadingOutput = useStore((s) => s.setReadingOutput);
  const setReadingGoal = useStore((s) => s.setReadingGoal);
  const activeThreadId = useStore((s) => s.activeThreadId);
  const activeAgent = useStore((s) => s.activeAgent);
  const chatThreads = useStore((s) => s.chatThreads);
  const upsertActiveThreadMessages = useStore((s) => s.upsertActiveThreadMessages);
  const writingTask = useStore((s) => s.writingTask);
  const writingMaterial = useStore((s) => s.writingMaterial);
  const setWritingOutput = useStore((s) => s.setWritingOutput);
  const setActiveAgent = useStore((s) => s.setActiveAgent);
  const setAgentRunState = useStore((s) => s.setAgentRunState);
  const setResearchTaskCard = useStore((s) => s.setResearchTaskCard);
  const researchTaskCard = useStore((s) => s.researchTaskCard);
  const setDiscoveryOutput = useStore((s) => s.setDiscoveryOutput);
  const setRelatedWorkOutput = useStore((s) => s.setRelatedWorkOutput);
  const discoveryCandidatePool = useStore((s) => s.discoveryCandidatePool);
  const pendingAutoAsk = useStore((s) => s.pendingAutoAsk);
  const setPendingAutoAsk = useStore((s) => s.setPendingAutoAsk);
  const setLiteratureReviewLocalCandidates = useStore((s) => s.setLiteratureReviewLocalCandidates);
  const setPersonalKbWorkbench = useStore((s) => s.setPersonalKbWorkbench);
  const pushModelDebug = useStore((s) => s.pushModelDebug);
  const clearModelDebug = useStore((s) => s.clearModelDebug);
  const modelDebugEntries = useStore((s) => s.modelDebugEntries);
  const agentToolTrace = useStore((s) => s.agentRunState.toolTrace);
  const retrievalMeta = useStore((s) => s.retrievalPreviewMeta);
  const setRetrievalMeta = useStore((s) => s.setRetrievalPreviewMeta);
  const focusRightPanelCard = useStore((s) => s.focusRightPanelCard);
  const focusRightPanelStage = useStore((s) => s.focusRightPanelStage);
  const rightPanelCards = useStore((s) => s.rightPanelCards);
  const setRightPanelCards = useStore((s) => s.setRightPanelCards);
  const [input, setInput] = useState('');
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [thinkingSeconds, setThinkingSeconds] = useState(0);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<string[]>([]);
  const [stageLive, setStageLive] = useState<StageLive[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messages = useMemo(
    () => chatThreads.find((t) => t.id === activeThreadId)?.messages ?? [],
    [activeThreadId, chatThreads]
  );
  const lastUserBubble = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'user')?.content ?? '',
    [messages]
  );

  const lastAssistantWithContentIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && messages[i].content.trim()) return i;
    }
    return -1;
  }, [messages]);
  const retrievalToolNames = useMemo(() => {
    const trace = agentToolTrace ?? [];
    const names = trace
      .map((t) => t.tool)
      .filter((name) => /retriev|search|discover|semantic|google|scholar|rewrite|query-rewriter|query|keyword-parser/i.test(name));
    return [...new Set(names)].slice(0, 3);
  }, [agentToolTrace]);
  const stageOrder = ['Plan', 'Search', 'Code', 'Synthesize', 'Critic'] as const;
  const currentStageIndex = useMemo(() => {
    const text = thinkingSteps.join('\n');
    if (/Critic[:：]/i.test(text)) return 4;
    if (/Synthesize[:：]/i.test(text)) return 3;
    if (/Code[:：]/i.test(text)) return 2;
    if (/Search[:：]/i.test(text)) return 1;
    if (/Plan[:：]/i.test(text)) return 0;
    return 0;
  }, [thinkingSteps]);

  const appendThoughtTrace = (runId: string, lines: string[]) => {
    const current = useStore.getState().agentRunState;
    const prev = current.runId === runId ? (current.thoughtTrace ?? []) : [];
    setAgentRunState({
      runId,
      thoughtTrace: mergeUniqueTrace(prev, lines),
    });
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!loading) {
      setThinkingSeconds(0);
      return;
    }
    const timer = setInterval(() => setThinkingSeconds((x) => x + 1), 1000);
    return () => clearInterval(timer);
  }, [loading]);

  const selectedPaper = selectedPaperId ? papers.find((p) => p.id === selectedPaperId) : null;
  const isReadingMode = agentMode.startsWith('reading');
  const isResearchPlanningIntent = (text: string): boolean =>
    /(我想做.*研究|研究问题|评估标准|研究设计|变量|假设|实验设计|对照组|因变量|自变量|样本|量表|效度|信度)/.test(text);
  const isLiteratureReviewIntent = (text: string): boolean =>
    /(文献综述|综述|related\s*work|研究空白|gap|横向对比|局限|方法对比|数据集对比|指标对比|写.*综述|撰写综述|帮我.*综述|写一篇.*综述|梳理.*文献|整理.*文献|做.*文献综述)/i.test(
      text
    );

  type SendOpts = { regenerateLastAssistant?: boolean };

  const handleSend = async (forcedText?: string, opts?: SendOpts) => {
    const regenerate = opts?.regenerateLastAssistant === true;
    let text: string;
    let appended: ChatMessageType[];
    let history: { role: 'user' | 'assistant'; content: string }[];

    if (regenerate) {
      const msgs = useStore.getState().chatThreads.find((t) => t.id === activeThreadId)?.messages ?? messages;
      if (msgs.length < 2 || loading) return;
      const last = msgs[msgs.length - 1];
      const prev = msgs[msgs.length - 2];
      if (last.role !== 'assistant' || prev.role !== 'user') return;
      text = prev.content.trim();
      if (!text) return;
      const assistantMsg: ChatMessageType = { id: `msg-${Date.now()}`, role: 'assistant', content: '' };
      appended = [...msgs.slice(0, -1), assistantMsg];
      history = msgs.slice(0, -2).map((m) => ({ role: m.role, content: m.content }));
      upsertActiveThreadMessages(appended);
      setLoading(true);
      abortControllerRef.current = new AbortController();
    } else {
      text = (forcedText ?? input).trim();
    if (!text || loading) return;
      if (!forcedText) setInput('');

    const userMsg: ChatMessageType = { id: `msg-${Date.now()}`, role: 'user', content: text };
    const assistantMsg: ChatMessageType = { id: `msg-${Date.now() + 1}`, role: 'assistant', content: '' };

      appended = [...messages, userMsg, assistantMsg];
      upsertActiveThreadMessages(appended);
    setLoading(true);
      abortControllerRef.current = new AbortController();
      history = messages.map((m) => ({ role: m.role, content: m.content }));
    }

    const signal = abortControllerRef.current!.signal;
    {
      const agentNow = useStore.getState().activeAgent;
      if (agentNow === 'general') {
        const hasTask = researchTaskCard.updatedAt > 0;
        useStore.getState().setRightPanelCards(
          hasTask
            ? ['task', 'candidate', 'local_graph', 'related_work', 'graph']
            : ['graph']
        );
      }
    }

    try {
      const pushDbg = (runId: string | undefined, kind: ModelDebugKind, phase: string, label: string, content: string) => {
        pushModelDebug({ threadId: activeThreadId, runId, kind, phase, label, content });
      };
      const updateLastAssistant = (
        updater: (m: ChatMessageType) => ChatMessageType
      ) => {
        const currentMessages =
          useStore.getState().chatThreads.find((t) => t.id === activeThreadId)?.messages ?? appended;
        if (!currentMessages.length) return;
        upsertActiveThreadMessages(
          currentMessages.map((m, idx) =>
            idx === currentMessages.length - 1 && m.role === 'assistant' ? updater(m) : m
          )
        );
      };
      const buildDualLaneHandler = (opts?: {
        onThinking?: (text: string) => string;
        onAnswer?: (text: string) => string;
        streamAnswerToBubble?: boolean;
        streamThinkingToBubble?: boolean;
        debugLabel?: string;
        debugPhase?: string;
        debugRunId?: string;
        stats?: {
          thinkingEvents: number;
          answerEvents: number;
          latestThinkingLen: number;
          latestAnswerLen: number;
          rawThinkingFinal: string;
          rawAnswerFinal: string;
          renderedThinkingFinal: string;
          renderedAnswerFinal: string;
        };
      }) => (ev: ChatStreamEvent) => {
        const st = opts?.stats;
        if (st) {
          if (ev.lane === 'thinking') {
            st.thinkingEvents += 1;
            st.latestThinkingLen = ev.content.length;
            st.rawThinkingFinal = ev.content;
          } else if (ev.lane === 'answer') {
            st.answerEvents += 1;
            st.latestAnswerLen = ev.content.length;
            st.rawAnswerFinal = ev.content;
          }
        }
        if (ev.lane === 'thinking') {
          const thinkingText = opts?.onThinking ? opts.onThinking(ev.content) : ev.content;
          if (st) st.renderedThinkingFinal = thinkingText;
          if (opts?.streamThinkingToBubble !== false) {
            updateLastAssistant((m) => ({ ...m, thinkingNarrative: thinkingText }));
          }
        } else if (ev.lane === 'answer') {
          const answerText = opts?.onAnswer ? opts.onAnswer(ev.content) : ev.content;
          if (st) st.renderedAnswerFinal = answerText;
          if (opts?.streamAnswerToBubble !== false) {
            updateLastAssistant((m) => ({ ...m, content: answerText }));
          }
        }
      };
      const sendByDualLane = async (
        prompt: Parameters<typeof chatCompletion>[0],
        options: {
          agentName?: string;
          sessionScope?: string;
          signal?: AbortSignal;
          finalOnly?: boolean;
          onThinking?: (text: string) => string;
          onAnswer?: (text: string) => string;
          streamAnswerToBubble?: boolean;
          streamThinkingToBubble?: boolean;
          debugPhase?: string;
          debugRunId?: string;
          emitDebugFinalSnapshot?: boolean;
        }
      ) => {
        const stats = {
          thinkingEvents: 0,
          answerEvents: 0,
          latestThinkingLen: 0,
          latestAnswerLen: 0,
          rawThinkingFinal: '',
          rawAnswerFinal: '',
          renderedThinkingFinal: '',
          renderedAnswerFinal: '',
        };
        return chatCompletion(prompt, undefined, {
          agentName: options.agentName,
          sessionScope: options.sessionScope,
          signal: options.signal,
          finalOnly: options.finalOnly,
          onEvent: buildDualLaneHandler({
            onThinking: options.onThinking,
            onAnswer: options.onAnswer,
            streamAnswerToBubble: options.streamAnswerToBubble,
            streamThinkingToBubble: options.streamThinkingToBubble,
            debugLabel: options.sessionScope ?? options.agentName ?? activeAgent,
            debugPhase: options.debugPhase,
            debugRunId: options.debugRunId,
            stats,
          }),
        }).finally(() => {
          if (options.emitDebugFinalSnapshot) {
            pushDbg(
              options.debugRunId,
              'meta',
              options.debugPhase ?? 'dual_lane_stream',
              `[stream.final.snapshot] ${options.sessionScope ?? options.agentName ?? activeAgent}`,
              [
                `thinking_events=${stats.thinkingEvents}, answer_events=${stats.answerEvents}`,
                `thinking_len=${stats.latestThinkingLen}, answer_len=${stats.latestAnswerLen}`,
                '',
                '=== thinking(raw final) ===',
                stats.rawThinkingFinal || '（空）',
                '',
                '=== answer(raw final) ===',
                stats.rawAnswerFinal || '（空）',
                '',
                '=== thinking(rendered final) ===',
                stats.renderedThinkingFinal || '（空）',
                '',
                '=== answer(rendered final) ===',
                stats.renderedAnswerFinal || '（空）',
              ].join('\n')
            );
          }
          pushDbg(
            options.debugRunId,
            'meta',
            options.debugPhase ?? 'dual_lane_stream',
            `[stream.summary] ${options.sessionScope ?? options.agentName ?? activeAgent}`,
            `thinking_events=${stats.thinkingEvents}, answer_events=${stats.answerEvents}, thinking_len=${stats.latestThinkingLen}, answer_len=${stats.latestAnswerLen}${
              stats.thinkingEvents === 0 ? '\nWARNING: 本轮未收到任何 thinking lane 事件。' : ''
            }`
          );
          if (stats.renderedThinkingFinal.trim()) {
            pushDbg(
              options.debugRunId,
              'user_thinking',
              options.debugPhase ?? 'dual_lane_stream',
              '对用户展示的思考（与 thinking 渲染一致）',
              stats.renderedThinkingFinal
            );
          }
        });
      };
      const sanitizeAnswerLane = (textIn: string) => normalizeVisibleAnswer(textIn);

      const planningIntent = isResearchPlanningIntent(text);
      // 阅读模式下只走 reading 助手，不触发研究规划（framing/discovery）链路
      const skipPlanningForReading =
        activeAgent === 'reading' || isReadingMode;
      const skipPlanningForPersonalKb = activeAgent === 'personal_kb';
      const willRunPlanning =
        planningIntent && !researchTaskCard.locked && !skipPlanningForReading && !skipPlanningForPersonalKb;
      if (willRunPlanning) {
        setGeneralRightPanelCardsIfActive(['task', 'candidate', 'local_graph', 'related_work', 'graph']);
        setThinkingSteps([
          `本轮问题：${truncateStepText(text)}`,
          '识别为研究规划请求，研究助手正在进行任务框定。',
        ]);
        setThinkingExpanded(true);
        const runId = `run-${Date.now()}`;
        let planningThinkingNarrative = '';
        setAgentRunState({
          runId,
          agent: 'general',
          status: 'running',
          startedAt: Date.now(),
          endedAt: null,
          error: '',
          thoughtTrace: ['识别为研究规划请求，研究助手正在进行任务框定。'],
          toolTrace: [{ id: 'tool-framing', tool: 'research.framing', status: 'running', summary: '生成研究问题与评估标准' }],
          timeline: [
            {
              stage: 'queued',
              status: 'completed',
              message: '任务入队，等待执行研究规划步骤',
              timestamp: Date.now(),
            },
          ],
        });
        // Step 1: framing
        const framingRaw = await chatCompletion(
          buildFramingTaskPrompt({ userQuestion: text, history }),
          undefined,
          { agentName: 'framing', sessionScope: 'framing_task_card', signal, finalOnly: true }
        );
        pushDbg(runId, 'raw_llm', 'planning', '研究规划步骤模型原始输出（可含 <TASK_CARD_JSON>）', framingRaw);
        const framingVisibleOutput = extractFramingVisibleOutput(framingRaw);
        setAgentRunState({
          runId,
          toolTrace: [
            { id: 'tool-framing', tool: 'research.framing', status: 'completed', summary: '已返回原始任务卡文本，等待结构化提取' },
          ],
        });
        setThinkingSteps((prev) => [...prev, '研究规划步骤完成，正在结构化任务卡。']);
        const taskCard = parseFramingTaskResponse(framingRaw);
        if (taskCard) {
          pushDbg(runId, 'meta', 'planning', 'parseFramingTaskResponse 后的任务卡对象', JSON.stringify(taskCard, null, 2));
          setResearchTaskCard({ ...taskCard, framingOutput: framingVisibleOutput, source: 'auto' });
          setGeneralRightPanelCardsIfActive(['task', 'candidate', 'local_graph', 'related_work', 'graph']);
          appendThoughtTrace(runId, [
            `已整理研究焦点：${truncateStepText(taskCard.problemStatement, 200)}`,
            ...(taskCard.rqList.length
              ? [`关注的研究问题包括：${taskCard.rqList.slice(0, 3).join('；')}`]
              : []),
          ]);
        } else {
          setThinkingSteps((prev) => [...prev, '研究规划步骤输出不合规：任务卡提取失败，请换一种描述方式或稍后重试。']);
          setAgentRunState({
            runId,
            toolTrace: [
              { id: 'tool-framing', tool: 'research.framing', status: 'failed', summary: '输出不符合任务卡协议，未更新任务卡。' },
            ],
          });
          appendThoughtTrace(runId, ['未能解析出合法任务卡，请换一种描述方式或稍后重试。']);
        }
        setThinkingSteps((prev) => [...prev, '开始 Discovery：先抽取关键词，再执行检索。']);
        setAgentRunState({
          runId,
          agent: 'general',
          status: 'running',
          timeline: [
            {
              stage: 'queued',
              status: 'completed',
              message: '任务入队，等待执行研究规划步骤',
              timestamp: Date.now(),
            },
            {
              stage: 'searching',
              status: 'running',
              message: '正在检索论文/报告/博客/仓库（等待关键词计划）',
              timestamp: Date.now(),
            },
          ],
        });
        // Step 2: discovery execution (retrieve + dedup + score + cluster)
        const discoveryRaw = await chatCompletion(
          buildDiscoveryExecutionPrompt({ taskCard, userQuestion: text }),
          undefined,
          { agentName: resolveOahAgentName('general'), sessionScope: 'general', signal, finalOnly: true }
        );
        pushDbg(runId, 'raw_llm', 'discovery', 'Discovery 执行 模型原始输出', discoveryRaw);
        const discovery = parseDiscoveryExecutionResponse(discoveryRaw);
        const discoveryPreview = buildDiscoveryTracePreview(discoveryRaw);
        const retrievalKeywords = (discovery.keywordPlan?.keywords && discovery.keywordPlan.keywords.length > 0)
          ? discovery.keywordPlan.keywords
          : [];
        const retrievalQueries = (discovery.keywordPlan?.queries && discovery.keywordPlan.queries.length > 0)
          ? discovery.keywordPlan.queries
          : [];
        const keywordSource = retrievalKeywords.length ? 'discovery.keywordPlan' : 'fallback';
        const fallbackReason = retrievalKeywords.length
          ? ''
          : '兜底原因：discovery 未返回 keywordPlan.keywords（可能是 agent 未命中或输出不符合 JSON 协议）';
        setThinkingSteps((prev) => [
          ...prev,
          `关键词计划（${keywordSource}）：${retrievalKeywords.join(' / ') || '（未返回，使用兜底）'}`,
          `检索式：${retrievalQueries.join(' || ') || '（未返回）'}`,
        ]);
        setAgentRunState({
          runId,
          agent: 'general',
          status: 'running',
          toolTrace: [
            { id: 'tool-framing', tool: 'research.framing', status: 'completed', summary: '已生成任务卡字段' },
            {
              id: 'tool-keyword-plan',
              tool: 'discovery.keywordPlan',
              status: retrievalKeywords.length ? 'completed' : 'failed',
              summary: retrievalKeywords.length
                ? `关键词提取成功：${retrievalKeywords.join(' / ')}`
                : '关键词提取失败，已启用前端兜底关键词提取',
            },
            {
              id: 'tool-discovery-diagnosis',
              tool: 'discovery.output.diagnosis',
              status: discoveryPreview.hasJson ? 'completed' : 'failed',
              summary: `hasJson=${discoveryPreview.hasJson ? '是' : '否'}，hasKeywordPlan=${discoveryPreview.hasKeywordPlan ? '是' : '否'}，keywords=${discoveryPreview.keywordCount}，queries=${discoveryPreview.queryCount}，原因=${discoveryPreview.reason}`,
            },
            {
              id: 'tool-query-plan',
              tool: 'discovery.keywordPlan.queries',
              status: retrievalQueries.length ? 'completed' : 'failed',
              summary: retrievalQueries.length
                ? `检索式：${retrievalQueries.join(' || ')}`
                : '未返回可用检索式',
            },
          ],
          timeline: [
            {
              stage: 'queued',
              status: 'completed',
              message: '任务入队，等待执行研究规划步骤',
              timestamp: Date.now(),
            },
            {
              stage: 'searching',
              status: 'running',
              message: `正在检索论文/报告/博客/仓库（关键词：${retrievalKeywords.join(' / ') || '兜底关键词'}）${fallbackReason ? `；${fallbackReason}` : ''}`,
              timestamp: Date.now(),
            },
          ],
        });
        {
          const discoveryHumanLines: string[] = [
            retrievalKeywords.length
              ? `已确定检索关键词：${retrievalKeywords.slice(0, 12).join('、')}`
              : '未从模型输出中拿到关键词列表，已使用兜底关键词继续检索。',
            retrievalQueries.length
              ? `检索式示例：${retrievalQueries.slice(0, 5).join('；')}`
              : '未拿到结构化检索式，将主要按关键词检索。',
          ];
          if (fallbackReason) discoveryHumanLines.push('提示：关键词计划未完全命中协议，已自动启用兜底。');
          appendThoughtTrace(runId, discoveryHumanLines);
        }
        setThinkingSteps((prev) => [...prev, '正在生成长文研究规划思考（问题拆解、评估标准、变量与设计）…']);
        try {
          const narrativeRaw = await chatCompletion(
            buildDetailedPlanningThinkingPrompt({
              userQuestion: text,
              taskCard,
              keywords: retrievalKeywords,
              queries: retrievalQueries,
            }),
            undefined,
            { agentName: resolveOahAgentName('general'), sessionScope: 'general', signal, finalOnly: true }
          );
          planningThinkingNarrative = stripProtocolTags(narrativeRaw).trim();
          pushDbg(runId, 'raw_llm', 'planning_narrative', '详细规划思考（长文）模型原始输出', narrativeRaw);
          if (planningThinkingNarrative) {
            pushDbg(runId, 'user_thinking', 'planning_narrative', '对用户展示的长文思考（标签已剥离）', planningThinkingNarrative);
            setAgentRunState({
              runId,
              thinkingNarrative: planningThinkingNarrative,
            });
            upsertActiveThreadMessages(
              appended.map((m, idx) =>
                idx === appended.length - 1
                  ? {
                      ...m,
                      content: '',
                      thinkingNarrative: planningThinkingNarrative,
                      thinkingTrace: [],
                    }
                  : m
              )
            );
          }
        } catch {
          planningThinkingNarrative = '';
        }
        setThinkingSteps((prev) => [...prev, '长文思考已就绪，继续检索与综述…']);
        // Step 2.1: real retrieval from public sources (priority), fallback to discovery JSON output.
        const realDiscovery = await runRealDiscoveryRetrieval({
          userQuestion: text,
          taskCard: taskCard ?? undefined,
          seedKeywords: retrievalKeywords,
          perSource: 14,
          signal,
          onProgress: (partial) => {
            if (partial.candidatePool || partial.evidenceList || partial.topicClusters) {
              setDiscoveryOutput({
                candidatePool: partial.candidatePool,
                evidenceList: partial.evidenceList,
                topicClusters: partial.topicClusters,
              });
            }
            const runPatch: Partial<AgentRunState> = { runId };
            runPatch.agent = 'general';
            runPatch.status = 'running';
            if (partial.timeline) runPatch.timeline = partial.timeline;
            if (partial.toolTrace) runPatch.toolTrace = partial.toolTrace;
            setAgentRunState(runPatch);
          },
        });
        setRetrievalMeta({
          keywords: realDiscovery.keywordTokens ?? [],
          queries: realDiscovery.searchQueries ?? [],
        });
        const finalDiscovery = (realDiscovery.candidatePool.length >= 5)
          ? {
              candidatePool: realDiscovery.candidatePool,
              evidenceList: realDiscovery.evidenceList,
              topicClusters: realDiscovery.topicClusters,
              timeline: realDiscovery.timeline,
              toolTrace: realDiscovery.toolTrace,
              reasoningTrace: realDiscovery.reasoningTrace,
            }
          : discovery;
        setDiscoveryOutput({
          candidatePool: finalDiscovery.candidatePool,
          evidenceList: finalDiscovery.evidenceList,
          topicClusters: finalDiscovery.topicClusters,
        });
        setGeneralRightPanelCardsIfActive(['task', 'candidate', 'local_graph', 'related_work', 'graph']);
        const candidatePreview = finalDiscovery.candidatePool
          .slice(0, 8)
          .map((x, i) => `${i + 1}. ${x.title}（${x.type}｜可信度${x.credibility}｜${x.source}）`)
          .join('\n');
        const reviewRaw = await chatCompletion(
          buildLiteratureReviewPrompt({
            question: text,
            taskCard: taskCard ?? undefined,
            candidates: finalDiscovery.candidatePool,
            topicOnly: finalDiscovery.candidatePool.length === 0,
          }),
          undefined,
          { agentName: getLiteratureReviewAgentName(), sessionScope: 'literature_review', signal, finalOnly: true }
        );
        pushDbg(runId, 'raw_llm', 'literature_review', '文献综述模型原始输出', reviewRaw);
        const review = parseLiteratureReviewResponse(reviewRaw);
        pushDbg(
          runId,
          'meta',
          'literature_review',
          'parseLiteratureReviewResponse 后的结构化对象（节选）',
          JSON.stringify({ relatedWorkLen: review.relatedWork.length, gapsLen: review.gaps.length, summaryHead: review.summary?.slice(0, 400) }, null, 2)
        );
        setRelatedWorkOutput({
          items: review.relatedWork,
          gaps: review.gaps,
          summary: review.summary,
        });
        appendThoughtTrace(runId, [
          `文献对比已整理：${review.relatedWork.length} 条相关研究；研究空白 ${review.gaps.length} 条。`,
        ]);
        const summaryPrompt = [
          {
            role: 'system' as const,
            content:
              '你是通用研究助手。请基于 discovery 证据池，仅输出给用户的最终结果正文，不要输出任何内部推理、诊断、关键词计划、工具过程、JSON标签或说明性元文本。中文。',
          },
          {
            role: 'user' as const,
            content: `任务卡：${taskCard ? JSON.stringify(taskCard) : '无'}\n\n候选文献池：\n${candidatePreview || '无'}\n\n证据清单：\n${finalDiscovery.evidenceList.join('\n') || '无'}\n\n文献综述结构化输出：${JSON.stringify(review)}\n\n请给出最终建议回复。`,
          },
        ];
        setThinkingSteps((prev) => [...prev, 'Discovery 完成，正在生成最终结论（单次最终文本）。']);
        const discoveryTextRaw = await chatCompletion(
          summaryPrompt,
          undefined,
          { agentName: resolveOahAgentName('general'), sessionScope: 'general', signal, finalOnly: true }
        );
        pushDbg(runId, 'raw_llm', 'summary', '最终总结 模型原始输出', discoveryTextRaw);
        const discoveryText = sanitizeFinalAnswer(discoveryTextRaw);
        const currentTrace = useStore.getState().agentRunState.runId === runId
          ? (useStore.getState().agentRunState.thoughtTrace ?? [])
          : [];
        setAgentRunState({
          runId,
          agent: 'general',
          status: 'completed',
          endedAt: Date.now(),
          error: '',
          thinkingNarrative: planningThinkingNarrative.trim(),
          thoughtTrace: sanitizeThoughtLinesForUser(
            mergeUniqueTrace(currentTrace, [
              ...(discovery.reasoningTrace.length ? discovery.reasoningTrace : ['已完成候选文献检索、去重、评分与聚类。']),
              ...(realDiscovery.reasoningTrace.length ? realDiscovery.reasoningTrace : []),
              retrievalKeywords.length ? `本轮检索关键词：${retrievalKeywords.join('、')}` : '',
            ].filter(Boolean) as string[])
          ),
          timeline: finalDiscovery.timeline.length
            ? finalDiscovery.timeline
            : [
                { stage: 'queued', status: 'completed', message: '任务入队', timestamp: Date.now() },
                { stage: 'searching', status: 'completed', message: '检索完成', addedCount: discovery.candidatePool.length, timestamp: Date.now() },
                { stage: 'deduping', status: 'completed', message: '去重完成', timestamp: Date.now() },
                { stage: 'scoring', status: 'completed', message: '评分完成', timestamp: Date.now() },
                { stage: 'clustering', status: 'completed', message: '聚类完成', timestamp: Date.now() },
                { stage: 'summarized', status: 'completed', message: '总结完成', timestamp: Date.now() },
              ],
          toolTrace: [
            { id: 'tool-framing', tool: 'research.framing', status: 'completed', summary: '已生成任务卡字段' },
            ...(finalDiscovery.toolTrace.length
              ? finalDiscovery.toolTrace
              : [{
                  id: 'tool-discovery-exec',
                  tool: 'discovery',
                  status: 'completed' as const,
                  summary: `已形成候选文献池 ${finalDiscovery.candidatePool.length} 条，证据 ${finalDiscovery.evidenceList.length} 条，主题簇 ${finalDiscovery.topicClusters.length} 个`,
                }]),
            ...(finalDiscovery.candidatePool.slice(0, 5).map((x, i) => ({
              id: `cand-${i + 1}`,
              tool: `candidate:${x.type}`,
              status: 'completed' as const,
              summary: `${x.title} | ${x.source} | 可信度${x.credibility}`,
            }))),
          ],
        });
        {
          const trace = sanitizeThoughtLinesForUser(useStore.getState().agentRunState.thoughtTrace ?? []);
          pushDbg(
            runId,
            'user_thinking',
            'planning',
            '对用户展示的思考（净化后，与折叠块一致）',
            trace.length ? trace.map((t) => `• ${t}`).join('\n') : '（无）'
          );
          pushDbg(runId, 'final_answer', 'planning', '气泡最终正文（sanitizeFinalAnswer 后）', discoveryText);
          const curMessages =
            useStore.getState().chatThreads.find((t) => t.id === activeThreadId)?.messages ?? appended;
          upsertActiveThreadMessages(
            curMessages.map((m, idx) => {
              if (idx !== curMessages.length - 1 || m.role !== 'assistant') return m;
              const prevN = m.thinkingNarrative?.trim();
              const narrative =
                planningThinkingNarrative.trim() || prevN || undefined;
              return {
                ...m,
                content: discoveryText,
                thinkingNarrative: narrative,
                thinkingTrace: trace,
              };
            })
          );
        }
        if (activeAgent !== 'general') setActiveAgent('general');
        setThinkingSteps((prev) => [...prev, '研究规划链路已完成（任务卡 / 检索 / 综述 / 总结）。']);
        setLoading(false);
        return;
      } else if (!researchTaskCard.locked && !skipPlanningForReading && !skipPlanningForPersonalKb) {
        void (async () => {
          try {
            const framingRaw = await chatCompletion(
              buildFramingTaskPrompt({ userQuestion: text, history }),
              undefined,
              { agentName: 'framing', sessionScope: 'framing_task_card', signal, finalOnly: true }
            );
            pushModelDebug({
              threadId: activeThreadId,
              kind: 'raw_llm',
              phase: 'planning_bg',
              label: '后台研究规划步骤模型原始输出',
              content: framingRaw,
            });
            const framingVisibleOutput = extractFramingVisibleOutput(framingRaw);
            const taskCard = parseFramingTaskResponse(framingRaw);
            if (taskCard) {
              setResearchTaskCard({ ...taskCard, framingOutput: framingVisibleOutput, source: 'auto' });
            } else {
            }
          } catch {
            // keep main flow robust
          }
        })();
      }
      if (activeAgent === 'personal_kb') {
        const runId = `run-${Date.now()}`;
        setThinkingSteps([
          `本轮问题：${truncateStepText(text)}`,
          '个人知识库助手：正在结合你的收藏与本地资产组织回答…',
        ]);
        setThinkingExpanded(true);
        setAgentRunState({
          runId,
          agent: 'personal_kb',
          status: 'running',
          startedAt: Date.now(),
          endedAt: null,
          error: '',
          thoughtTrace: [],
        });
        const prompt = buildPersonalKbChatPrompt({ userQuestion: text, history });
        const finalText = await sendByDualLane(prompt, {
          agentName: resolveOahAgentName('personal_kb'),
          sessionScope: `personal_kb_${activeThreadId}`,
          signal,
          onAnswer: sanitizeAnswerLane,
          streamAnswerToBubble: true,
          debugPhase: 'personal_kb',
          debugRunId: runId,
          emitDebugFinalSnapshot: true,
        });
        pushDbg(runId, 'raw_llm', 'personal_kb', '个人知识库助手 模型原始输出', finalText);
        const cleaned = stripInferenceAndThinkingFromProse(dedupeRepeatedText(finalText).trim());
        const sections = parsePersonalKbStructuredSections(cleaned);
        const kbTrace = sanitizeThoughtLinesForUser([
          `本轮问题：${truncateStepText(text)}`,
          '已生成结构化答复（正文已净化，不含模型内部推理）。',
        ]);
        pushDbg(
          runId,
          'user_thinking',
          'personal_kb',
          '对用户展示的思考（摘要）',
          kbTrace.length ? kbTrace.map((t) => `• ${t}`).join('\n') : '（无）'
        );
        pushDbg(runId, 'final_answer', 'personal_kb', '气泡最终正文（净化后）', cleaned);
        updateLastAssistant((m) => ({ ...m, content: cleaned, thinkingTrace: [] }));
        setAgentRunState({
          runId,
          agent: 'personal_kb',
          status: 'completed',
          endedAt: Date.now(),
          error: '',
          thoughtTrace: kbTrace,
        });
        setPersonalKbWorkbench({
          threadId: activeThreadId,
          userQuery: text,
          assistantText: cleaned,
          sections,
          updatedAt: Date.now(),
        });
        setThinkingSteps((prev) => [...prev, '个人知识库助手已完成回复。']);
        setLoading(false);
        return;
      }
      if (!willRunPlanning) {
        setThinkingSteps([
          `本轮问题：${truncateStepText(text)}`,
          activeAgent === 'literature_review'
            ? '文献综述助手：分析需求并准备检索与整合…'
            : '研究助手：正在分析问题并规划执行路径…',
        ]);
        setThinkingExpanded(true);
      }
      /** 阅读会话是否已绑定文献/PDF/图谱论文（用于追问仍判 reading、且禁止误切到 general） */
      const hasReadingDocumentContext =
        readingSession.active ||
        (readingSession.sourceType !== null && readingSession.sourceValue.trim() !== '') ||
        Boolean(readingSession.previewUrl?.trim()) ||
        Boolean(readingSession.paperTitle?.trim());
      const readingDocumentActive = activeAgent === 'reading' && hasReadingDocumentContext;

      const route = await classifyUserIntent({
        text,
        currentAgent: activeAgent === 'literature_review' ? 'general' : activeAgent,
        readingDocumentActive,
        paperTitleHint: readingSession.paperTitle?.trim() || undefined,
        onRouteRaw: (raw) => {
          pushDbg(undefined, 'meta', 'intent_route', '意图路由（规则说明或 LLM 原始 JSON 行）', raw);
        },
      });
      setThinkingSteps((prev) => {
        const qLine =
          prev.find((line) => line.startsWith('本轮问题：')) ??
          `本轮问题：${truncateStepText(text)}`;
        if (activeAgent === 'literature_review') {
          return [
            qLine,
            `文献综述助手：已理解问题，正在匹配检索与综述结构（置信度 ${(route.confidence * 100).toFixed(0)}%）…`,
          ];
        }
        return [
          ...prev.filter((line) => !line.startsWith('正在解析意图')),
          `意图路由 → ${route.target}（置信度 ${(route.confidence * 100).toFixed(0)}%，${truncateStepText(route.reason, 100)}）`,
        ];
      });
      pushDbg(
        undefined,
        'meta',
        'intent_route',
        '解析后的路由结果',
        JSON.stringify({ target: route.target, confidence: route.confidence, reason: route.reason }, null, 2)
      );
      const userWantsReading = route.target === 'reading';
      const userWantsWriting = route.target === 'writing';
      const userWantsLitReview = isLiteratureReviewIntent(text);
      const userWantsDirect = /直接回答|直接说结论|先给答案|别提问/.test(text);
      const urlMatch = text.match(/https?:\/\/\S+/);
      const maybeUploadIntent = /上传|pdf|doi|arxiv/i.test(text);
      /** 主入口策略：在 general 会话中，始终先由 general 处理本轮问题（不自动切到其它助手）。 */
      const forceGeneralAsPrimary = activeAgent === 'general';

      /** 文献综述 Agent 优先：避免与阅读/链接路由抢助手 */
      if (!forceGeneralAsPrimary && userWantsLitReview) {
        setActiveAgent('literature_review');
        useStore.getState().setRightPanelCards([...LITERATURE_REVIEW_PANELS]);
      } else if (!forceGeneralAsPrimary && (urlMatch || maybeUploadIntent || userWantsReading)) {
        if (activeAgent !== 'reading') setActiveAgent('reading');
      } else if (!forceGeneralAsPrimary && userWantsWriting) {
        if (activeAgent !== 'writing') setActiveAgent('writing');
      } else if (!forceGeneralAsPrimary && route.target === 'general') {
        /** 阅读助手 + 已绑定文献（或处于阅读模式）时，路由判为 general 也不自动切走，避免追问误走自由研究 */
        const keepReading =
          activeAgent === 'reading' && (isReadingMode || hasReadingDocumentContext);
        if (!keepReading) {
          setActiveAgent('general');
        }
      }

      if (urlMatch) {
        startReadingByIntent(urlMatch[0]);
      } else if (activeAgent === 'reading' && (userWantsReading || maybeUploadIntent)) {
        startReadingByIntent('');
      }

      if (activeAgent === 'reading' && userWantsDirect && (isReadingMode || userWantsReading)) {
        switchReadingStyle('direct');
      } else if (activeAgent === 'reading' && (isReadingMode || userWantsReading || maybeUploadIntent || !!urlMatch || selectedPaper)) {
        switchReadingStyle('guided');
      }

      if (activeAgent === 'reading' && (isReadingMode || userWantsReading) && !readingSession.goal) {
        setReadingGoal('先澄清用户想理解的问题、方法还是实验，再逐步引导。');
      }

      const useReadingFlow =
        isReadingMode || userWantsReading || maybeUploadIntent || !!urlMatch;

      /** 阅读会话内（含 reading_setup）须保持走 reading 助手，避免意图被判为 general 时误走 Framing/通用链路 */
      const inReadingContext = isReadingMode || activeAgent === 'reading';
      const effectiveAgent = forceGeneralAsPrimary
        ? 'general'
        : userWantsLitReview
        ? 'literature_review'
        : (urlMatch || maybeUploadIntent || userWantsReading)
          ? 'reading'
          : userWantsWriting
            ? 'writing'
            : inReadingContext
              ? 'reading'
              : route.target;

      if (userWantsLitReview) {
        const runId = `run-${Date.now()}`;
        const localLit = useStore.getState().literatureReviewLocalCandidates;
        const fromLibrary = Boolean(localLit?.length);
        const reviewCandidates = fromLibrary ? localLit! : discoveryCandidatePool;
        const topicOnly = reviewCandidates.length === 0;
        setThinkingSteps((prev) => [
          ...prev,
          fromLibrary
            ? `调用文献综述助手（个人知识库 ${reviewCandidates.length} 篇）…`
            : '调用 literature_review 生成结构化 Related Work…',
        ]);
        setAgentRunState({
          runId,
          agent: 'literature_review',
          status: 'running',
          startedAt: Date.now(),
          endedAt: null,
          error: '',
          thoughtTrace: [],
        });
        appendThoughtTrace(runId, [
          fromLibrary
            ? `基于个人知识库 ${reviewCandidates.length} 篇本地 PDF，调用文献综述 Agent。`
            : '识别为文献综述类问题，正在整理 Related Work 与对比条目。',
        ]);
        let parsedLibraryDocuments: PersonalLibraryParsedDocumentForReview[] | undefined;
        if (fromLibrary) {
          setThinkingSteps((prev) => [...prev, `正在读取并解析 ${reviewCandidates.length} 篇 PDF（调用文献解析接口）…`]);
          parsedLibraryDocuments = await parsePersonalLibraryPdfsForLiteratureReview(
            reviewCandidates,
            (done, total, label) => {
              setThinkingSteps((prev) => {
                const head = prev.filter((line) => !line.startsWith('解析进度'));
                return [...head, `解析进度：${done + 1}/${total} ${label}`];
              });
            }
          );
        }
        const reviewRaw = await sendByDualLane(
          buildLiteratureReviewPrompt({
            question: text,
            taskCard: researchTaskCard,
            candidates: reviewCandidates,
            topicOnly,
            personalLibraryTitles: fromLibrary,
            parsedLibraryDocuments,
            structureOnly: true,
          }),
          {
            agentName: getLiteratureReviewAgentName(),
            sessionScope: `litrev_${runId.replace(/[^a-zA-Z0-9_-]/g, '_')}_struct`,
            signal,
            finalOnly: true,
            onAnswer: () => '',
            streamAnswerToBubble: false,
            debugPhase: 'literature_review',
            debugRunId: runId,
            emitDebugFinalSnapshot: true,
          }
        );
        setLiteratureReviewLocalCandidates(null);
        pushDbg(runId, 'raw_llm', 'literature_review', '文献综述 模型原始输出', reviewRaw);
        let review = parseLiteratureReviewResponse(reviewRaw);
        const hadSuccessfulParse = Boolean(
          fromLibrary &&
            parsedLibraryDocuments?.some(
              (d) =>
                !d.parseError &&
                ((d.excerptText?.trim() ?? '').length > 0 || (d.abstract?.trim() ?? '').length > 0)
            )
        );
        if (fromLibrary) {
          review = normalizePersonalLibraryLiteratureReview(review, reviewCandidates, {
            hadSuccessfulParse,
          });
        }
        setThinkingSteps((prev) => [...prev, '综述正文：按写作大纲分节生成（若章节较多将逐节请求）…']);

        const outlineFiltered = review.outline?.filter((x) => x.trim()) ?? [];
        const sectionTotal = Math.min(outlineFiltered.length, MAX_LITERATURE_OUTLINE_SECTIONS);

        setRelatedWorkOutput({
          items: review.relatedWork,
          gaps: review.gaps,
          summary: review.summary,
        });
        setLiteratureReviewPanelsAfterGeneration();

        const initialDraftStatus =
          sectionTotal > 0
            ? `（正在生成第 1/${sectionTotal} 节…）`
            : '（正在生成综述正文…）';
        useStore.getState().setLiteratureReviewDraft(
          composeLiteratureReviewDraft(review, '', initialDraftStatus)
        );

        const narrativeExpanded = await expandLiteratureReviewNarrative({
          review,
          question: text,
          taskCard: researchTaskCard,
          topicOnly,
          narrativeRunKey: runId,
          signal,
          onSectionProgress: (i, total, secTitle) => {
            setThinkingSteps((prev) => [
              ...prev.filter((line) => !line.startsWith('综述正文：')),
              `综述正文：第 ${i + 1}/${total} 节「${truncateStepText(secTitle, 48)}」…`,
            ]);
          },
          onSectionComplete: (acc, sectionIndex, totalSections) => {
            const remaining = totalSections - sectionIndex - 1;
            const status = remaining > 0 ? `（剩余 ${remaining} 节生成中…）` : undefined;
            useStore.getState().setLiteratureReviewDraft(composeLiteratureReviewDraft(review, acc, status));
          },
        });
        review = { ...review, fullNarrative: narrativeExpanded.trim() || review.fullNarrative };
        useStore.getState().setLiteratureReviewDraft(
          composeLiteratureReviewDraft(review, narrativeExpanded.trim(), undefined)
        );
        appendThoughtTrace(runId, [
          `已整理 ${review.relatedWork.length} 条相关研究对比；研究空白 ${review.gaps.length} 条。`,
        ]);
        setAgentRunState({
          runId,
          agent: 'literature_review',
          status: 'completed',
          endedAt: Date.now(),
          error: '',
          thoughtTrace: sanitizeThoughtLinesForUser(useStore.getState().agentRunState.thoughtTrace ?? []),
        });
        const finalText = sanitizeFinalAnswer(
          review.summary?.trim() ||
            review.fullNarrative?.trim()?.slice(0, 2800) ||
            '已生成文献综述（含大纲/正文时在侧栏「综述成稿」查看全文）。'
        );
        setThinkingSteps((prev) => [
          ...prev,
          `文献综述完成：${review.relatedWork.length} 条对比，${review.gaps.length} 条研究空白。`,
        ]);
        {
          const litTrace = sanitizeThoughtLinesForUser(useStore.getState().agentRunState.thoughtTrace ?? []);
          pushDbg(runId, 'user_thinking', 'literature_review', '对用户展示的思考（净化后）', litTrace.length ? litTrace.map((t) => `• ${t}`).join('\n') : '（无）');
          pushDbg(runId, 'final_answer', 'literature_review', '气泡最终正文（sanitizeFinalAnswer 后）', finalText);
          updateLastAssistant((m) => ({ ...m, content: finalText, thinkingTrace: [] }));
        }
      } else if (effectiveAgent === 'writing') {
        const runId = `run-${Date.now()}`;
        setThinkingSteps((prev) => [...prev, '调用 writing 助手生成写作回复…']);
        setAgentRunState({
          runId,
          agent: 'writing',
          status: 'running',
          startedAt: Date.now(),
          endedAt: null,
          error: '',
        });
        const prompt = buildWritingAssistantPrompt({
          task: writingTask,
          material: writingMaterial,
          userQuestion: text,
          history,
        });
        const finalText = await sendByDualLane(prompt, {
          agentName: resolveOahAgentName('writing'),
          sessionScope: 'writing',
          signal,
          finalOnly: true,
          onAnswer: sanitizeAnswerLane,
          streamAnswerToBubble: false,
          debugPhase: 'writing',
          debugRunId: runId,
          emitDebugFinalSnapshot: true,
        });
        pushDbg(runId, 'raw_llm', 'writing', '写作助手 模型原始输出', finalText);
        const structured = parseWritingAssistantResponse(finalText);
        pushDbg(
          runId,
          'meta',
          'writing',
          'parseWritingAssistantResponse 摘要',
          JSON.stringify({ hasOutline: !!structured.outline?.length, hasDraft: !!structured.draft, answerHead: (structured.answer || '').slice(0, 500) }, null, 2)
        );
        setWritingOutput({ outline: structured.outline, draft: structured.draft });
        setAgentRunState({
          runId,
          agent: 'writing',
          status: 'completed',
          endedAt: Date.now(),
          error: '',
        });
        const answerOut = normalizeVisibleAnswer(structured.answer || finalText);
        pushDbg(runId, 'final_answer', 'writing', '气泡最终正文（解析后的 answer 或原文）', answerOut);
        updateLastAssistant((m) => ({ ...m, content: answerOut }));
        setThinkingSteps((prev) => [...prev, 'writing 助手已完成回复。']);
      } else if (effectiveAgent === 'reading' && useReadingFlow) {
        const runId = `run-${Date.now()}`;
        const style =
          userWantsDirect || readingSession.style === 'direct' ? 'direct' : 'guided';
        const currentSource = selectedPaper
          ? `图谱论文：${selectedPaper.title}`
          : readingSession.sourceValue || '用户对话上下文';
        setThinkingSteps((prev) => [
          ...prev,
          `调用 reading 助手（${style === 'direct' ? '直答' : '引导'}），上下文：${truncateStepText(currentSource, 100)}`,
        ]);
        setAgentRunState({
          runId,
          agent: 'reading',
          status: 'running',
          startedAt: Date.now(),
          endedAt: null,
          error: '',
        });
        const prompt = buildReadingAssistantPrompt({
          sourceLabel: currentSource,
          paper: selectedPaper
            ? {
                title: selectedPaper.title,
                abstract: selectedPaper.abstract,
                keywords: selectedPaper.keywords,
                year: selectedPaper.year,
                journal: selectedPaper.journal,
              }
            : undefined,
          userQuestion: text,
          history,
          style,
          depth: readingSession.depth,
          goal: readingSession.goal,
          reasoningLevel,
        });

        const finalText = await sendByDualLane(prompt, {
          agentName: resolveOahAgentName('reading'),
          sessionScope: 'reading',
          signal,
          finalOnly: true,
          onAnswer: sanitizeAnswerLane,
          streamAnswerToBubble: false,
          debugPhase: 'reading',
          debugRunId: runId,
          emitDebugFinalSnapshot: true,
        });
        pushDbg(runId, 'raw_llm', 'reading', '阅读助手 模型原始输出', finalText);

        const structured = parseReadingAssistantResponse(finalText);
        pushDbg(
          runId,
          'meta',
          'reading',
          'parseReadingAssistantResponse 字段摘要',
          JSON.stringify(
            {
              answerLen: (structured.answer || '').length,
              reasoningLines: structured.reasoningTrace?.length ?? 0,
              evidenceCount: structured.evidenceRefs?.length ?? 0,
              toolSteps: structured.toolTrace?.length ?? 0,
            },
            null,
            2
          )
        );
        setReadingOutput({
          nextQuestion: structured.nextQuestion,
          answer: structured.answer,
          evidenceRefs: structured.evidenceRefs,
          toolTrace: structured.toolTrace,
          reasoningTrace: structured.reasoningTrace,
        });
        setAgentMode(style === 'direct' ? 'reading_direct' : 'reading_guided');
        setAgentRunState({
          runId,
          agent: 'reading',
          status: 'completed',
          endedAt: Date.now(),
          error: '',
          thoughtTrace:
            structured.reasoningTrace.length > 0
              ? sanitizeThoughtLinesForUser(structured.reasoningTrace)
              : [],
          toolTrace: structured.toolTrace.length > 0 ? structured.toolTrace : [],
        });
        {
          const readTrace =
            structured.reasoningTrace.length > 0
              ? sanitizeThoughtLinesForUser(structured.reasoningTrace)
              : [];
          const ans = structured.answer || finalText;
          pushDbg(
            runId,
            'user_thinking',
            'reading',
            '对用户展示的思考（reasoningTrace 净化后；若协议未返回则为空）',
            readTrace.length ? readTrace.map((t) => `• ${t}`).join('\n') : '（无独立 reasoning，或已过滤）'
          );
          pushDbg(runId, 'final_answer', 'reading', '气泡最终正文（结构化 answer）', ans);
          updateLastAssistant((m) => ({ ...m, content: ans, thinkingTrace: [] }));
        }
        setThinkingSteps((prev) => [...prev, 'reading 助手已完成回复。']);
      } else if (selectedPaper) {
        const runId = `run-${Date.now()}`;
        setThinkingSteps((prev) => [
          ...prev,
          `基于已选论文问答：${truncateStepText(selectedPaper.title, 100)}`,
        ]);
        setAgentRunState({
          runId,
          agent: 'reading',
          status: 'running',
          startedAt: Date.now(),
          endedAt: null,
          error: '',
        });
        const prompt = buildPaperChatPrompt(
          {
            title: selectedPaper.title,
            abstract: selectedPaper.abstract,
            keywords: selectedPaper.keywords,
            authors: selectedPaper.authors,
            year: selectedPaper.year,
            journal: selectedPaper.journal,
            institution: selectedPaper.institution,
          },
          text,
          history
        );

        const finalText = await sendByDualLane(prompt, {
          agentName: resolveOahAgentName('reading'),
          sessionScope: 'reading',
          signal,
          finalOnly: true,
          onAnswer: sanitizeAnswerLane,
          streamAnswerToBubble: false,
          debugPhase: 'paper_chat',
          debugRunId: runId,
          emitDebugFinalSnapshot: true,
        });
        pushDbg(runId, 'raw_llm', 'paper_chat', '基于论文问答 模型原始输出', finalText);
        {
          const paperTrace = sanitizeThoughtLinesForUser([
            `基于已选论文：${truncateStepText(selectedPaper.title, 100)}`,
            '已结合摘要与关键词生成回复。',
          ]);
          pushDbg(runId, 'user_thinking', 'paper_chat', '对用户展示的思考（摘要）', paperTrace.map((t) => `• ${t}`).join('\n'));
          const paperOut = normalizeVisibleAnswer(finalText);
          pushDbg(runId, 'final_answer', 'paper_chat', '气泡最终正文（净化后）', paperOut);
          updateLastAssistant((m) => ({ ...m, content: paperOut, thinkingTrace: [] }));
        }
        setAgentRunState({
          runId,
          agent: 'reading',
          status: 'completed',
          endedAt: Date.now(),
          error: '',
        });
        setThinkingSteps((prev) => [...prev, '基于论文上下文的回复已生成。']);
      } else {
        const runId = `run-${Date.now()}`;
        setStageLive([]);
        const visibleClusters = clusters
          .filter((c) => visibleClusterIds.has(c.id))
          .map((c) => `${c.name}(${c.count}篇)`)
          .join('、');
        setThinkingSteps((prev) => [
          ...prev,
          `调用 general 助手（可见聚类 ${visibleClusterIds.size} 个${searchQuery ? `，搜索「${truncateStepText(searchQuery, 40)}」` : ''}）`,
        ]);
        setAgentRunState({
          runId,
          agent: 'general',
          status: 'running',
          startedAt: Date.now(),
          endedAt: null,
          error: '',
          stageDetails: [],
        });
        setThinkingSteps((prev) => [...prev, 'Orchestrator：Plan -> Search -> Code -> Synthesize -> Critic']);
        const contextInfo = [
          `当前知识图谱显示 ${visibleClusterIds.size} 个聚类: ${visibleClusters}`,
          `年份范围: ${yearRange[0]}-${yearRange[1]}`,
          searchQuery ? `搜索关键词: "${searchQuery}"` : ''
        ].filter(Boolean).join('\n');
        const { synthesisText, criticRaw } = await executeGeneralOrchestrator(
          {
            chatCompletion,
            sendByDualLane,
            runRealDiscoveryRetrieval,
            resolveOahAgentName,
          },
          {
            text,
            signal,
            runId,
            contextInfo,
            sanitizeAnswerLane,
            onStep: (line) => setThinkingSteps((prev) => [...prev, line]),
            onStageUpdate: (stage, status, summary) => {
              setStageLive((prev) => {
                const idx = prev.findIndex((x) => x.stage === stage);
                if (idx >= 0) {
                  const next = [...prev];
                  next[idx] = { stage, status, summary };
                  return next;
                }
                return [...prev, { stage, status, summary }];
              });
            },
            onStageDetail: (stage, status, summary, detail, cycle) => {
              const current = useStore.getState().agentRunState.stageDetails ?? [];
              const nextRow = {
                id: `${runId}-${cycle}-${stage}-${status}-${current.length + 1}`,
                cycle,
                stage,
                status,
                summary,
                detail,
              };
              const next =
                status === 'running'
                  ? [
                      ...current.filter((x) => !(x.stage === stage && x.cycle === cycle && x.status === 'running')),
                      nextRow,
                    ]
                  : [
                      ...current.filter((x) => !(x.stage === stage && x.cycle === cycle && x.status === 'running')),
                      nextRow,
                    ];
              useStore.getState().setAgentRunState({ runId, stageDetails: next });
            },
            onRetrieval: (retrieved) => {
              setRetrievalMeta({
                keywords: retrieved.keywordTokens ?? [],
                queries: retrieved.searchQueries ?? [],
              });
              setDiscoveryOutput({
                candidatePool: retrieved.candidatePool,
                evidenceList: retrieved.evidenceList,
                topicClusters: retrieved.topicClusters,
              });
              setAgentRunState({
                runId,
                agent: 'general',
                status: 'running',
                toolTrace: retrieved.toolTrace,
                timeline: retrieved.timeline,
                thoughtTrace: sanitizeThoughtLinesForUser(retrieved.reasoningTrace),
              });
            },
          }
        );
        pushDbg(runId, 'raw_llm', 'general', '通用编排器（Synthesize）模型原始输出', synthesisText);
        pushDbg(runId, 'meta', 'general', 'Critic 原始输出', criticRaw);
        const generalThinkingTrace = sanitizeThoughtLinesForUser([
          `本轮问题：${truncateStepText(text)}`,
          `意图路由 → ${route.target}（置信度 ${(route.confidence * 100).toFixed(0)}%，${truncateStepText(route.reason, 100)}）`,
          '已按 Orchestrator 执行：Plan -> Search -> Code -> Synthesize -> Critic。',
          `结合当前图谱视图（可见聚类 ${visibleClusterIds.size} 个${searchQuery ? `，搜索「${truncateStepText(searchQuery, 40)}」` : ''}）生成回复。`,
        ]);
        const generalOut = normalizeVisibleAnswer(synthesisText);
        pushDbg(runId, 'final_answer', 'general', '气泡最终正文（净化后）', generalOut);
        updateLastAssistant((m) => ({ ...m, content: generalOut, thinkingTrace: generalThinkingTrace, thinkingNarrative: m.thinkingNarrative }));
        setWritingOutput({ draft: generalOut });
        {
          const nextCards = Array.from(new Set<RightPanelCard>(['graph', 'tools', 'draft' as RightPanelCard, ...useStore.getState().rightPanelCards]));
          useStore.getState().setRightPanelCards(nextCards);
          useStore.getState().focusRightPanelCard('draft' as RightPanelCard);
        }
        setAgentRunState({
          runId,
          agent: 'general',
          status: 'completed',
          endedAt: Date.now(),
          error: '',
          thoughtTrace: generalThinkingTrace,
        });
        setThinkingSteps((prev) => [...prev, 'general 助手已完成回复。']);
      }
    } catch (err) {
      const rawErrorMessage = err instanceof Error ? err.message : 'unknown error';
      const errorMessage = shortenOahErrorMessage(rawErrorMessage);
      pushModelDebug({
        threadId: activeThreadId,
        kind: 'meta',
        phase: 'error',
        label: 'handleSend 异常',
        content: rawErrorMessage,
      });
      if (/请求已终止|aborted|abort/i.test(errorMessage)) {
        setThinkingSteps((prev) => [...prev, '已终止当前生成。']);
        setAgentRunState({
          status: 'failed',
          endedAt: Date.now(),
          error: '已终止当前生成',
        });
        {
          const currentMessages =
            useStore.getState().chatThreads.find((t) => t.id === activeThreadId)?.messages ?? appended;
          upsertActiveThreadMessages(
            currentMessages.map((m, idx) =>
              idx === currentMessages.length - 1 && m.role === 'assistant'
                ? { ...m, content: '已终止当前生成。' }
                : m
            )
          );
        }
        return;
      }
      const httpMeta = extractHttpMeta(errorMessage);
      setThinkingSteps((prev) => [...prev, `请求失败：${truncateStepText(errorMessage, 120)}`]);
      setAgentRunState({
        status: 'failed',
        endedAt: Date.now(),
        error: errorMessage,
        lastHttpUrl: httpMeta.url ?? '',
        lastHttpStatus: httpMeta.status ?? null,
      });
      {
        const currentMessages =
          useStore.getState().chatThreads.find((t) => t.id === activeThreadId)?.messages ?? appended;
        upsertActiveThreadMessages(
          currentMessages.map((m, idx) =>
            idx === currentMessages.length - 1 && m.role === 'assistant'
              ? { ...m, content: `请求失败：${errorMessage}` }
              : m
          )
        );
      }
      console.error(err);
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
    }
  };

  useEffect(() => {
    const text = pendingAutoAsk.trim();
    if (!text || loading) return;
    setPendingAutoAsk('');
    void handleSend(text);
  }, [pendingAutoAsk, loading]);

  const handleStop = () => {
    abortControllerRef.current?.abort();
  };

  const handleUploadFiles = (files?: FileList | null) => {
    if (!files || files.length === 0 || loading) return;
    const picked = Array.from(files);
    const names = picked.map((f) => f.name).filter(Boolean);
    const prompt =
      names.length === 1
        ? `我想读这个文件：${names[0]}。请先告诉我你建议的处理路径；如果需要我补充 URL、正文片段或粘贴内容，请直接告诉我下一步怎么做。`
        : `我想读这些文件：${names.join('、')}。请先给我一个最省成本的阅读与整理步骤，并告诉我你需要我补充哪些信息。`;
    setInput(prompt);
    void handleSend(prompt);
  };

  const copyAssistantText = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      // ignore
    }
  };

  const forwardAssistantText = async (t: string) => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'AI 对话', text: t });
      } else {
        await navigator.clipboard.writeText(t);
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0 rounded-xl border border-violet-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-violet-100 shrink-0 bg-violet-50/50">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-violet-950">AI 助手</span>
          <span className="text-[10px] text-violet-500">当前执行模式</span>
          <span className="text-[10px] text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full truncate">
            {isReadingMode
              ? readingSession.style === 'guided'
                ? '阅读引导模式'
                : '阅读直答模式'
              : activeAgent === 'literature_review'
                ? '文献综述模式'
                : activeAgent === 'personal_kb'
                  ? '个人知识库助手'
                  : activeAgent === 'writing'
                    ? '写作助手模式'
                    : selectedPaper
                      ? `基于: ${selectedPaper.title.slice(0, 15)}...`
                      : '通用模式'}
        </span>
        </div>
        <button
          type="button"
          onClick={() => setDebugPanelOpen((v) => !v)}
          className={`shrink-0 text-[11px] px-2.5 py-1 rounded-md border transition-colors ${
            debugPanelOpen
              ? 'border-amber-400 bg-amber-50 text-amber-900'
              : 'border-violet-200 bg-white text-violet-800 hover:bg-violet-50'
          }`}
        >
          {debugPanelOpen ? '关闭调试台' : '调试台'}
        </button>
      </div>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5 min-h-0">
        {stageLive.length > 0 && (
          <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
            <div className="text-[11px] text-violet-700 mb-1">执行流程</div>
            <div className="space-y-1">
              {(['Plan', 'Search', 'Code', 'Synthesize', 'Critic'] as const).map((s) => {
                const row = stageLive.find((x) => x.stage === s);
                const icon = !row ? '○' : row.status === 'completed' ? '✓' : '…';
                return (
                  <div key={s} className="flex items-center gap-2 text-[12px] text-violet-800">
                    <span className="w-4 inline-block">{icon}</span>
                    <button
                      type="button"
                      className="contents"
                      onClick={() => {
                        const st = useStore.getState();
                        const nextCards = Array.from(new Set<RightPanelCard>(['graph', 'tools', 'draft' as RightPanelCard, ...st.rightPanelCards]));
                        st.setRightPanelCards(nextCards);
                        focusRightPanelStage(s);
                        st.focusRightPanelCard('tools');
                      }}
                    >
                      <span className="w-[76px] shrink-0 font-medium text-left">{s}</span>
                      <span className="truncate text-violet-700 text-left">{row?.summary || '等待执行'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {messages.length === 0 && (
          <div className="text-xs text-violet-600 text-center mt-8">
            {activeAgent === 'personal_kb'
              ? '个人知识库助手：用自然语言做分类、总结、推荐与知识脉络梳理；右侧可查看资产总览与本次任务结果。'
              : selectedPaper
                ? `已选中「${selectedPaper.title.slice(0, 20)}...」，可以提问`
                : '可说「带我阅读某篇论文」进入阅读助手；「帮我写一篇文献综述」将调用文献综述 Agent；或在个人知识库勾选多篇 PDF 后点「文献综述」。'}
          </div>
        )}
        {messages.map((msg: ChatMessageType, idx: number) => {
          const isAssistantWithBody = msg.role === 'assistant' && msg.content.trim().length > 0;
          const canRegenHere =
            isAssistantWithBody && idx === lastAssistantWithContentIndex && !loading;
          const rowDisabled = loading && idx === messages.length - 1 && msg.role === 'assistant';
          return (
            <ChatMessage
              key={msg.id}
              message={msg}
              onOpenDetails={() => {
                const nextCards = Array.from(new Set<RightPanelCard>(['graph', 'tools', 'draft' as RightPanelCard, ...rightPanelCards]));
                setRightPanelCards(nextCards);
                focusRightPanelCard('tools');
              }}
              assistantActions={
                isAssistantWithBody
                  ? {
                      onCopy: () => void copyAssistantText(msg.content),
                      onForward: () => void forwardAssistantText(msg.content),
                      onFavorite: () => {
                        addMessageFavorite({
                          threadId: activeThreadId,
                          messageId: msg.id,
                          content: msg.content,
                        });
                      },
                      onRegenerate: canRegenHere
                        ? () => void handleSend(undefined, { regenerateLastAssistant: true })
                        : undefined,
                      showRegenerate: canRegenHere,
                      disabled: rowDisabled,
                    }
                  : undefined
              }
            />
          );
        })}
        {loading && messages[messages.length - 1]?.content === '' && (
          <div className="rounded-lg border border-violet-200 bg-violet-50/90 px-3 py-2 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[12px] text-violet-900">执行中 {thinkingSeconds}s</div>
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" className="text-[11px] px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 hover:bg-red-100" onClick={handleStop}>
                  终止
                </button>
                <button type="button" className="text-[11px] text-violet-700 hover:text-violet-950" onClick={() => setThinkingExpanded((v) => !v)}>
                  {thinkingExpanded ? '收起' : '展开'}
                </button>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px]">
              {stageOrder.map((s, i) => (
                <div key={s} className="flex items-center gap-1.5">
                  <span className={`px-2 py-0.5 rounded-full border ${i <= currentStageIndex ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-violet-500 border-violet-200'}`}>
                    {s}
                  </span>
                  {i < stageOrder.length - 1 && <span className="text-violet-300">→</span>}
                </div>
              ))}
            </div>
            <div className="mt-2">
              <button
                type="button"
                className="text-[10px] px-2 py-0.5 rounded border border-violet-300 bg-white text-violet-700 hover:bg-violet-100"
                onClick={() => {
                  const st = useStore.getState();
                  const nextCards = Array.from(new Set<RightPanelCard>(['graph', 'tools', 'draft' as RightPanelCard, ...st.rightPanelCards]));
                  st.setRightPanelCards(nextCards);
                  st.focusRightPanelCard('tools');
                }}
              >
                在右侧查看详细过程
              </button>
            </div>
            {thinkingExpanded && (
              <ul className="list-disc pl-8 pr-3 pt-2 space-y-1.5 text-[12px] text-violet-700 leading-relaxed">
                {(thinkingSteps.length ? thinkingSteps : [lastUserBubble.trim() ? `处理中：${truncateStepText(lastUserBubble)}` : '处理中…']).map((x, i) => (
                  <li key={`${i}-${x.slice(0, 24)}`}>{sanitizeThinkingStepLine(x)}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {debugPanelOpen && (
        <ModelDebugPanel
          threadId={activeThreadId}
          entries={modelDebugEntries}
          onClear={clearModelDebug}
        />
      )}
      </div>

      {(discoveryCandidatePool.length > 0 || retrievalToolNames.length > 0 || retrievalMeta?.keywords.length) && (
        <div className="mx-3 mb-2 rounded-lg border border-violet-200 bg-violet-50/70 px-3 py-2 text-[11px] text-violet-800 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate">
              检索工具：{retrievalToolNames.length ? retrievalToolNames.join(' / ') : 'discovery.retrieval'}
            </div>
            <div className="truncate text-violet-700">
              检索式：{retrievalMeta?.queries?.length ? retrievalMeta.queries.slice(0, 3).join(' / ') : '（暂无）'}
            </div>
            <div className="truncate text-violet-600">
              关键词：{retrievalMeta?.keywords?.length ? retrievalMeta.keywords.join(' / ') : '（暂无）'}
            </div>
            <div className="truncate text-violet-600">
              命中候选：{discoveryCandidatePool.length} 条
            </div>
            <div className="flex items-center gap-2 mt-1 text-[10px]">
              <a
                className="underline text-violet-700 hover:text-violet-900"
                href={`https://scholar.google.com/scholar?q=${encodeURIComponent(
                  retrievalMeta?.queries?.[0] || retrievalMeta?.keywords?.join(' ') || ''
                )}`}
                target="_blank"
                rel="noreferrer"
              >
                在 Scholar 复现搜索
              </a>
              <a
                className="underline text-violet-700 hover:text-violet-900"
                href={`https://www.google.com/search?q=${encodeURIComponent(
                  retrievalMeta?.queries?.[0] || retrievalMeta?.keywords?.join(' ') || ''
                )}`}
                target="_blank"
                rel="noreferrer"
              >
                在 Web 复现搜索
              </a>
            </div>
          </div>
          <button
            type="button"
            className="shrink-0 px-2 py-1 rounded border border-violet-200 bg-white text-violet-800 hover:bg-violet-100"
            onClick={() => {
              const st = useStore.getState();
              const nextCards = Array.from(new Set<RightPanelCard>(['graph', 'candidate', 'related_work', ...st.rightPanelCards]));
              st.setRightPanelCards(nextCards);
              st.focusRightPanelCard('candidate');
            }}
          >
            查看检索界面
          </button>
        </div>
      )}

      <div className="flex gap-2 p-3 pt-2 shrink-0 border-t border-violet-100 bg-white/80">
        <input
          ref={uploadInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            handleUploadFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => uploadInputRef.current?.click()}
          disabled={loading}
          title="上传文件"
          className="shrink-0 bg-white border border-violet-200 hover:bg-violet-50 px-2.5 py-2 rounded-lg text-violet-700 transition-colors disabled:opacity-50"
        >
          🔗
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={loading ? '等待回复...' : '输入你的问题...'}
          disabled={loading}
          className="flex-1 bg-violet-50/80 border border-violet-200 rounded-lg px-3 py-2 text-sm text-violet-950 placeholder-violet-400 outline-none disabled:opacity-50"
        />
        <button
          onClick={() => { void handleSend(); }}
          disabled={loading}
          className="bg-violet-600 hover:bg-violet-700 px-4 py-2 rounded-lg text-sm text-white transition-colors disabled:opacity-50"
        >
          发送
        </button>
      </div>
    </div>
  );
}
