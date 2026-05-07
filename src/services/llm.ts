import type {
  EvidenceRef,
  ToolTraceItem,
  ReadingDepth,
  ParsedPaperMeta,
  PersonalLibraryParsedDocumentForReview,
} from '../types';
import { extractPdfTextInBrowser } from '../utils/extractPdfTextBrowser';
import { stripInferenceAndThinkingFromProse } from '../utils/thinkingDisplay';

const OAH_API_BASE = import.meta.env.VITE_OAH_API_BASE ?? '/oah/api/v1';
const OAH_WORKSPACE_ID = import.meta.env.VITE_OAH_WORKSPACE_ID ?? '';
const OAH_AGENT_NAME = import.meta.env.VITE_OAH_AGENT_NAME ?? '';
const OAH_AGENT_FRAMING = import.meta.env.VITE_OAH_AGENT_FRAMING ?? 'framing';
const OAH_AGENT_DISCOVERY = import.meta.env.VITE_OAH_AGENT_DISCOVERY ?? 'discovery';
const OAH_AGENT_READING = import.meta.env.VITE_OAH_AGENT_READING ?? 'reading';
const OAH_AGENT_WRITING = import.meta.env.VITE_OAH_AGENT_WRITING ?? 'writing';
const OAH_AGENT_LITERATURE_REVIEW = import.meta.env.VITE_OAH_AGENT_LITERATURE_REVIEW ?? 'literature_review';
const OAH_SESSION_MAP_KEY = 'research_map2_oah_session_map_v1';
const OAH_DOC_PARSE_API = import.meta.env.VITE_OAH_DOC_PARSE_API ?? `${OAH_API_BASE}/documents/parse`;
/** 为 true 或把 VITE_OAH_DOC_PARSE_API 设为 off 时，上传 PDF 不走远程接口，仅用浏览器 PDF.js */
const OAH_DOC_PARSE_DISABLED =
  String(import.meta.env.VITE_OAH_DOC_PARSE_DISABLED ?? '').toLowerCase() === 'true' ||
  String(import.meta.env.VITE_OAH_DOC_PARSE_API ?? '').toLowerCase() === 'off';
const OAH_TEMPLATE_MODE = (import.meta.env.VITE_OAH_TEMPLATE_MODE ?? 'true').toLowerCase() !== 'false';
const ENABLE_REAL_DISCOVERY = (import.meta.env.VITE_REAL_DISCOVERY_SEARCH ?? 'true').toLowerCase() !== 'false';
const SEMANTIC_SCHOLAR_API_KEY = import.meta.env.VITE_SEMANTIC_SCHOLAR_API_KEY ?? '';
const GOOGLE_CSE_API_KEY = import.meta.env.VITE_GOOGLE_CSE_API_KEY ?? '';
const GOOGLE_CSE_CX = import.meta.env.VITE_GOOGLE_CSE_CX ?? '';

async function checkedFetch(
  url: string,
  init?: RequestInit,
  tag?: string
): Promise<Response> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) {
      let detail = '';
      try {
        const data = (await res.clone().json()) as { error?: { code?: string; message?: string } };
        if (data?.error?.code || data?.error?.message) {
          detail = ` code=${data.error?.code ?? ''} message=${data.error?.message ?? ''}`.trim();
        }
      } catch {
        // ignore non-json body
      }
      throw new Error(
        `${tag || 'HTTP'} 请求失败(${res.status}) url=${url}${detail ? ` ${detail}` : ''}`
      );
    }
    return res;
  } catch (err) {
    if (err instanceof Error) {
      if (/请求失败\(\d+\)/.test(err.message)) throw err;
      throw new Error(`${tag || 'HTTP'} 连接失败 url=${url} message=${err.message}`);
    }
    throw new Error(`${tag || 'HTTP'} 连接失败 url=${url}`);
  }
}

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type ChatStreamLane = 'thinking' | 'answer' | 'meta';
export interface ChatStreamEvent {
  lane: ChatStreamLane;
  content: string;
  rawEventName?: string;
}

function extractTextFromUnknown(input: unknown): string {
  if (typeof input === 'string') return input;
  if (Array.isArray(input)) {
    return input.map((x) => extractTextFromUnknown(x)).join('');
  }
  if (!input || typeof input !== 'object') return '';
  const obj = input as Record<string, unknown>;
  const directKeys = ['text', 'content', 'message', 'output_text', 'final_text', 'answer'];
  for (const key of directKeys) {
    const v = obj[key];
    const t = extractTextFromUnknown(v);
    if (t.trim()) return t;
  }
  // OpenAI-style content parts: [{ type: 'output_text', text: '...' }]
  if (Array.isArray(obj.parts)) {
    const t = (obj.parts as unknown[]).map((p) => extractTextFromUnknown(p)).join('');
    if (t.trim()) return t;
  }
  if (Array.isArray(obj.content)) {
    const t = (obj.content as unknown[]).map((p) => extractTextFromUnknown(p)).join('');
    if (t.trim()) return t;
  }
  return '';
}

type Workspace = {
  id: string;
  name?: string;
  kind?: 'project' | 'chat';
};

type Session = {
  id: string;
};

type MessageAccepted = {
  runId: string;
};

export interface ReadingAssistantResponse {
  answer: string;
  nextQuestion: string;
  evidenceRefs: EvidenceRef[];
  toolTrace: ToolTraceItem[];
  reasoningTrace: string[];
}

export interface WritingAssistantResponse extends ReadingAssistantResponse {
  outline: string[];
  draft: string;
}

export interface DiscoveryCandidateItem {
  title: string;
  type: 'paper' | 'report' | 'blog' | 'repo' | 'other';
  source: string;
  credibility: number;
  reason: string;
  url?: string;
}

export type DiscoveryStage = 'queued' | 'searching' | 'deduping' | 'scoring' | 'clustering' | 'summarized';

export interface DiscoveryTimelineItem {
  stage: DiscoveryStage;
  status: 'running' | 'completed' | 'failed';
  message: string;
  addedCount?: number;
  dedupedCount?: number;
  dropReasons?: string[];
  currentTitle?: string;
  currentUrl?: string;
  timestamp?: number;
}

export interface DiscoveryExecutionResponse {
  keywordPlan?: {
    keywords: string[];
    queries?: string[];
  };
  candidatePool: DiscoveryCandidateItem[];
  evidenceList: string[];
  topicClusters: string[];
  toolTrace: ToolTraceItem[];
  reasoningTrace: string[];
  timeline: DiscoveryTimelineItem[];
}

export interface DiscoveryTracePreview {
  displayText: string;
  hasJson: boolean;
  hasKeywordPlan: boolean;
  keywordCount: number;
  queryCount: number;
  reason: string;
}

export interface LiteratureReviewResult {
  relatedWork: Array<{
    title: string;
    method: string;
    data: string;
    metric: string;
    limitation: string;
    source?: string;
    url?: string;
  }>;
  gaps: string[];
  /** 对话气泡与侧栏用的短结论（建议 200～600 字） */
  summary: string;
  /** 综述写作大纲（多级章节标题句，便于后续逐章扩写） */
  outline?: string[];
  /**
   * 基于解析正文整合的综述长文（可分多段）；与 summary 二选一展示时优先 fullNarrative
   */
  fullNarrative?: string;
}

export interface RealDiscoveryResult {
  candidatePool: DiscoveryCandidateItem[];
  evidenceList: string[];
  topicClusters: string[];
  timeline: DiscoveryTimelineItem[];
  toolTrace: ToolTraceItem[];
  reasoningTrace: string[];
  /** 本轮检索实际使用的关键词 */
  keywordTokens?: string[];
  /** 便于用户在网页复现的检索式 */
  searchQueries?: string[];
}

export interface IntentRouteResult {
  target: 'reading' | 'writing' | 'general';
  confidence: number;
  reason: string;
}

export interface FramingTaskCardResult {
  problemStatement: string;
  rqList: string[];
  scopeInclude: string[];
  scopeExclude: string[];
  constraints: string[];
  successCriteria: string[];
}

export interface FramingTracePreview {
  displayText: string;
  taggedBlockCount: number;
  validTaggedBlockCount: number;
  usedTagged: boolean;
}

export interface ParsedDocumentResult {
  title?: string;
  previewUrl: string;
  evidenceRefs: EvidenceRef[];
  meta: ParsedPaperMeta;
}

export async function chatCompletion(
  messages: Message[],
  onChunk?: (text: string) => void,
  options?: {
    agentName?: string;
    sessionScope?: string;
    signal?: AbortSignal;
    finalOnly?: boolean;
    onEvent?: (ev: ChatStreamEvent) => void;
  }
): Promise<string> {
  const sessionId = await ensureSessionId(normalizeSessionOptions(options));
  const content = toSingleUserMessage(messages);

  try {
    const createRes = await checkedFetch(
      `${OAH_API_BASE}/sessions/${encodeURIComponent(sessionId)}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
        signal: options?.signal,
      },
      'OAH create message'
    );
    const accepted = (await createRes.json()) as MessageAccepted;
    return streamRunResult(
      sessionId,
      accepted.runId,
      onChunk,
      options?.signal,
      options?.finalOnly === true,
      options?.onEvent
    );
  } catch (err) {
    if (err instanceof Error) {
      // Some OAH backends can return 500 after run has been queued (partial success).
      // If runId can be recovered from error message, continue streaming that run.
      const recoveredRunId = extractRunIdFromError(err.message);
      const recoveredSessionId = extractSessionIdFromError(err.message) ?? sessionId;
      if (recoveredRunId) {
        return streamRunResult(
          recoveredSessionId,
          recoveredRunId,
          onChunk,
          options?.signal,
          options?.finalOnly === true,
          options?.onEvent
        );
      }
    }
    throw err;
  }
}

function normalizeSessionOptions(options?: { agentName?: string; sessionScope?: string }): { agentName?: string; sessionScope?: string } {
  if (!OAH_TEMPLATE_MODE) return options ?? {};
  // In template mode, still prefer explicit agent routing when provided.
  // If backend does not have that agent, ensureSessionId will fallback safely.
  if (options?.sessionScope === 'framing_task_card') {
    return { agentName: options?.agentName, sessionScope: 'template-framing-task' };
  }
  // Keep per-flow scope isolation to avoid cross-agent context bleed.
  return {
    agentName: options?.agentName,
    sessionScope: options?.sessionScope ? `template-${options.sessionScope}` : 'template-default',
  };
}

function extractRunIdFromError(message: string): string | null {
  const m = message.match(/\b(run_[a-zA-Z0-9]+)\b/);
  return m ? m[1] : null;
}

function extractSessionIdFromError(message: string): string | null {
  const m = message.match(/\b(ses_[a-zA-Z0-9]+)\b/);
  return m ? m[1] : null;
}

function toSingleUserMessage(messages: Message[]): string {
  return messages
    .map((m) => `${m.role.toUpperCase()}:\n${m.content}`)
    .join('\n\n');
}

async function ensureSessionId(options?: { agentName?: string; sessionScope?: string }): Promise<string> {
  const scope = options?.sessionScope || options?.agentName || 'default';
  const map = readSessionMap();
  const cached = map[scope];
  if (cached) {
    const ok = await validateSession(cached);
    if (ok) return cached;
  }

  const body: { title: string; agentName?: string } = {
    title: 'research_map2 对话',
  };
  if (options?.agentName) body.agentName = options.agentName;
  else if (!OAH_TEMPLATE_MODE && OAH_AGENT_NAME) body.agentName = OAH_AGENT_NAME;

  const createSession = async (workspaceId: string): Promise<Session> => {
    const request = async (payload: { title: string; agentName?: string }) =>
      checkedFetch(
        `${OAH_API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/sessions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        'OAH create session'
      );
    try {
      const res = await request(body);
      return (await res.json()) as Session;
    } catch (err) {
      // If named agent not available in workspace, fallback to workspace default agent.
      if (
        body.agentName &&
        err instanceof Error &&
        err.message.includes('agent_not_found')
      ) {
        const res = await request({ title: body.title });
        return (await res.json()) as Session;
      }
      throw err;
    }
  };

  try {
    const workspaceId = await resolveWorkspaceId();
    const session = await createSession(workspaceId);
    map[scope] = session.id;
    writeSessionMap(map);
    return session.id;
  } catch (err) {
    // If workspace creation hits 404, try auto-discovery candidates one by one.
    if (err instanceof Error && err.message.includes('请求失败(404)')) {
      const candidates = await listWorkspaceCandidates();
      let lastError: Error = err;
      for (const workspaceId of candidates) {
        try {
          const session = await createSession(workspaceId);
          map[scope] = session.id;
          writeSessionMap(map);
          return session.id;
        } catch (retryErr) {
          if (retryErr instanceof Error) lastError = retryErr;
        }
      }
      throw new Error(
        `OAH create session 多工作区重试失败 candidates=${candidates.join(',')} last=${lastError.message}`
      );
    }
    throw err;
  }
}

function readSessionMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(OAH_SESSION_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSessionMap(map: Record<string, string>): void {
  try {
    localStorage.setItem(OAH_SESSION_MAP_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

async function validateSession(sessionId: string): Promise<boolean> {
  try {
    const res = await fetch(`${OAH_API_BASE}/sessions/${encodeURIComponent(sessionId)}`);
    return res.ok;
  } catch {
    return false;
  }
}

async function resolveWorkspaceId(forceDiscover = false): Promise<string> {
  if (OAH_WORKSPACE_ID && !forceDiscover) return OAH_WORKSPACE_ID;
  const items = await listWorkspaces();
  if (!items.length) {
    throw new Error('OAH workspace list is empty');
  }
  const byName = items.find((w) => (w.name ?? '').toLowerCase().includes('research_map2'));
  if (byName) return byName.id;
  const firstProject = items.find((w) => w.kind === 'project');
  return (firstProject ?? items[0]).id;
}

async function listWorkspaces(): Promise<Workspace[]> {
  const res = await checkedFetch(`${OAH_API_BASE}/workspaces?pageSize=200`, undefined, 'OAH list workspaces');
  const data = (await res.json()) as { items?: Workspace[] };
  return data.items ?? [];
}

async function listWorkspaceCandidates(): Promise<string[]> {
  const items = await listWorkspaces();
  const candidates: string[] = [];
  const byName = items.filter((w) => (w.name ?? '').toLowerCase().includes('research_map2'));
  for (const w of byName) candidates.push(w.id);
  for (const w of items.filter((x) => x.kind === 'project')) {
    if (!candidates.includes(w.id)) candidates.push(w.id);
  }
  for (const w of items) {
    if (!candidates.includes(w.id)) candidates.push(w.id);
  }
  return candidates;
}

function splitAnswerAndThinkingFromContentParts(
  value: unknown
): { answer: string; thinking: string } {
  if (!Array.isArray(value)) return { answer: '', thinking: '' };
  const answerParts: string[] = [];
  const thinkingParts: string[] = [];
  for (const part of value) {
    if (!part || typeof part !== 'object' || Array.isArray(part)) continue;
    const obj = part as Record<string, unknown>;
    const text = typeof obj.text === 'string' ? obj.text : '';
    if (!text.trim()) continue;
    const t = String(obj.type ?? '').toLowerCase();
    if (t.includes('reason') || t.includes('think')) thinkingParts.push(text);
    else answerParts.push(text);
  }
  return { answer: answerParts.join('\n\n').trim(), thinking: thinkingParts.join('\n\n').trim() };
}

function extractAnswerFromCompletedPayload(payload: Record<string, unknown>): string {
  const fromParts = splitAnswerAndThinkingFromContentParts(payload.content).answer;
  if (fromParts) return fromParts;
  const fromText =
    extractTextFromUnknown(payload.text) ||
    extractTextFromUnknown(payload.delta) ||
    extractTextFromUnknown(payload.message);
  if (fromText.trim()) return fromText;
  return '';
}

async function streamRunResult(
  sessionId: string,
  runId: string,
  onChunk?: (text: string) => void,
  signal?: AbortSignal,
  finalOnly = false,
  onEvent?: (ev: ChatStreamEvent) => void
): Promise<string> {
  if (signal?.aborted) {
    throw new Error('请求已终止');
  }
  const res = await checkedFetch(
    `${OAH_API_BASE}/sessions/${encodeURIComponent(sessionId)}/events?runId=${encodeURIComponent(runId)}`
    , { signal },
    'OAH stream events'
  );
  if (!res.body) {
    throw new Error('OAH stream events body is empty');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let streamError = '';
  let gotTerminalEvent = false;
  let completedMessageText = '';
  let thinkingFull = '';
  let answerFull = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';

    for (const chunk of chunks) {
      const lines = chunk.split('\n');
      let eventName = '';
      let dataStr = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) eventName = line.slice(7).trim();
        if (line.startsWith('data: ')) dataStr += line.slice(6);
      }

      if (!dataStr) continue;
      try {
        const payload = JSON.parse(dataStr) as Record<string, unknown>;
        const splitParts = splitAnswerAndThinkingFromContentParts(payload.content);
        const chunkText =
          splitParts.answer ||
          extractTextFromUnknown(payload.delta) ||
          extractTextFromUnknown(payload.text) ||
          extractTextFromUnknown(payload.message) ||
          extractTextFromUnknown(payload);
        const thinkingChunkText =
          splitParts.thinking ||
          extractTextFromUnknown(payload.reasoning);
        const laneRaw = String((payload.type ?? payload.channel ?? payload.stream ?? '') || '').toLowerCase();
        const laneFromType: ChatStreamLane | '' =
          laneRaw.includes('think')
            ? 'thinking'
            : laneRaw.includes('answer') || laneRaw.includes('final')
              ? 'answer'
              : '';
        const laneFromEvent: ChatStreamLane | '' =
          eventName.includes('think')
            ? 'thinking'
            : eventName === 'message.delta' || eventName === 'message.completed' || eventName === 'message.answer.delta'
              ? 'answer'
              : '';
        const lane: ChatStreamLane = laneFromType || laneFromEvent || 'meta';
        if (eventName === 'message.completed') {
          const completedAnswer = extractAnswerFromCompletedPayload(payload);
          if (completedAnswer.trim()) {
            completedMessageText = completedAnswer;
            answerFull = dedupeRepeatedText(mergeStreamingText(answerFull, completedAnswer));
            onEvent?.({ lane: 'answer', content: answerFull, rawEventName: eventName });
          }
        }
        if ((eventName === 'message.delta' || eventName === 'message.completed') && chunkText) {
          // For final-only mode, only trust message.completed as final output.
          if (eventName === 'message.completed') {
            completedMessageText = chunkText.trim() ? chunkText : completedMessageText;
          }
          if (lane === 'thinking') {
            thinkingFull = dedupeRepeatedText(mergeStreamingText(thinkingFull, chunkText));
            onEvent?.({ lane: 'thinking', content: thinkingFull, rawEventName: eventName });
          } else {
            answerFull = dedupeRepeatedText(mergeStreamingText(answerFull, chunkText));
            onEvent?.({ lane: 'answer', content: answerFull, rawEventName: eventName });
          }
          if (!finalOnly) {
            full = dedupeRepeatedText(mergeStreamingText(full, chunkText));
            onChunk?.(full);
          }
        } else if (chunkText && lane === 'thinking') {
          thinkingFull = dedupeRepeatedText(mergeStreamingText(thinkingFull, chunkText));
          onEvent?.({ lane: 'thinking', content: thinkingFull, rawEventName: eventName });
        } else if (thinkingChunkText) {
          thinkingFull = dedupeRepeatedText(mergeStreamingText(thinkingFull, thinkingChunkText));
          onEvent?.({ lane: 'thinking', content: thinkingFull, rawEventName: eventName });
        } else if (chunkText && lane === 'answer') {
          answerFull = dedupeRepeatedText(mergeStreamingText(answerFull, chunkText));
          onEvent?.({ lane: 'answer', content: answerFull, rawEventName: eventName });
        } else if (eventName === 'run.failed') {
          streamError = extractTextFromUnknown(payload.message) || 'run failed';
        } else if (
          eventName === 'run.completed' ||
          eventName === 'run.failed' ||
          eventName === 'run.cancelled' ||
          eventName === 'run.timed_out'
        ) {
          gotTerminalEvent = true;
          // terminal event, stop reading further
          reader.cancel();
          break;
        }
      } catch {
        // ignore malformed event chunk
      }
    }
  }

  if (streamError) throw new Error(`OAH run failed: ${streamError}`);
  if (answerFull.trim()) return dedupeRepeatedText(answerFull);
  if (finalOnly) {
    if (completedMessageText.trim()) {
      return dedupeRepeatedText(completedMessageText);
    }
    const finalMsg = await fetchLastAssistantMessageWithRetry(sessionId, gotTerminalEvent ? 6 : 4, 250);
    if (finalMsg.trim()) {
      return dedupeRepeatedText(finalMsg);
    }
  }
  if (!full.trim()) {
    // Some runtimes emit terminal event before persisting assistant message.
    // Retry a few times before concluding empty response.
    const fallback = await fetchLastAssistantMessageWithRetry(sessionId, gotTerminalEvent ? 4 : 2, 250);
    if (fallback.trim()) {
      const deduped = dedupeRepeatedText(fallback);
      onChunk?.(deduped);
      return deduped;
    }
    throw new Error('OAH returned empty response');
  }
  return dedupeRepeatedText(full);
}

async function fetchLastAssistantMessageWithRetry(
  sessionId: string,
  attempts: number,
  waitMs: number
): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    const text = await fetchLastAssistantMessage(sessionId);
    if (text.trim()) return text;
    if (i < attempts - 1) await sleep(waitMs);
  }
  return '';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLastAssistantMessage(sessionId: string): Promise<string> {
  const res = await fetch(`${OAH_API_BASE}/sessions/${encodeURIComponent(sessionId)}/messages?pageSize=200`);
  if (!res.ok) return '';
  const data = (await res.json()) as { items?: Array<{ role?: string; content?: unknown; message?: unknown }> };
  const items = data.items ?? [];
  for (let i = items.length - 1; i >= 0; i--) {
    const msg = items[i];
    if (msg.role === 'assistant') {
      const text = extractTextFromUnknown(msg.content) || extractTextFromUnknown(msg.message);
      if (text.trim()) return text;
    }
  }
  return '';
}

export function buildTopicAnalysisPrompt(topic: {
  title: string;
  description: string;
  keywords: string[];
  paperCount: number;
  growthRate: number;
  type: string;
  domains: string[];
  representativePapers: Array<{ title: string; year: number }>;
  scores?: {
    innovation: { crossDomain: number; gapRatio: number; novelty: number; total: number };
    practicality: { growth: number; literatureBase: number; policyFit: number; total: number };
    evidence: string;
  };
}): Message[] {
  const repPapers = topic.representativePapers
    .map((p) => `《${p.title}》(${p.year})`)
    .join('、');

  const scoresCtx = topic.scores
    ? `\n【创新性评分】总分 ${topic.scores.innovation.total}（交叉度 ${topic.scores.innovation.crossDomain}，空白度 ${topic.scores.innovation.gapRatio}，新颖度 ${topic.scores.innovation.novelty}）
【实效性评分】总分 ${topic.scores.practicality.total}（增长势能 ${topic.scores.practicality.growth}，文献基础 ${topic.scores.practicality.literatureBase}，政策契合 ${topic.scores.practicality.policyFit}）
【量化依据】${topic.scores.evidence}`
    : '';

  return [
    {
      role: 'system',
      content: `你是一位教育学研究方法论专家，擅长从文献计量数据中识别研究前沿。你的分析必须：
1. 从"创新性"和"实效性"两个维度分别评估
2. 所有论断必须有可验证的依据——引用具体的论文数量、增长率、共现统计等数据
3. 给出具体可操作的选题建议，每个选题说明为什么同时具备创新性和实效性
4. 语言精炼，使用学术但不晦涩的表达
回答控制在 400 字以内。使用中文。`,
    },
    {
      role: 'user',
      content: `请从创新性和实效性两个维度分析以下教育学研究选题：

【选题】${topic.title}
【类型】${topic.type === 'trending' ? '趋势热点' : topic.type === 'crossdisciplinary' ? '交叉创新' : topic.type === 'blueocean' ? '蓝海选题' : '经典延伸'}
【数据背景】${topic.description}
【相关论文数】${topic.paperCount} 篇，近三年增长率 ${topic.growthRate}%
【所属领域】${topic.domains.join('、')}
【关键词】${topic.keywords.join('、')}
【代表性论文】${repPapers || '暂无'}${scoresCtx}

请按以下框架分析：

📐 创新性评估
- 该选题的知识边界在哪里？（引用具体数据：论文数、空白度、交叉领域数）
- 现有研究做到了什么程度？哪些方法论路径尚未被探索？

📊 实效性评估
- 该选题的政策需求和社会价值是什么？（引用增长率、政策契合度数据）
- 研究可行性如何？文献基础是否充分？

💡 推荐选题（2-3个）
- 每个选题必须说明：为什么具有创新性（填补了什么空白）+ 为什么具有实效性（解决了什么实际问题）
- 给出可验证的选题依据`,
    },
  ];
}

export function buildCowordAnalysisPrompt(
  centerKeyword: string,
  neighbors: Array<{ keyword: string; weight: number }>,
  centerCount: number,
  centerDomain: string,
): Message[] {
  const neighborsList = neighbors
    .slice(0, 8)
    .map((n) => `${n.keyword}(共现${n.weight}次)`)
    .join('、');

  return [
    {
      role: 'system',
      content: `你是一位教育学研究专家，擅长从共词分析中解读学术研究的内在关联。分析要简洁有洞见，揭示关键词共现背后的学理逻辑。回答控制在 200 字以内。使用中文。`,
    },
    {
      role: 'user',
      content: `请解读以下关键词共现关系：

中心关键词：「${centerKeyword}」（${centerCount}篇论文，所属领域：${centerDomain}）
主要共现词：${neighborsList}

请分析：
1. 这组共现反映了什么研究范式或理论框架？
2. 哪些共现关系是意料之中的？哪些揭示了非显而易见的研究路径？
3. 基于这组共现，有什么值得深入的研究方向？`,
    },
  ];
}

export function buildPaperChatPrompt(
  paper: { title: string; abstract: string; keywords: string[]; authors: string[]; year: number; journal: string; institution: string },
  question: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): Message[] {
  return [
    {
      role: 'system',
      content: `你是一位教育学研究助手。用户正在查看一篇论文，你需要基于论文信息回答问题。
论文信息：
标题：${paper.title}
作者：${paper.authors.join('、')}
机构：${paper.institution}
期刊：${paper.journal} (${paper.year})
关键词：${paper.keywords.join('、')}
摘要：${paper.abstract}

请简洁、专业地回答问题。如果问题超出论文内容范围，基于你的教育学知识合理扩展。回答控制在 200 字以内。使用中文。`,
    },
    ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: question },
  ];
}

export function buildReadingAssistantPrompt(input: {
  sourceLabel: string;
  paper?: { title: string; abstract: string; keywords: string[]; year: number; journal: string };
  userQuestion: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  style: 'guided' | 'direct';
  depth: ReadingDepth;
  goal?: string;
  reasoningLevel: 'minimal' | 'full';
}): Message[] {
  const paperSection = input.paper
    ? `当前论文：
- 标题：${input.paper.title}
- 摘要：${input.paper.abstract}
- 关键词：${input.paper.keywords.join('、')}
- 年份/期刊：${input.paper.year} / ${input.paper.journal}`
    : `当前阅读对象：${input.sourceLabel}`;

  const styleRules = input.style === 'guided'
    ? `当前模式：苏格拉底引导。默认先提出澄清或引导问题，再给线索，不要直接给完整答案。`
    : `当前模式：直答。先给结论，再给证据，并在结尾给一个追问促进深入。`;

  const reasoningRules = input.reasoningLevel === 'full'
    ? '输出 reasoningTrace 时可给出较完整阶段思路。'
    : '输出 reasoningTrace 时仅给最简摘要。';

  return [
    {
      role: 'system',
      content: `你是 Eduresearch 论文阅读助手，目标是帮助用户理解论文并形成可验证认知。
${paperSection}
用户学习目标：${input.goal || '未明确，请先帮助澄清目标'}
阅读深度：${input.depth}
${styleRules}
${reasoningRules}

你必须只输出一个 JSON 对象，不要有任何前缀或后缀文字。
禁止：在 JSON 外输出思考过程、解题步骤、「首先/然后/现在整理」等说明；禁止使用 Markdown 代码块包裹；第一个非空白字符必须是左花括号，最后一个必须是右花括号。
格式（字段不可省略，数组可为空）：
{
  "answer": "给用户的回答",
  "nextQuestion": "下一步引导问题",
  "evidenceRefs": [{"id":"ev1","label":"章节或图表名称","snippet":"证据摘录"}],
  "toolTrace": [{"id":"tool1","tool":"使用的工具名","status":"completed","summary":"做了什么"}],
  "reasoningTrace": ["阶段1判断","阶段2证据","阶段3结论"]
}
要求：使用中文；证据要可核验；若信息不足请明确写出不确定性。reasoningTrace 只写在 JSON 数组内，勿在 JSON 外复述。`,
    },
    ...input.history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: input.userQuestion },
  ];
}

export function parseReadingAssistantResponse(raw: string): ReadingAssistantResponse {
  const fallback: ReadingAssistantResponse = {
    answer:
      '未解析到合法 JSON：模型可能在 JSON 外输出了说明文字。请重试；若换了一篇论文，请尽量简短提问以便模型只输出协议 JSON。',
    nextQuestion: '请重试一次提问，或说明你想关注的论文段落/问题。',
    evidenceRefs: [],
    toolTrace: [],
    reasoningTrace: [],
  };

  const jsonCandidate = extractJsonObject(raw, 'preferAnswerLast');
  if (!jsonCandidate) return fallback;

  try {
    const parsed = JSON.parse(jsonCandidate) as Partial<ReadingAssistantResponse>;
    return {
      answer: typeof parsed.answer === 'string' ? parsed.answer : fallback.answer,
      nextQuestion: typeof parsed.nextQuestion === 'string' ? parsed.nextQuestion : fallback.nextQuestion,
      evidenceRefs: Array.isArray(parsed.evidenceRefs)
        ? parsed.evidenceRefs
            .filter(
              (x): x is EvidenceRef =>
                !!x &&
                typeof x.id === 'string' &&
                typeof x.label === 'string' &&
                typeof x.snippet === 'string' &&
                (x.page == null || typeof x.page === 'number')
            )
        : fallback.evidenceRefs,
      toolTrace: Array.isArray(parsed.toolTrace)
        ? parsed.toolTrace
            .filter(
              (x): x is ToolTraceItem =>
                !!x &&
                typeof x.id === 'string' &&
                typeof x.tool === 'string' &&
                (x.status === 'running' || x.status === 'completed' || x.status === 'failed') &&
                typeof x.summary === 'string'
            )
        : fallback.toolTrace,
      reasoningTrace: Array.isArray(parsed.reasoningTrace)
        ? parsed.reasoningTrace.filter((x): x is string => typeof x === 'string')
        : fallback.reasoningTrace,
    };
  } catch {
    return fallback;
  }
}

/** 从模型回复中取出 Markdown ```json ... ``` 内层，若无则原样返回 */
function unwrapMarkdownJsonBlocks(raw: string): string {
  const t = raw.trim();
  const re = /```(?:json)?\s*([\s\S]*?)```/g;
  let lastInner: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) lastInner = m[1];
  if (lastInner) return lastInner.trim();
  return t;
}

export function buildWritingAssistantPrompt(input: {
  task: string;
  material: string;
  userQuestion: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Message[] {
  return [
    {
      role: 'system',
      content: `你是 Eduresearch 写作助手。目标是帮助用户完成学术写作（提纲、段落、改写、润色）。
当前写作任务：${input.task || '未设定，请先帮用户澄清写作目标'}
可用材料：${input.material || '暂无材料'}

请返回严格 JSON：
{
  "answer": "给用户的写作建议或内容",
  "nextQuestion": "下一步写作引导问题",
  "outline": ["提纲1","提纲2"],
  "draft": "可直接使用的草稿片段",
  "evidenceRefs": [],
  "toolTrace": [{"id":"tool1","tool":"writer","status":"completed","summary":"..."}],
  "reasoningTrace": ["阶段1","阶段2"]
}
要求：中文，表达清晰，避免空泛。`,
    },
    ...input.history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: input.userQuestion },
  ];
}

export function parseWritingAssistantResponse(raw: string): WritingAssistantResponse {
  const base = parseReadingAssistantResponse(raw);
  const jsonCandidate = extractJsonObject(raw, 'preferAnswerLast');
  if (!jsonCandidate) {
    return { ...base, outline: [], draft: base.answer };
  }
  try {
    const parsed = JSON.parse(jsonCandidate) as Partial<WritingAssistantResponse>;
    return {
      ...base,
      outline: Array.isArray(parsed.outline) ? parsed.outline.filter((x): x is string => typeof x === 'string') : [],
      draft: typeof parsed.draft === 'string' ? parsed.draft : base.answer,
    };
  } catch {
    return { ...base, outline: [], draft: base.answer };
  }
}

export function buildDiscoveryExecutionPrompt(input: {
  taskCard: FramingTaskCardResult | null;
  userQuestion: string;
}): Message[] {
  return [
    {
      role: 'system',
      content: `你是 discovery 助手。请真正执行“检索-去重-可信度评分-主题聚类”，并给出可用证据池。
返回严格 JSON：
{
  "keywordPlan": {
    "keywords": ["关键词1","关键词2"],
    "queries": ["检索式1","检索式2"]
  },
  "candidatePool":[
    {"title":"文献标题","type":"paper|report|blog|repo|other","source":"来源/链接或站点","url":"可点击URL(尽量提供)","credibility":0-100,"reason":"入选理由"}
  ],
  "evidenceList":["证据要点1","证据要点2"],
  "topicClusters":["主题簇1","主题簇2"],
  "timeline":[
    {"stage":"queued","status":"completed","message":"任务入队"},
    {"stage":"searching","status":"completed","message":"正在检索","addedCount":12,"currentTitle":"xxx","currentUrl":"https://..."},
    {"stage":"deduping","status":"completed","message":"去重完成","addedCount":12,"dedupedCount":4,"dropReasons":["重复来源","低相关"]},
    {"stage":"scoring","status":"completed","message":"可信度评分完成","dropReasons":["来源不可靠"]},
    {"stage":"clustering","status":"completed","message":"主题聚类完成"},
    {"stage":"summarized","status":"completed","message":"结果已汇总"}
  ],
  "toolTrace":[{"id":"t1","tool":"search","status":"completed","summary":"检索了什么"}],
  "reasoningTrace":["步骤1","步骤2"]
}
要求：
- 先做关键词抽取（keywordPlan），再做检索与去重评估；
- keywords 应为可检索短语，不得包含 RQ1/RQ2、整句任务描述、模板话术；
- candidatePool 至少 5 条，优先 paper/report/repo；
- 明确说明去重和可信度评分依据；
- timeline 必须包含 queued/searching/deduping/scoring/clustering/summarized 六个阶段，且尽量补充新增文献数、去重数、淘汰原因；
- 若无法确认真实可访问链接，url 留空字符串，不要编造链接；
- 若提供 url，必须是完整 http(s) 地址（例如 doi.org / arxiv.org / github.com / 官方站点）；
- 中文输出，不要 markdown。`,
    },
    {
      role: 'user',
      content: input.taskCard
        ? `任务卡：${JSON.stringify(input.taskCard)}\n\n用户原始请求：${input.userQuestion}`
        : `用户原始请求：${input.userQuestion}`,
    },
  ];
}

export function parseDiscoveryExecutionResponse(raw: string): DiscoveryExecutionResponse {
  const fallback: DiscoveryExecutionResponse = {
    keywordPlan: { keywords: [], queries: [] },
    candidatePool: [],
    evidenceList: [],
    topicClusters: [],
    toolTrace: [],
    reasoningTrace: [],
    timeline: [],
  };
  const jsonCandidate = extractJsonObject(raw);
  if (!jsonCandidate) return fallback;
  try {
    const normalizeUrl = (v: unknown): string | undefined => {
      if (typeof v !== 'string') return undefined;
      const s = v.trim();
      if (!s || !/^https?:\/\//i.test(s)) return undefined;
      try {
        const u = new URL(s);
        return u.toString();
      } catch {
        return undefined;
      }
    };
    const parsed = JSON.parse(jsonCandidate) as Partial<DiscoveryExecutionResponse>;
    const candidates = Array.isArray(parsed.candidatePool)
      ? parsed.candidatePool
          .map((x) => {
            if (!x || typeof x !== 'object') return null;
            const row = x as Partial<DiscoveryCandidateItem>;
            const type = row.type === 'paper' || row.type === 'report' || row.type === 'blog' || row.type === 'repo' || row.type === 'other'
              ? row.type
              : 'other';
            return {
              title: typeof row.title === 'string' ? row.title : '',
              type,
              source: typeof row.source === 'string' ? row.source : '',
              credibility: typeof row.credibility === 'number' ? row.credibility : 0,
              reason: typeof row.reason === 'string' ? row.reason : '',
              url: normalizeUrl(row.url),
            } as DiscoveryCandidateItem;
          })
          .filter((x): x is DiscoveryCandidateItem => !!x && !!x.title)
      : [];
    return {
      keywordPlan: (() => {
        const rawPlan = (parsed as { keywordPlan?: { keywords?: unknown; queries?: unknown } }).keywordPlan;
        if (!rawPlan || typeof rawPlan !== 'object') return { keywords: [], queries: [] };
        const keywords = Array.isArray(rawPlan.keywords)
          ? rawPlan.keywords.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean)
          : [];
        const queries = Array.isArray(rawPlan.queries)
          ? rawPlan.queries.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean)
          : [];
        return { keywords: keywords.slice(0, 12), queries: queries.slice(0, 8) };
      })(),
      candidatePool: candidates,
      evidenceList: Array.isArray(parsed.evidenceList) ? parsed.evidenceList.filter((x): x is string => typeof x === 'string') : [],
      topicClusters: Array.isArray(parsed.topicClusters) ? parsed.topicClusters.filter((x): x is string => typeof x === 'string') : [],
      timeline: Array.isArray((parsed as { timeline?: unknown[] }).timeline)
        ? (parsed as { timeline?: unknown[] }).timeline!
            .map((x) => {
              if (!x || typeof x !== 'object') return null;
              const row = x as Partial<DiscoveryTimelineItem>;
              const stage = row.stage === 'queued' || row.stage === 'searching' || row.stage === 'deduping' || row.stage === 'scoring' || row.stage === 'clustering' || row.stage === 'summarized'
                ? row.stage
                : null;
              if (!stage) return null;
              return {
                stage,
                status: row.status === 'running' || row.status === 'completed' || row.status === 'failed' ? row.status : 'completed',
                message: typeof row.message === 'string' ? row.message : '',
                addedCount: typeof row.addedCount === 'number' ? row.addedCount : undefined,
                dedupedCount: typeof row.dedupedCount === 'number' ? row.dedupedCount : undefined,
                dropReasons: Array.isArray(row.dropReasons) ? row.dropReasons.filter((r): r is string => typeof r === 'string') : undefined,
                currentTitle: typeof row.currentTitle === 'string' ? row.currentTitle : undefined,
                currentUrl: normalizeUrl(row.currentUrl),
                timestamp: typeof row.timestamp === 'number' ? row.timestamp : undefined,
              } as DiscoveryTimelineItem;
            })
            .filter((x): x is DiscoveryTimelineItem => !!x)
        : [],
      toolTrace: Array.isArray(parsed.toolTrace)
        ? parsed.toolTrace.filter(
            (x): x is ToolTraceItem =>
              !!x &&
              typeof x.id === 'string' &&
              typeof x.tool === 'string' &&
              (x.status === 'running' || x.status === 'completed' || x.status === 'failed') &&
              typeof x.summary === 'string'
          )
        : [],
      reasoningTrace: Array.isArray(parsed.reasoningTrace) ? parsed.reasoningTrace.filter((x): x is string => typeof x === 'string') : [],
    };
  } catch {
    return fallback;
  }
}

export function buildDiscoveryTracePreview(raw: string): DiscoveryTracePreview {
  const jsonCandidate = extractJsonObject(raw);
  if (!jsonCandidate) {
    return {
      displayText: raw.trim(),
      hasJson: false,
      hasKeywordPlan: false,
      keywordCount: 0,
      queryCount: 0,
      reason: '未检测到可解析 JSON（可能为自然语言解释或格式破损）',
    };
  }
  try {
    const parsed = JSON.parse(jsonCandidate) as {
      keywordPlan?: { keywords?: unknown; queries?: unknown };
    };
    const keywords = Array.isArray(parsed.keywordPlan?.keywords)
      ? parsed.keywordPlan?.keywords.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [];
    const queries = Array.isArray(parsed.keywordPlan?.queries)
      ? parsed.keywordPlan?.queries.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : [];
    const hasKeywordPlan = !!parsed.keywordPlan && typeof parsed.keywordPlan === 'object';
    let reason = 'keywordPlan 提取正常';
    if (!hasKeywordPlan) reason = 'JSON 中缺少 keywordPlan 字段';
    else if (!keywords.length) reason = 'keywordPlan 存在但 keywords 为空或类型不合法';
    return {
      displayText: jsonCandidate,
      hasJson: true,
      hasKeywordPlan,
      keywordCount: keywords.length,
      queryCount: queries.length,
      reason,
    };
  } catch {
    return {
      displayText: jsonCandidate,
      hasJson: false,
      hasKeywordPlan: false,
      keywordCount: 0,
      queryCount: 0,
      reason: 'JSON 解析失败（可能包含转义或截断问题）',
    };
  }
}

type SourceKind = 'crossref' | 'openalex' | 'arxiv' | 'semanticscholar' | 'github' | 'google';
type RetrievedItem = DiscoveryCandidateItem & {
  sourceKind: SourceKind;
};

function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\u4e00-\u9fa5 ]/g, '').trim();
}

function dedupeRepeatedText(input: string): string {
  const s = input.trim();
  if (!s) return input;
  const half = Math.floor(s.length / 2);
  if (s.length % 2 === 0 && s.slice(0, half) === s.slice(half)) {
    return s.slice(0, half);
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

function mergeStreamingText(prev: string, incoming: string): string {
  const a = prev || '';
  const b = incoming || '';
  if (!a) return b;
  if (!b) return a;
  if (b.startsWith(a)) return b;
  if (a.startsWith(b)) return a;
  if (a.includes(b)) return a;
  if (b.includes(a)) return b;
  const max = Math.min(a.length, b.length);
  for (let k = max; k > 0; k--) {
    if (a.slice(a.length - k) === b.slice(0, k)) {
      return a + b.slice(k);
    }
  }
  return a + b;
}

function sourceCredibility(kind: SourceKind): number {
  if (kind === 'openalex') return 92;
  if (kind === 'crossref') return 90;
  if (kind === 'arxiv') return 86;
  if (kind === 'semanticscholar') return 88;
  return 80;
}

async function fetchJsonWithTimeout(url: string, init?: RequestInit, timeoutMs = 10000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextWithTimeout(url: string, timeoutMs = 10000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return '';
    return await res.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function searchCrossref(query: string, limit: number): Promise<RetrievedItem[]> {
  const url = `https://api.crossref.org/works?rows=${limit}&sort=relevance&query=${encodeURIComponent(query)}`;
  const data = await fetchJsonWithTimeout(url) as { message?: { items?: Array<{ title?: string[]; DOI?: string; URL?: string; type?: string }> } } | null;
  const items = data?.message?.items ?? [];
  const out: RetrievedItem[] = [];
  for (const x of items) {
    const title = x.title?.[0]?.trim() || '';
    if (!title) continue;
    const doiUrl = x.DOI ? `https://doi.org/${x.DOI}` : '';
    const finalUrl = /^https?:\/\//.test(doiUrl) ? doiUrl : (x.URL || '');
    out.push({
      title,
      type: 'paper',
      source: 'Crossref',
      url: finalUrl,
      credibility: sourceCredibility('crossref'),
      reason: '来自 Crossref DOI 记录',
      sourceKind: 'crossref',
    });
  }
  return out;
}

async function searchOpenAlex(query: string, limit: number): Promise<RetrievedItem[]> {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${limit}&sort=relevance_score:desc`;
  const data = await fetchJsonWithTimeout(url) as { results?: Array<{ title?: string; doi?: string; primary_location?: { landing_page_url?: string } }> } | null;
  const results = data?.results ?? [];
  const out: RetrievedItem[] = [];
  for (const x of results) {
    const title = (x.title || '').trim();
    if (!title) continue;
    const doiUrl = x.doi && /^https?:\/\//.test(x.doi) ? x.doi : '';
    const finalUrl = doiUrl || x.primary_location?.landing_page_url || '';
    out.push({
      title,
      type: 'paper',
      source: 'OpenAlex',
      url: finalUrl,
      credibility: sourceCredibility('openalex'),
      reason: '来自 OpenAlex 学术索引',
      sourceKind: 'openalex',
    });
  }
  return out;
}

async function searchArxiv(query: string, limit: number): Promise<RetrievedItem[]> {
  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${limit}`;
  const xml = await fetchTextWithTimeout(url);
  if (!xml) return [];
  const chunks = xml.split('<entry>').slice(1);
  const out: RetrievedItem[] = [];
  for (const entry of chunks) {
    const t = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.replace(/\s+/g, ' ').trim() || '';
    const idUrl = entry.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() || '';
    if (!t) continue;
    out.push({
      title: t,
      type: 'paper',
      source: 'arXiv',
      url: idUrl,
      credibility: sourceCredibility('arxiv'),
      reason: '来自 arXiv 预印本',
      sourceKind: 'arxiv',
    });
  }
  return out;
}

async function searchSemanticScholar(query: string, limit: number): Promise<RetrievedItem[]> {
  const headers: Record<string, string> = {};
  if (SEMANTIC_SCHOLAR_API_KEY) headers['x-api-key'] = SEMANTIC_SCHOLAR_API_KEY;
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=title,url`;
  const data = await fetchJsonWithTimeout(url, { headers }) as { data?: Array<{ title?: string; url?: string }> } | null;
  const list = data?.data ?? [];
  const out: RetrievedItem[] = [];
  for (const x of list) {
    const title = (x.title || '').trim();
    if (!title) continue;
    out.push({
      title,
      type: 'paper',
      source: 'Semantic Scholar',
      url: x.url || '',
      credibility: sourceCredibility('semanticscholar'),
      reason: '来自 Semantic Scholar',
      sourceKind: 'semanticscholar',
    });
  }
  return out;
}

async function searchGitHub(query: string, limit: number): Promise<RetrievedItem[]> {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${limit}`;
  const data = await fetchJsonWithTimeout(url, { headers: { Accept: 'application/vnd.github+json' } }) as { items?: Array<{ full_name?: string; html_url?: string; description?: string }> } | null;
  const list = data?.items ?? [];
  const out: RetrievedItem[] = [];
  for (const x of list) {
    const title = (x.full_name || '').trim();
    if (!title) continue;
    out.push({
      title,
      type: 'repo',
      source: 'GitHub',
      url: x.html_url || '',
      credibility: sourceCredibility('github'),
      reason: x.description ? `代码仓库：${x.description}` : '代码仓库候选',
      sourceKind: 'github',
    });
  }
  return out;
}

async function searchGoogleCsePages(query: string, pageCount = 5): Promise<RetrievedItem[]> {
  if (!GOOGLE_CSE_API_KEY || !GOOGLE_CSE_CX) return [];
  const out: RetrievedItem[] = [];
  const pages = Math.max(1, Math.min(pageCount, 5));
  for (let p = 0; p < pages; p++) {
    const start = p * 10 + 1;
    const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(GOOGLE_CSE_API_KEY)}&cx=${encodeURIComponent(GOOGLE_CSE_CX)}&q=${encodeURIComponent(query)}&start=${start}&num=10`;
    const data = await fetchJsonWithTimeout(url, undefined, 12000) as { items?: Array<{ title?: string; link?: string; snippet?: string }> } | null;
    const items = data?.items ?? [];
    for (const x of items) {
      const title = (x.title || '').trim();
      if (!title) continue;
      out.push({
        title,
        type: 'other',
        source: 'Google CSE',
        url: x.link || '',
        credibility: 72,
        reason: x.snippet ? `Google 命中：${x.snippet}` : 'Google 检索命中',
        sourceKind: 'google',
      } as RetrievedItem);
    }
  }
  return out;
}

function relevanceScore(queryTokens: string[], title: string, reason: string): number {
  const text = `${title} ${reason}`.toLowerCase();
  if (!queryTokens.length) return 0;
  let hit = 0;
  for (const t of queryTokens) {
    if (text.includes(t.toLowerCase())) hit += 1;
  }
  return Math.round((hit / queryTokens.length) * 100);
}

function buildSearchKeywordsWithDebug(input: {
  problemStatement?: string;
  rqList?: string[];
  userQuestion: string;
}): { keywords: string[]; debug: { rawPieceCount: number; removedNoiseCount: number; candidateCount: number; sampleRawPieces: string[] } } {
  const sourceText = [
    input.problemStatement || '',
    ...(input.rqList ?? []),
    input.userQuestion,
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const rawPieces = sourceText
    .split(/[，。；;、:：!！?？\n|]/)
    .map((x) => x.trim())
    .filter(Boolean);

  const noiseRegex =
    /(检索关键词|我想做|帮我定义|研究问题|评估标准|可执行|对应适配|请给出|请你|最终建议|任务卡|RQ\d+|怎么做|如何做|这个主题)/i;
  const leadRegex = /^(RQ\d+\s*[:：]?\s*|比较|探索|定义|帮我|请你|请|研究|关于|我想|我要|希望|能否)\s*/i;
  const stopWordRegex = /^(以及|并且|或者|如果|是否|存在|什么|哪些|如何|进行|开展|相关|研究|主题|方法|模型|用户|学生)$/i;
  const phraseBridgeRegex = /(对|在|中的|对于|与|和|及|以及|并|并且)/;
  const latinWordRegex = /\b[a-zA-Z][a-zA-Z0-9_-]{1,30}\b/g;
  const cjkQuotedRegex = /[“"']([^“"'，。；;!?！？]{2,30})[”"']/g;

  const tokens: string[] = [];
  let removedNoiseCount = 0;

  // 1) 先提取被引号包裹的短语（优先级最高）
  let qm: RegExpExecArray | null;
  while ((qm = cjkQuotedRegex.exec(sourceText)) !== null) {
    const q = qm[1]?.trim();
    if (q && !noiseRegex.test(q)) tokens.push(q);
  }

  // 2) 提取英文关键词（如 metacognition, transfer）
  const latin = sourceText.match(latinWordRegex) ?? [];
  for (const w of latin) {
    if (!stopWordRegex.test(w) && !noiseRegex.test(w)) tokens.push(w);
  }

  // 3) 中文短语：尽量保留原短语，再对超长短语做温和拆分
  for (const piece of rawPieces) {
    const cleaned = piece.replace(leadRegex, '').trim();
    if (!cleaned || noiseRegex.test(cleaned)) {
      removedNoiseCount += 1;
      continue;
    }
    if (cleaned.length >= 2 && cleaned.length <= 24 && !stopWordRegex.test(cleaned)) {
      tokens.push(cleaned);
    }
    if (cleaned.length > 12) {
      const subs = cleaned
        .split(phraseBridgeRegex)
        .map((x) => x.trim())
        .filter(Boolean);
      for (const s of subs) {
        const ok =
          s.length >= 2 &&
          s.length <= 16 &&
          !noiseRegex.test(s) &&
          !stopWordRegex.test(s);
        if (ok) tokens.push(s);
        else removedNoiseCount += 1;
      }
    }
  }

  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    const norm = t
      .toLowerCase()
      .replace(/["'“”‘’]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    uniq.push(t.trim());
  }
  const preferred = uniq
    .filter((x) => /[a-zA-Z\u4e00-\u9fa5]/.test(x))
    .filter((x) => x.length >= 2 && x.length <= 24)
    .filter((x) => !stopWordRegex.test(x))
    .slice(0, 14);
  return {
    keywords: preferred.slice(0, 12),
    debug: {
      rawPieceCount: rawPieces.length,
      removedNoiseCount,
      candidateCount: preferred.length,
      sampleRawPieces: rawPieces.slice(0, 6),
    },
  };
}

function deriveTokensFromQueries(queries: string[], limit = 14): string[] {
  const rawTokens: string[] = [];
  const latin = /\b[a-zA-Z][a-zA-Z0-9_-]{1,30}\b/g;
  const cjk = /[\u4e00-\u9fa5]{2,16}/g;

  for (const q of queries) {
    if (!q) continue;
    const cleaned = q.replace(/["'“”‘’]/g, '');
    const l = cleaned.match(latin) ?? [];
    rawTokens.push(...l);
    const c = cleaned.match(cjk) ?? [];
    rawTokens.push(...c);
  }

  const stop = /^(以及|并且|或者|如果|是否|存在|什么|哪些|如何|进行|开展|相关|研究|主题|方法|模型|用户|学生)$/i;
  const noise = /(检索|关键词|search|query|google|scholar|arxiv|doi|github|openalex|crossref)/i;

  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const t of rawTokens) {
    const x = t.trim();
    if (!x) continue;
    if (x.length < 2 || x.length > 16) continue;
    if (stop.test(x)) continue;
    if (noise.test(x)) continue;
    const k = x.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(x);
    if (uniq.length >= limit) break;
  }
  return uniq;
}

async function rewriteToAcademicSearchQueries(input: {
  userQuestion: string;
  taskCard?: { problemStatement?: string; rqList?: string[] } | null;
  seedKeywords?: string[];
  signal?: AbortSignal;
}): Promise<{ queries: string[] }> {
  const seed = (input.seedKeywords ?? []).filter(Boolean).slice(0, 8);

  const promptUser = [
    `用户原话：${input.userQuestion}`,
    input.taskCard?.problemStatement ? `任务卡问题陈述：${input.taskCard.problemStatement}` : '',
    input.taskCard?.rqList?.length ? `任务卡 RQ：${input.taskCard.rqList.slice(0, 5).join(' / ')}` : '',
    seed.length ? `参考关键词：${seed.join(' / ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const raw = await chatCompletion(
      [
        {
          role: 'system',
          content:
            '你是学术检索查询改写器。把用户问题改写成 3-5 条可用于多源检索（Crossref/OpenAlex/Arxiv/Semantic Scholar/Google CSE）的检索式。\n' +
            '要求：1) 去掉泛化操作词（如“帮我/请你/怎么做/最终建议/任务卡”）；2) 每条保留核心概念，并可加入中英文同义短语；3) 不要输出推理过程；4) 严格输出 JSON：{"queries":[...]}；5) queries 为字符串数组，长度 3-5，单条长度尽量控制在 40-90 字符。',
        },
        { role: 'user', content: promptUser },
      ],
      undefined,
      {
        agentName: resolveOahAgentName('general'),
        sessionScope: 'query_rewrite',
        signal: input.signal,
        finalOnly: true,
      }
    );

    const json = extractJsonObject(raw);
    if (!json) return { queries: [] };
    const parsed = JSON.parse(json) as { queries?: unknown };
    const queries = Array.isArray(parsed.queries)
      ? parsed.queries
          .filter((x): x is string => typeof x === 'string')
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 5)
      : [];
    if (queries.length < 3) return { queries: [] };
    return { queries };
  } catch {
    return { queries: [] };
  }
}

export async function runRealDiscoveryRetrieval(input: {
  userQuestion: string;
  taskCard?: {
    problemStatement?: string;
    rqList?: string[];
  } | null;
  seedKeywords?: string[];
  perSource?: number;
  signal?: AbortSignal;
  rounds?: number;
  onProgress?: (partial: Partial<RealDiscoveryResult>) => void;
}): Promise<RealDiscoveryResult> {
  if (!ENABLE_REAL_DISCOVERY) {
    return {
      candidatePool: [],
      evidenceList: [],
      topicClusters: [],
      timeline: [],
      toolTrace: [],
      reasoningTrace: [],
      keywordTokens: [],
      searchQueries: [],
    };
  }
  const perSource = Math.max(4, Math.min(input.perSource ?? 10, 25));
  const fallbackKeywordPlan = (() => {
    const seed = Array.isArray(input.seedKeywords)
      ? input.seedKeywords
          .map((x) => x.trim())
          .filter((x) =>
            x.length >= 2 &&
            x.length <= 20 &&
            !/(RQ\d+|研究问题|评估标准|检索关键词|我想做|帮我定义|请你|任务卡)/i.test(x)
          )
      : [];
    if (seed.length > 0) {
      const deduped = Array.from(new Set(seed)).slice(0, 12);
      return {
        keywords: deduped,
        source: 'discovery.keywordPlan' as const,
        debug: {
          rawPieceCount: seed.length,
          removedNoiseCount: Math.max(0, (input.seedKeywords?.length ?? 0) - seed.length),
          candidateCount: deduped.length,
          sampleRawPieces: seed.slice(0, 6),
        },
      };
    }
    const fallback = buildSearchKeywordsWithDebug({
      problemStatement: input.taskCard?.problemStatement,
      rqList: input.taskCard?.rqList,
      userQuestion: input.userQuestion,
    });
    return {
      keywords: fallback.keywords,
      source: 'fallback' as const,
      debug: fallback.debug,
    };
  })();

  const rewritten = await rewriteToAcademicSearchQueries({
    userQuestion: input.userQuestion,
    taskCard: input.taskCard ?? undefined,
    seedKeywords: input.seedKeywords,
    signal: input.signal,
  });

  const fallbackKeywordTokens = fallbackKeywordPlan.keywords;
  const fallbackSearchQueries = (() => {
    const k = fallbackKeywordTokens.filter(Boolean);
    if (!k.length) return [input.userQuestion.trim()].filter(Boolean);
    const q1 = k.slice(0, 6).join(' ');
    const q2 = `"${k.slice(0, 2).join(' ')}" ${k.slice(2, 6).join(' ')}`.trim();
    const q3 = `${k.slice(0, 5).join(' ')} review OR meta-analysis`;
    return Array.from(new Set([q1, q2, q3].map((x) => x.trim()).filter(Boolean))).slice(0, 5);
  })();

  const searchQueries = rewritten.queries.length > 0 ? rewritten.queries : fallbackSearchQueries;
  const keywordTokens = rewritten.queries.length > 0 ? deriveTokensFromQueries(searchQueries, 14) : fallbackKeywordTokens;
  const qList = searchQueries.filter(Boolean).slice(0, 5);
  const q = keywordTokens.length ? keywordTokens.join(' ') : qList[0] ?? input.userQuestion.trim();
  const timeline: DiscoveryTimelineItem[] = [
    {
      stage: 'queued',
      status: 'completed',
      message: `真实检索任务入队。LLM 检索式：${qList.join(' / ') || q}`,
      timestamp: Date.now(),
    },
    { stage: 'searching', status: 'running', message: '多源并行检索中', timestamp: Date.now() },
  ];
  const keywordTrace: ToolTraceItem = {
    id: 'real-keyword-parser',
    tool: 'keyword-parser',
    status: 'completed',
    summary: `source=${rewritten.queries.length > 0 ? 'llm.rewrite' : fallbackKeywordPlan.source}; 最终关键词=${keywordTokens.join(' / ') || '-'}`,
  };
  const rewriterTrace: ToolTraceItem | null =
    rewritten.queries.length > 0
      ? {
          id: 'real-query-rewriter',
          tool: 'query-rewriter',
          status: 'completed',
          summary: `queries=${qList.length}; first="${qList[0]?.slice(0, 36) || '-'}`,
        }
      : null;
  input.onProgress?.({
    timeline: [...timeline],
    candidatePool: [],
    toolTrace: rewriterTrace ? [rewriterTrace, keywordTrace] : [keywordTrace],
  });

  const partialCandidates: RetrievedItem[] = [];
  const partialToolTrace: ToolTraceItem[] = [];
  const runSourceRound = async (queries: string[], round: number, per: number) => {
    const sourceTasks: Array<{
      key: SourceKind;
      tool: string;
      run: () => Promise<RetrievedItem[]>;
    }> = [
      {
        key: 'crossref',
        tool: 'crossref',
        run: () => Promise.all(queries.map((qq) => searchCrossref(qq, per))).then((xs) => xs.flat()),
      },
      {
        key: 'openalex',
        tool: 'openalex',
        run: () => Promise.all(queries.map((qq) => searchOpenAlex(qq, per))).then((xs) => xs.flat()),
      },
      {
        key: 'arxiv',
        tool: 'arxiv',
        run: () => Promise.all(queries.map((qq) => searchArxiv(qq, per))).then((xs) => xs.flat()),
      },
      {
        key: 'semanticscholar',
        tool: 'semanticscholar',
        run: () => Promise.all(queries.map((qq) => searchSemanticScholar(qq, per))).then((xs) => xs.flat()),
      },
      {
        key: 'github',
        tool: 'github',
        run: () => Promise.all(queries.map((qq) => searchGitHub(qq, Math.min(10, per)))).then((xs) => xs.flat()),
      },
      {
        key: 'google',
        tool: 'google-cse',
        run: () => Promise.all(queries.map((qq) => searchGoogleCsePages(qq, 5))).then((xs) => xs.flat()),
      },
    ];
    const settled = await Promise.all(
      sourceTasks.map(async (task) => {
        try {
          const rows = await task.run();
          partialCandidates.push(...rows);
          partialToolTrace.push({
            id: `real-r${round}-${task.key}`,
            tool: `${task.tool}:round${round}`,
            status: 'completed',
            summary: `返回 ${rows.length} 条`,
          });
          const latest = rows[0];
          input.onProgress?.({
            candidatePool: [...partialCandidates]
              .sort((a, b) => b.credibility - a.credibility)
              .slice(0, 40)
              .map((x) => ({ title: x.title, type: x.type, source: x.source, url: x.url, credibility: x.credibility, reason: x.reason })),
            timeline: [
              timeline[0],
              {
                stage: 'searching',
                status: 'running',
                message: `Round ${round}: 已完成 ${task.tool}，累计抓取 ${partialCandidates.length} 条`,
                addedCount: partialCandidates.length,
                currentTitle: latest?.title,
                currentUrl: latest?.url,
                timestamp: Date.now(),
              },
            ],
            toolTrace: [...partialToolTrace],
          });
          return rows;
        } catch {
          partialToolTrace.push({
            id: `real-r${round}-${task.key}`,
            tool: `${task.tool}:round${round}`,
            status: 'failed',
            summary: '请求失败或被限流',
          });
          input.onProgress?.({ toolTrace: [...partialToolTrace] });
          return [] as RetrievedItem[];
        }
      })
    );
    return settled.flat();
  };

  const round1Queries = qList.length ? qList : [q];
  const round1Per = Math.max(4, Math.floor(perSource / Math.max(1, round1Queries.length)));
  const mergedRound1 = await runSourceRound(round1Queries, 1, round1Per);

  const rounds = Math.max(1, Math.min(input.rounds ?? 2, 3));
  let merged = [...mergedRound1];
  if (rounds >= 2) {
    const seedTitles = mergedRound1.slice(0, 12).map((x) => x.title).filter(Boolean);
    const round2Tokens = deriveTokensFromQueries(seedTitles, 10);
    const round2Queries = round2Tokens.length
      ? [
          `${round2Tokens.slice(0, 5).join(' ')} ${keywordTokens.slice(0, 2).join(' ')}`.trim(),
          `"${round2Tokens.slice(0, 2).join(' ')}" ${keywordTokens.slice(0, 4).join(' ')}`.trim(),
        ].filter(Boolean)
      : [];
    if (round2Queries.length) {
      timeline.push({
        stage: 'searching',
        status: 'running',
        message: `Round 2 滚雪球检索：${round2Queries.join(' / ')}`,
        timestamp: Date.now(),
      });
      const round2Per = Math.max(4, Math.floor(perSource / 2));
      const mergedRound2 = await runSourceRound(round2Queries, 2, round2Per);
      merged = [...merged, ...mergedRound2];
    }
  }
  const seen = new Set<string>();
  const deduped: RetrievedItem[] = [];
  let dedupedCount = 0;
  for (const item of merged) {
    const key = normalizeTitle(item.title);
    if (!key) continue;
    if (seen.has(key)) {
      dedupedCount += 1;
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }
  timeline[1] = {
    ...timeline[1],
    status: 'completed',
    addedCount: merged.length,
    message: `检索完成，共抓取 ${merged.length} 条`,
  };
  timeline.push({
    stage: 'deduping',
    status: 'completed',
    message: '去重完成',
    addedCount: merged.length,
    dedupedCount,
    dropReasons: ['标题重复'],
    timestamp: Date.now(),
  });
  timeline.push({
    stage: 'scoring',
    status: 'completed',
    message: '按来源可信度完成初评分',
    dropReasons: ['低质量来源剔除（本轮未启用硬阈值）'],
    timestamp: Date.now(),
  });
  const ranked = deduped
    .map((x) => {
      const rel = relevanceScore(keywordTokens, x.title, x.reason);
      const score = x.credibility * 0.55 + rel * 0.45;
      return { ...x, _rel: rel, _score: score };
    })
    .sort((a, b) => b._score - a._score);
  const strong = ranked.filter((x) => x._rel >= 25);
  const top = (strong.length >= 20 ? strong : ranked)
    .slice(0, 60)
    .map((x) => ({ title: x.title, type: x.type, source: x.source, url: x.url, credibility: x.credibility, reason: `${x.reason}（相关度 ${x._rel}）` }));
  timeline.push({
    stage: 'clustering',
    status: 'completed',
    message: '按来源类型进行轻量主题分组',
    timestamp: Date.now(),
  });
  timeline.push({
    stage: 'summarized',
    status: 'completed',
    message: `已形成候选池 ${top.length} 条`,
    timestamp: Date.now(),
  });

  const topicClusters = [
    `论文证据簇（${top.filter((x) => x.type === 'paper').length}）`,
    `报告/博客簇（${top.filter((x) => x.type === 'report' || x.type === 'blog').length}）`,
    `代码实现簇（${top.filter((x) => x.type === 'repo').length}）`,
  ];

  const evidenceList = top.slice(0, 15).map((x, i) => `${i + 1}. ${x.title}｜${x.source}｜可信度 ${x.credibility}`);
  const toolTrace: ToolTraceItem[] = partialToolTrace.length
    ? [...(rewriterTrace ? [rewriterTrace] : []), keywordTrace, ...partialToolTrace]
    : [...(rewriterTrace ? [rewriterTrace] : []), keywordTrace];

  const reasoningTrace = [
    `LLM 检索式：${qList.join(' / ') || '-'}`,
    `从检索式派生的关键词：${keywordTokens.join(' / ') || '-'}`,
    `已并行调用多源检索（检索式 ${qList.length} 条 × 多个源）`,
    `原始抓取 ${merged.length} 条，去重后 ${deduped.length} 条`,
    `按来源可信度与相关性排序，保留前 ${top.length} 条作为候选池`,
  ];

  return {
    candidatePool: top,
    evidenceList,
    topicClusters,
    timeline,
    toolTrace,
    reasoningTrace,
    keywordTokens,
    searchQueries,
  };
}

export async function classifyUserIntent(input: {
  text: string;
  currentAgent: 'general' | 'reading' | 'writing';
  /**
   * 当前是否处于「已打开/绑定某篇文献」的阅读会话（PDF、URL、图谱论文等）。
   * 为 true 时，对内容理解类追问应优先判为 reading，而非泛研究 general。
   */
  readingDocumentActive?: boolean;
  /** 可选：当前文献标题，供模型理解语境 */
  paperTitleHint?: string;
  /** 调试：当走 LLM 路由时回传原始模型输出 */
  onRouteRaw?: (raw: string) => void;
}): Promise<IntentRouteResult> {
  const text = input.text.trim();
  if (!text) {
    return { target: input.currentAgent, confidence: 0.4, reason: 'empty input' };
  }

  const researchDesignLike = /(访谈提纲|访谈流程|追问话术|研究提纲|问卷提纲|实验方案|研究方案|访谈问题|编码框架|采样方案)/.test(
    text
  );
  const strongWritingIntent = /(写一篇|帮我写|写作|润色|改写|写个|写文章|写论文|论文初稿|章节初稿|投稿稿|引言初稿|讨论部分初稿|扩写成文)/.test(
    text
  );

  // 阅读助手内已绑定文献时：内容理解、观点、概念类追问默认仍为 reading（避免被判成泛研究）
  if (
    input.currentAgent === 'reading' &&
    input.readingDocumentActive &&
    !strongWritingIntent
  ) {
    input.onRouteRaw?.(
      '（未调用模型）规则路由：阅读会话已绑定文献，追问默认 → reading'
    );
    return {
      target: 'reading',
      confidence: 0.93,
      reason: 'reading session with document (follow-up)',
    };
  }

  // Fast-path rules: document signals should strongly route to reading.
  if (/https?:\/\/\S+/.test(text) || /上传|pdf|doi|arxiv/i.test(text)) {
    input.onRouteRaw?.('（未调用模型）规则路由：检测到文档/链接信号 → reading');
    return { target: 'reading', confidence: 0.98, reason: 'document signal' };
  }
  if (researchDesignLike) {
    input.onRouteRaw?.('（未调用模型）规则路由：研究设计类提问（访谈/问卷/方案）→ general');
    return { target: 'general', confidence: 0.94, reason: 'research design intent' };
  }

  const readScore = /(阅读|精读|带我读|解读|读这篇|读论文|论文讲解|文献)/.test(text) ? 1 : 0;
  const writeScore = (/(写一篇|帮我写|写作|润色|改写|写个|写文章|写论文|论文初稿|章节初稿|投稿稿|引言初稿|讨论部分初稿|扩写成文)/.test(text) && !researchDesignLike) ? 1 : 0;
  if (readScore !== writeScore) {
    input.onRouteRaw?.('（未调用模型）规则路由：关键词打分 → ' + (readScore > writeScore ? 'reading' : 'writing'));
    return {
      target: readScore > writeScore ? 'reading' : 'writing',
      confidence: 0.9,
      reason: 'keyword score',
    };
  }

  const readingCtx =
    input.currentAgent === 'reading' && input.readingDocumentActive
      ? `\n重要语境：用户当前在阅读助手中且已打开文献${
          input.paperTitleHint ? `（标题含：${input.paperTitleHint.slice(0, 200)}）` : ''
        }。凡是对该文献内容、观点、概念、论证、结论的追问、深入理解，一律归为 reading，不要归为 general。仅当用户明显在讨论与当前文献无关的全新主题检索、或明确写作任务时，才考虑 writing / general。`
      : '';

  const routePrompt: Message[] = [
    {
      role: 'system',
      content: `你是意图路由器。请将用户输入分类到 reading / writing / general。
判定标准：
- reading：阅读、解读、分析文献论文、上传文献、DOI、arXiv、PDF相关；**在阅读助手已打开文献时，针对该文献的任何内容理解与追问也属于 reading**
- writing：真正进入成文写作（例如论文初稿、章节草稿、润色改写、投稿文本）；不包含研究设计型提纲
- general：研究规划与方法设计（如访谈提纲、访谈流程、追问话术、问卷/实验方案、变量与指标设计）${readingCtx}
返回严格 JSON：{"target":"reading|writing|general","confidence":0-1,"reason":"简短原因"}，不要其他文本。`,
    },
    { role: 'user', content: text },
  ];

  try {
    const raw = await chatCompletion(routePrompt, undefined, {
      agentName: OAH_AGENT_FRAMING,
      sessionScope: 'framing',
    });
    input.onRouteRaw?.(raw);
    const jsonCandidate = extractJsonObject(raw);
    if (!jsonCandidate) throw new Error('empty route json');
    const parsed = JSON.parse(jsonCandidate) as Partial<IntentRouteResult>;
    const target =
      parsed.target === 'reading' || parsed.target === 'writing' || parsed.target === 'general'
        ? parsed.target
        : input.currentAgent;
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.6;
    const reason = typeof parsed.reason === 'string' ? parsed.reason : 'llm classification';
    return { target, confidence, reason };
  } catch {
    return { target: input.currentAgent, confidence: 0.5, reason: 'fallback current agent' };
  }
}

/** 个人知识库助手：后端若无独立 agent，可与 general 共用 discovery 通道 */
export function buildPersonalKbChatPrompt(input: {
  userQuestion: string;
  history: { role: 'user' | 'assistant'; content: string }[];
}): Message[] {
  const system = `你是「个人知识库」专属助手。用户侧已聚合：浏览器内收藏的对话/消息片段、本机上传的 PDF（仅文件名与体量）、以及其它助手产出与检索结果的摘要（若有）。你**没有**直接访问用户磁盘或数据库的权限；请基于用户问题与对话中给出的统计或描述来回答。

输出格式（必须严格遵守，便于侧栏解析展示）：
- **只输出以下 Markdown 结构**，从第一行开始就是「## 」，前面不要任何开场白、括号说明或「好的」等套话。
- 按需选用小节标题（至少包含前 3 项；无内容的小节写「暂无」一行即可）：
## 一句话结论
（1～3 句）
## 结构化要点
- 使用无序列表，每条一行，条目化
## 建议与下一步
- 可执行步骤，带序号或列表
## 需用户补充（若有）
- 缺什么信息；若无则写：无

硬性要求：
- 用中文；不要编造用户未提供的论文标题或 DOI。
- **禁止**输出思考过程、推理链、XML/HTML 标签、\`<think>\` 等；只输出上述对用户可见的结构化正文。
- 列表与短句为主，避免长篇散文。`;

  return [
    { role: 'system', content: system },
    ...input.history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: input.userQuestion },
  ];
}

export function resolveOahAgentName(target: 'general' | 'reading' | 'writing' | 'personal_kb'): string {
  if (target === 'reading') return OAH_AGENT_READING;
  if (target === 'writing') return OAH_AGENT_WRITING;
  return OAH_AGENT_DISCOVERY;
}

export function getLiteratureReviewAgentName(): string {
  return OAH_AGENT_LITERATURE_REVIEW;
}

/** 综述大纲最多拆成多少节单独生成（避免过多请求） */
export const MAX_LITERATURE_OUTLINE_SECTIONS = 12;

export function buildLiteratureReviewPrompt(input: {
  question: string;
  taskCard?: {
    problemStatement?: string;
    rqList?: string[];
  } | null;
  candidates: Array<{
    title: string;
    source: string;
    reason: string;
    credibility: number;
    url?: string;
  }>;
  /**
   * 无 Discovery 检索结果时：输出综述框架、检索建议与研究维度，勿虚构具体论文条目。
   */
  topicOnly?: boolean;
  /**
   * 候选仅来自用户本机 PDF 文件名：method/data 等可标「待读全文」或基于标题的谨慎推断。
   */
  personalLibraryTitles?: boolean;
  /** 个人知识库 PDF 已解析后的摘要与片段；有则综述必须优先依据正文，而非仅文件名 */
  parsedLibraryDocuments?: PersonalLibraryParsedDocumentForReview[];
  /**
   * 为 true 时：只产出 relatedWork / gaps / summary / outline，**fullNarrative 必须为空字符串**；
   * 正文由前端按 outline 分节请求生成，保证与大纲一致。
   */
  structureOnly?: boolean;
}): Message[] {
  const sample = input.candidates.slice(0, 20).map((x, idx) => ({
    idx: idx + 1,
    title: x.title,
    source: x.source,
    reason: x.reason,
    credibility: x.credibility,
    url: x.url ?? '',
  }));
  const useStructureOnly = input.structureOnly !== false;

  const topicNote = input.topicOnly
    ? `\n【重要】当前无外部检索到的文献元数据。relatedWork 可为空数组；summary 与 gaps 中请给出：综述主题框架、建议检索关键词、可能的研究维度与后续阅读路线。不要编造不存在的论文标题。须给出可执行的 outline（4～12 条章节标题），fullNarrative 在分节模式下须为空字符串。`
    : '';
  const hasParsed =
    Array.isArray(input.parsedLibraryDocuments) &&
    input.parsedLibraryDocuments.some((d) => (d.excerptText?.trim() ?? '').length > 0 || (d.abstract?.trim() ?? '').length > 0);

  const libNoteParsedBody = useStructureOnly
    ? `
- 你必须**通读并整合**各篇解析摘录；JSON 必须**额外**包含：
  - "outline"：字符串数组，5～12 条，**章节标题顺序即综述叙述顺序**，每一节对应正文的一段主线（后续将按此顺序逐节生成正文，不得偏离）；
  - "fullNarrative"：必须为空字符串 ""（本次禁止输出综述长文；正文由系统在后续按 outline **逐节**单独请求生成）；
  - "summary"：200～400 字，概括综述主线与预期结论（供对话气泡）。`
    : `
- 你必须**通读并整合**各篇解析摘录，写出综述；JSON 必须**额外**包含：
  - "outline"：字符串数组，5～10 条，为可执行的章节级写作大纲；
  - "fullNarrative"：字符串，完整文献综述正文，分段落，不少于 600 汉字（若模型长度受限则不少于 400 字，末句可说明「其余章节可按 outline 续写」）；
  - "summary"：200～400 字，作为 fullNarrative 的精简版（供对话气泡）；若篇幅不足，summary 可与 fullNarrative 前 400 字等价缩写。`;

  const libNote = input.personalLibraryTitles
    ? hasParsed
      ? `
【个人知识库 / 已解析正文】下方「各篇解析内容」来自本机 PDF：优先远程解析服务返回的摘要与片段；若服务不可用或内容过少，前端会用 **PDF.js 在浏览器内抽取 PDF 文本层**（与远程结果合并标注）。扫描版/图片型 PDF 可能仍无可用文本。
硬性要求：
- 必须仅输出一段合法 JSON（顶层字段需齐全）。
- relatedWork 须与候选条数一致（${sample.length} 条），且**优先依据解析内容**填写 method/data/metric/limitation；仅当某字段在片段中确实未出现时填「片段中未涉及」或「待结合全文」。
- gaps 须体现多篇之间的对比与综合；**禁止**再说「需首先完成全文解析」类拒答（解析内容已提供）。
- **禁止**默认教育学/美育等学科，除非解析文本或用户问题中明确出现。
${libNoteParsedBody}`
      : `
【个人知识库 / 仅文件名模式】候选只有本地 PDF 文件名（可含 arXiv 编号等），无摘要与正文。
硬性要求（违反视为错误输出）：
- 必须仅输出一段合法 JSON，不得输出 JSON 外的长文说明。
- relatedWork 数组长度必须等于下方「候选文献」条数（${sample.length} 条），且顺序与候选一致：每条 title 使用对应候选的标题（去掉 .pdf）；一一对应，不得省略。
- method/data/metric/limitation 中凡无法从文件名可靠推断的，填「待读全文确认」；可另起简短附注写「从文件名推测：…（待核实）」，禁止留空字符串。
- gaps：3～8 条，应是「在仅知标题时可提出的对比维度、待核实问题、可能的研究空白」，不要写成工作流程说明，不要整段写「必须先全文解析才能综述」。
- summary：120～320 字，必须包含：① 基于文件名的初步主题/类型归类（可带「待核实」）；② 建议的阅读或对比顺序；③ 一句说明具体论点需打开 PDF 核对。禁止用 summary 全文拒绝服务、禁止只描述「无法分析」「不得臆造」而不给出表格数据。
- **禁止**在 summary/gaps 中写入「美育」「教育学」等学科词，除非用户问题或文件名明显包含相关线索；无线索时写「综述主题与学科边界待结合全文确认」。
- JSON 须含 "outline"（4～12 条章节标题）与 "fullNarrative"：${useStructureOnly ? '必须为空字符串 ""' : '可与大纲对应的长文'}。`
    : '';
  const globalOutlineRule = useStructureOnly
    ? `5) **outline**（必填）：4～12 条字符串，章节级标题，顺序即综述叙述顺序；须覆盖用户问题与文献对比主线。
6) **fullNarrative**（必填）：必须为空字符串 ""；**禁止**在本次 JSON 中写综述长文（正文由系统按 outline 分节生成，以保证与大纲一致）。`
    : `5) **outline**（必填）：4～12 条章节标题；**fullNarrative** 为完整综述正文，须严格按 outline 的顺序与分节展开，不得另起与大纲无关的平行结构。`;

  const systemBase = `你是文献综述助手（literature_review）。目标是把候选文献整理为 Related Work 结构化结果，并识别研究空白。
领域与主题以用户问题和候选文献标题为准；**不得**默认假设为教育学、美育或任何未在问题/标题中出现的学科；若领域不明确，在 summary 或 gaps 中写「领域待用户/全文确认」，不要臆造具体学科标签。
必须仅输出 JSON（不要 markdown，不要解释）：
{
  "relatedWork":[{"title":"","method":"","data":"","metric":"","limitation":"","source":"","url":""}],
  "gaps":[""],
  "summary":"",
  "outline":[""],
  "fullNarrative":""
}
要求：
1) 每篇文献尽量提炼 method/data/metric/limitation；
2) 做横向对比并给出 3-8 条 gap；
3) summary 120-400 字，聚焦可执行的 related work 结论或综述主线；
4) 不确定时用“未明确”“待读全文确认”而不是编造；
${globalOutlineRule}${topicNote}${libNote}`;

  let personalLibraryUserBlock = '';
  if (input.personalLibraryTitles && input.parsedLibraryDocuments?.length) {
    if (hasParsed) {
      personalLibraryUserBlock = `${input.parsedLibraryDocuments
        .map(
          (d, i) => `
--- 第 ${i + 1} 篇：${d.fileLabel} ---
${d.parseError ? `【解析失败】${d.parseError}` : ''}
${d.title ? `【题名】${d.title}` : ''}
${d.authors?.length ? `【作者】${d.authors.join('，')}` : ''}
${typeof d.year === 'number' ? `【年份】${d.year}` : ''}
${d.keywords?.length ? `【关键词】${d.keywords.join('；')}` : ''}
${d.abstract ? `【摘要】\n${d.abstract}` : ''}
${d.excerptText ? `【解析摘录（摘要+片段，已截断）】\n${d.excerptText}` : ''}
`
        )
        .join('\n')}
请严格输出 JSON：relatedWork 必须恰好 ${sample.length} 条且与候选顺序一致；内容须以上述解析摘录为主要依据。`;
    } else {
      const fails = input.parsedLibraryDocuments
        .map((d) => `${d.fileLabel}: ${d.parseError?.trim() || '无摘要/片段'}`)
        .join('；');
      personalLibraryUserBlock = `【PDF 解析说明】已尝试通过解析接口读取本机 PDF，但未得到可用正文或摘要。请仍按下方候选输出 JSON（method 等用「待读全文确认」），并在 summary 中简短说明：解析未成功、可检查解析服务或文件是否损坏。
失败概要：${fails}
请严格输出 JSON：relatedWork 必须恰好 ${sample.length} 条且与上述候选顺序一致。`;
    }
  } else if (input.personalLibraryTitles) {
    personalLibraryUserBlock = `请严格输出 JSON：relatedWork 必须恰好 ${sample.length} 条且与上述候选顺序一致。
【说明】当前模型侧仅收到文件名与上述元数据，**未**解析 PDF 正文；method 等字段请用「待读全文确认」，不要声称已完成全文解析。
【领域】勿默认教育学/美育；仅当用户问题或文件名可推断领域时再写入，否则用「领域待全文确认」。`;
  }

  return [
    {
      role: 'system',
      content: systemBase,
    },
    {
      role: 'user',
      content: `用户问题：${input.question}
任务卡：${JSON.stringify(input.taskCard ?? {})}
候选文献（共 ${sample.length} 条）：${JSON.stringify(sample)}
${personalLibraryUserBlock}`,
    },
  ];
}

export function parseLiteratureReviewResponse(raw: string): LiteratureReviewResult {
  const jsonCandidate = extractJsonObject(raw);
  if (!jsonCandidate) {
    return { relatedWork: [], gaps: [], summary: '' };
  }
  try {
    const parsed = JSON.parse(jsonCandidate) as Partial<LiteratureReviewResult>;
    const relatedWork = Array.isArray(parsed.relatedWork)
      ? parsed.relatedWork
          .filter((x): x is NonNullable<LiteratureReviewResult['relatedWork']>[number] => !!x && typeof x.title === 'string')
          .map((x) => ({
            title: sanitizeLine(x.title),
            method: sanitizeLine(typeof x.method === 'string' ? x.method : '未明确'),
            data: sanitizeLine(typeof x.data === 'string' ? x.data : '未明确'),
            metric: sanitizeLine(typeof x.metric === 'string' ? x.metric : '未明确'),
            limitation: sanitizeLine(typeof x.limitation === 'string' ? x.limitation : '未明确'),
            source: typeof x.source === 'string' ? x.source : '',
            url: typeof x.url === 'string' ? x.url : '',
          }))
      : [];
    const gaps = Array.isArray(parsed.gaps)
      ? normalizeList(parsed.gaps.filter((x): x is string => typeof x === 'string'))
      : [];
    const summary = sanitizeLine(typeof parsed.summary === 'string' ? parsed.summary : '');
    const outline = Array.isArray(parsed.outline)
      ? parsed.outline
          .filter((x): x is string => typeof x === 'string')
          .map((x) => sanitizeLine(x))
          .filter(Boolean)
      : undefined;
    const fullNarrative =
      typeof parsed.fullNarrative === 'string' && parsed.fullNarrative.trim()
        ? parsed.fullNarrative.trim()
        : undefined;
    return { relatedWork, gaps, summary, outline, fullNarrative };
  } catch {
    return { relatedWork: [], gaps: [], summary: '' };
  }
}

/** 去掉模型返回中的代码块围栏与多余前缀，得到纯文本段落 */
export function stripLiteratureModelPlainText(raw: string): string {
  let s = raw.trim();
  const fence = /^```(?:\w+)?\s*\r?\n([\s\S]*?)\r?\n```/;
  const m = s.match(fence);
  if (m) s = m[1]!.trim();
  s = s.replace(/^【?本节正文】?[：:\s]*/i, '').trim();
  s = stripInferenceAndThinkingFromProse(s);
  return s.trim();
}

function clipPromptField(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * 分节生成时：已写入的段落会作为下一节的「前文」。过长时做**确定性压缩**（非 LLM）：
 * 较早的节只保留标题行 + 正文前若干字；最近 1～2 节尽量保留全文，仍超长则截断尾部。
 */
export function compressLiteraturePreviousContext(
  accumulated: string,
  maxTotal = 4200,
  options?: { tailSectionsFull?: number; olderBodyChars?: number }
): string {
  const tailSectionsFull = options?.tailSectionsFull ?? 2;
  const olderBodyChars = options?.olderBodyChars ?? 200;

  const t = accumulated.trim();
  if (!t.length) return '';
  if (t.length <= maxTotal) return t;

  const blocks = t.split(/\n(?=###\s)/).map((x) => x.trim()).filter(Boolean);
  if (blocks.length <= 1) {
    return t.slice(-maxTotal);
  }

  const tailN = Math.min(tailSectionsFull, blocks.length);
  const tailBlocks = blocks.slice(-tailN);
  const oldBlocks = blocks.slice(0, -tailN);

  const compressedOld = oldBlocks
    .map((block) => {
      const lines = block.split('\n');
      const head = lines[0]?.trim() ?? '';
      const body = lines.slice(1).join('\n').replace(/\s+/g, ' ').trim();
      if (!body) return head;
      const short = body.length > olderBodyChars ? `${body.slice(0, olderBodyChars)}…` : body;
      return `${head}\n${short}`;
    })
    .join('\n\n');

  let merged = [compressedOld, ...tailBlocks].filter(Boolean).join('\n\n');
  if (merged.length <= maxTotal) return merged;

  const harderOld = oldBlocks
    .map((block) => {
      const lines = block.split('\n');
      const head = lines[0]?.trim() ?? '';
      const body = lines.slice(1).join('\n').replace(/\s+/g, ' ').trim();
      const short = body.length > 100 ? `${body.slice(0, 100)}…` : body;
      return short ? `${head}\n${short}` : head;
    })
    .join('\n\n');
  merged = [harderOld, ...tailBlocks].filter(Boolean).join('\n\n');
  if (merged.length <= maxTotal) return merged;

  const last = tailBlocks[tailBlocks.length - 1] ?? '';
  if (tailBlocks.length >= 2) {
    const prevFull = tailBlocks[tailBlocks.length - 2] ?? '';
    const budget = Math.max(800, maxTotal - harderOld.length - 200);
    const pair = `${prevFull}\n\n${last}`;
    if (pair.length <= budget) {
      merged = [harderOld, pair].filter(Boolean).join('\n\n');
    } else {
      merged = [harderOld, last.slice(-Math.min(last.length, budget))].filter(Boolean).join('\n\n');
    }
  } else {
    merged = [harderOld, last].filter(Boolean).join('\n\n');
  }
  if (merged.length <= maxTotal) return merged;
  return merged.slice(-maxTotal);
}

function compactRelatedWorkForSectionPrompt(relatedWork: LiteratureReviewResult['relatedWork']): string {
  if (!relatedWork.length) return '（暂无结构化文献条目；请基于用户问题写该节框架性论述，勿编造具体论文。）';
  const MAX_PAPERS = 14;
  return relatedWork
    .slice(0, MAX_PAPERS)
    .map((r, i) => {
      const row = `[${i + 1}] ${clipPromptField(r.title, 200)}\n  方法：${clipPromptField(r.method, 100)}；数据：${clipPromptField(r.data, 100)}；指标：${clipPromptField(r.metric, 80)}；局限：${clipPromptField(r.limitation, 120)}`;
      return clipPromptField(row, 450);
    })
    .join('\n');
}

export function buildLiteratureReviewSectionPrompt(input: {
  question: string;
  taskCard?: { problemStatement?: string; rqList?: string[] } | null;
  outline: string[];
  sectionIndex: number;
  previousSectionsText: string;
  relatedWorkDigest: string;
  topicOnly: boolean;
}): Message[] {
  const total = input.outline.length;
  const title = input.outline[input.sectionIndex] ?? `第 ${input.sectionIndex + 1} 节`;
  const outlineList = input.outline.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const prev = input.previousSectionsText.trim();
  const qShort = clipPromptField(input.question, 2000);
  return [
    {
      role: 'system',
      content:
        '你是文献综述写作助手。可先充分理解文献与大纲再落笔。对用户**可见的输出**仅含本节综述正文（可分段），对照下方文献表（可用 [序号] 指代）。勿在输出中写入推理过程、解题说明或 XML/标签；勿写其它节；勿 JSON。约 200～900 字。',
    },
    {
      role: 'user',
      content: `用户问题：${qShort}
任务卡（节选）：${JSON.stringify(input.taskCard ?? {})}
${input.topicOnly ? '\n【说明】当前可能缺少外部文献条目：本节可写检索策略、维度框架或待验证命题，勿虚构论文。\n' : ''}
完整写作大纲（共 ${total} 节；**当前只写第 ${input.sectionIndex + 1} 节**）：
${outlineList}

前文已生成内容（较早节可能已压缩为摘要；用于衔接与避免重复，请勿整段复述）：
${prev || '（本节为首节，无前文。）'}

文献对比表（related work）：
${input.relatedWorkDigest}

当前节序号：${input.sectionIndex + 1} / ${total}
当前节标题：「${title}」

请直接输出本节正文。`,
    },
  ];
}

export function buildLiteratureReviewNarrativeFallbackPrompt(input: {
  question: string;
  taskCard?: { problemStatement?: string; rqList?: string[] } | null;
  relatedWorkDigest: string;
  gapsDigest: string;
  summary: string;
  topicOnly: boolean;
}): Message[] {
  return [
    {
      role: 'system',
      content: `你是文献综述写作助手。当前没有可用的分节大纲或大纲为空。请基于文献对比与 gaps 写出**一篇连贯的文献综述正文**（中文），分段落，不要输出 JSON。勿编造未在对比表中出现的论文标题。对用户可见输出仅为综述正文；勿将推理过程、标签或元话语写入正文。`,
    },
    {
      role: 'user',
      content: `用户问题：${input.question}
任务卡：${JSON.stringify(input.taskCard ?? {})}

研究空白（gaps）：
${input.gapsDigest}

综述摘要线索：${input.summary}

文献对比表：
${input.relatedWorkDigest}
${input.topicOnly ? '\n【说明】若文献为空：请写主题框架、建议检索词与可能的研究维度，勿虚构论文。\n' : ''}
请输出完整综述正文。`,
    },
  ];
}

export async function expandLiteratureReviewNarrative(input: {
  review: LiteratureReviewResult;
  question: string;
  taskCard?: { problemStatement?: string; rqList?: string[] } | null;
  topicOnly: boolean;
  signal?: AbortSignal;
  /**
   * 本轮综述唯一键（建议与 AIChat 的 runId 一致）。
   * 每节使用独立 sessionScope，避免共用同一 literature_review 时会话上下文无限膨胀导致请求失败。
   */
  narrativeRunKey: string;
  onSectionProgress?: (index: number, total: number, title: string) => void;
  /** 每完成一节（或 fallback 整篇）后回调，便于侧栏实时展示综述正文 */
  onSectionComplete?: (accumulatedNarrative: string, sectionIndex: number, totalSections: number) => void;
}): Promise<string> {
  const outlineRaw = input.review.outline?.filter((x) => x.trim()) ?? [];
  const outline =
    outlineRaw.length > MAX_LITERATURE_OUTLINE_SECTIONS
      ? outlineRaw.slice(0, MAX_LITERATURE_OUTLINE_SECTIONS)
      : outlineRaw;
  const digest = compactRelatedWorkForSectionPrompt(input.review.relatedWork);

  const agentName = getLiteratureReviewAgentName();
  const scopeSafe = `litrev_${input.narrativeRunKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  if (outline.length === 0) {
    const raw = await chatCompletion(
      buildLiteratureReviewNarrativeFallbackPrompt({
        question: clipPromptField(input.question, 2000),
        taskCard: input.taskCard,
        relatedWorkDigest: digest,
        gapsDigest: clipPromptField(input.review.gaps.join('\n'), 2800),
        summary: clipPromptField(input.review.summary, 1200),
        topicOnly: input.topicOnly,
      }),
      undefined,
      { agentName, sessionScope: `${scopeSafe}_fb`, signal: input.signal, finalOnly: true }
    );
    const full = stripLiteratureModelPlainText(raw);
    input.onSectionComplete?.(full, 0, 1);
    return full;
  }

  const parts: string[] = [];
  let previous = '';
  for (let i = 0; i < outline.length; i++) {
    input.signal?.throwIfAborted();
    input.onSectionProgress?.(i, outline.length, outline[i] ?? '');
    const raw = await chatCompletion(
      buildLiteratureReviewSectionPrompt({
        question: clipPromptField(input.question, 2000),
        taskCard: input.taskCard,
        outline,
        sectionIndex: i,
        previousSectionsText: compressLiteraturePreviousContext(previous),
        relatedWorkDigest: digest,
        topicOnly: input.topicOnly,
      }),
      undefined,
      { agentName, sessionScope: `${scopeSafe}_s${i}`, signal: input.signal, finalOnly: true }
    );
    const sectionBody = stripLiteratureModelPlainText(raw);
    const heading = `### ${i + 1}. ${outline[i]}`;
    const block = `${heading}\n\n${sectionBody}`;
    parts.push(block);
    previous = `${previous}\n\n${block}`.trim();
    input.onSectionComplete?.(parts.join('\n\n'), i, outline.length);
  }
  return parts.join('\n\n');
}

export function buildLiteratureSelectionPolishPrompt(input: {
  selectedText: string;
  surroundingContext: string;
  mode: 'polish' | 'rewrite';
}): Message[] {
  const modeHint =
    input.mode === 'rewrite'
      ? '请**重写**选中文本：可调整论证顺序与句式，但必须保留原意与文献引用关系，不得新增未在上下文中出现的论文或事实。'
      : '请**润色**选中文本：改进表述、衔接与学术语气，保留原意与引用关系，不新增文献事实。';
  return [
    {
      role: 'system',
      content: `你是学术中文写作助手。${modeHint}
只输出替换后的段落正文，不要加引号包裹，不要前言后语。`,
    },
    {
      role: 'user',
      content: `【全文局部上下文（仅供理解衔接）】\n${input.surroundingContext.slice(0, 6000)}\n\n【待处理的选中文本】\n${input.selectedText}`,
    },
  ];
}

export type NormalizePersonalLibraryLitReviewOptions = {
  /** 至少一篇 PDF 已成功解析出摘要/片段：勿用「仅文件名」模板覆盖模型摘要 */
  hadSuccessfulParse?: boolean;
};

/**
 * 个人知识库：对齐 relatedWork 行数；仅在「仅文件名、模型又拒答」时用兜底文案替换 summary。
 */
export function normalizePersonalLibraryLiteratureReview(
  result: LiteratureReviewResult,
  candidates: Array<{ title: string; source?: string; url?: string }>,
  options?: NormalizePersonalLibraryLitReviewOptions
): LiteratureReviewResult {
  const stub = (c: { title: string; source?: string; url?: string }) => {
    const t = sanitizeLine(c.title.replace(/\.pdf$/i, ''));
    return {
      title: t || '未命名文献',
      method: '待读全文确认',
      data: '待读全文确认',
      metric: '待读全文确认',
      limitation: '待读全文确认',
      source: c.source || '个人知识库',
      url: c.url || '',
    };
  };
  const norm = (s: string) => sanitizeLine(s.replace(/\.pdf$/i, '')).toLowerCase();

  const pool = candidates.slice(0, 20);
  if (pool.length === 0) return result;

  const used = new Set<number>();
  const rows: LiteratureReviewResult['relatedWork'] = [];
  for (const c of pool) {
    const cn = norm(c.title);
    let bestIdx = -1;
    result.relatedWork.forEach((r, i) => {
      if (used.has(i) || bestIdx >= 0) return;
      const rn = norm(r.title);
      if (!rn || !cn) return;
      if (rn === cn || rn.includes(cn) || cn.includes(rn)) {
        bestIdx = i;
      }
    });
    if (bestIdx >= 0) {
      used.add(bestIdx);
      const best = result.relatedWork[bestIdx]!;
      const title = sanitizeLine(best.title.replace(/\.pdf$/i, '')) || stub(c).title;
      rows.push({
        ...best,
        title,
        method: (best.method && best.method.trim()) || '待读全文确认',
        data: (best.data && best.data.trim()) || '待读全文确认',
        metric: (best.metric && best.metric.trim()) || '待读全文确认',
        limitation: (best.limitation && best.limitation.trim()) || '待读全文确认',
        source: best.source || c.source || '个人知识库',
        url: best.url || c.url || '',
      });
    } else {
      rows.push(stub(c));
    }
  }

  const hasSubstantiveOutput =
    Boolean(result.fullNarrative?.trim()) ||
    (result.outline && result.outline.length > 0) ||
    (result.summary.trim().length >= 40 && !/^已根据个人知识库 \d+ 个 PDF 文件名/.test(result.summary.trim()));

  const refusalLike =
    !options?.hadSuccessfulParse &&
    !hasSubstantiveOutput &&
    (!result.summary.trim() ||
      /需首先完成全文|初步[^\n]{0,24}文献综述|无任何主题|不得无依据|无法在此阶段|拒绝生成|臆造|确认所有文献是否属于|美育研究范畴/i.test(
        result.summary
      ));

  let summary = result.summary.trim();
  if (options?.hadSuccessfulParse && !summary && result.fullNarrative?.trim()) {
    summary = result.fullNarrative.trim().slice(0, 520) + (result.fullNarrative.length > 520 ? '…' : '');
  }

  if (refusalLike && rows.length > 0 && !options?.hadSuccessfulParse) {
    const preview = rows
      .map((r) => r.title)
      .join('、')
      .slice(0, 220);
    summary = `已根据个人知识库 ${rows.length} 个 PDF 文件名生成结构化对比表；method/数据等暂标「待读全文确认」。建议先按文件名关键词粗分主题，再逐篇在阅读助手中打开核对。文献：${preview}${preview.length >= 220 ? '…' : ''}。范畴归属与细粒度观点需全文验证后再定稿。`;
  }

  let gaps = [...result.gaps];
  if (gaps.length < 3) {
    const fill = [
      '各篇与综述主题的相关性需结合摘要/引言核对',
      '方法、样本与测量指标需全文提取后方可横向对比',
      '理论框架与结论适用边界需在通读后明确',
    ];
    for (const f of fill) {
      if (gaps.length >= 6) break;
      if (!gaps.some((g) => g.slice(0, 8) === f.slice(0, 8))) gaps.push(f);
    }
  }

  return {
    relatedWork: rows,
    gaps,
    summary,
    outline: result.outline,
    fullNarrative: result.fullNarrative,
  };
}

export function buildFramingTaskPrompt(input: {
  userQuestion: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Message[] {
  return [
    {
      role: 'system',
      content: `你是研究问题框定助手（framing）。
请把用户输入转成可执行的研究任务卡。

你可以在标签外输出简短说明，但任务卡必须严格按以下格式输出（不要 markdown 代码块）：
<TASK_CARD_JSON>
{
  "problemStatement":"一句话问题陈述",
  "rqList":["研究问题1","研究问题2"],
  "scopeInclude":["包含范围"],
  "scopeExclude":["排除范围"],
  "constraints":["数据/时间/方法约束"],
  "successCriteria":["可衡量验收标准"]
}
</TASK_CARD_JSON>

硬性规则：
1) <TASK_CARD_JSON> 标签块必须且只能出现一次；
2) 标签块内部只能是 JSON 对象，不得包含解释文本；
3) 字段值只允许内容，不得包含字段名、JSON 片段、思考过程、提示词复述；
4) 信息不足时数组可以为空，禁止编造。`,
    },
    ...input.history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: input.userQuestion },
  ];
}

/** 生成面向用户展示的长文式研究规划思考（多段自然语言，非 JSON） */
export function buildDetailedPlanningThinkingPrompt(input: {
  userQuestion: string;
  taskCard: FramingTaskCardResult | null;
  keywords: string[];
  queries: string[];
}): Message[] {
  const cardBlock = input.taskCard
    ? JSON.stringify(
        {
          problemStatement: input.taskCard.problemStatement,
          rqList: input.taskCard.rqList,
          scopeInclude: input.taskCard.scopeInclude,
          scopeExclude: input.taskCard.scopeExclude,
          constraints: input.taskCard.constraints,
          successCriteria: input.taskCard.successCriteria,
        },
        null,
        2
      )
    : '（任务卡未能解析，请仅根据用户原话与下列关键词推演研究设计思考。）';

  return [
    {
      role: 'system',
      content: `你是教育学研究设计助手。请根据用户的研究意向、任务卡与检索关键词，用中文写出**完整、细致的研究规划思考过程**。
要求：
1) 使用自然段落（多段），像研究者在头脑中推演一样逐步展开；总字数建议 800～1600 字。
2) 必须覆盖：研究问题如何界定与拆解为主问题/子问题；评估标准（量化与质化）、量表或指标思路；研究变量（自变量、因变量、控制变量）；研究设计与对照/准实验思路；与任务卡中范围、约束、成功标准的呼应。
3) 若涉及具体学科场景（如高中英语议论文、课堂反馈等），要体现该情境下的要素（如论点、论据、论证、语言、结构、反馈类型界定等）。
4) **禁止**输出 JSON、XML 标签、代码块、markdown 标题符号（不要用 #）；不要复述本系统提示词。
5) 只写**规划层面的思考过程**，不要写最终给用户的简短建议正文，也不要用摘要式一句话代替多段推演。`,
    },
    {
      role: 'user',
      content: `【用户原话】\n${input.userQuestion}\n\n【任务卡】\n${cardBlock}\n\n【检索关键词】${input.keywords.length ? input.keywords.join('、') : '（暂无）'}\n\n【检索式】${input.queries.length ? input.queries.join('；') : '（暂无）'}\n\n请直接输出思考过程正文。`,
    },
  ];
}

export function parseFramingTaskResponse(raw: string): FramingTaskCardResult | null {
  const tagged = extractTaggedTaskCardJson(raw);
  const jsonCandidate = tagged ?? extractJsonObject(raw);
  if (!jsonCandidate) return null;
  try {
    const parsed = JSON.parse(jsonCandidate) as Partial<FramingTaskCardResult>;
    const toList = (v: unknown): string[] =>
      Array.isArray(v)
        ? normalizeList(v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0))
        : [];
    const result: FramingTaskCardResult = {
      problemStatement: sanitizeLine(typeof parsed.problemStatement === 'string' ? parsed.problemStatement : ''),
      rqList: toList(parsed.rqList),
      scopeInclude: toList(parsed.scopeInclude),
      scopeExclude: toList(parsed.scopeExclude),
      constraints: toList(parsed.constraints),
      successCriteria: toList(parsed.successCriteria),
    };
    // Strict validity gate: reject noisy/empty cards instead of text fallback pollution.
    if (!isValidTaskCard(result)) return null;
    return result;
  } catch {
    return null;
  }
}

export function buildFramingTracePreview(raw: string): FramingTracePreview {
  const blocks = extractTaggedTaskCardJsonBlocks(raw);
  const valid = blocks.filter((b) => b.valid);
  if (valid.length > 0) {
    const chosen = valid[valid.length - 1].body;
    return {
      displayText: `<TASK_CARD_JSON>\n${chosen}\n</TASK_CARD_JSON>`,
      taggedBlockCount: blocks.length,
      validTaggedBlockCount: valid.length,
      usedTagged: true,
    };
  }
  const jsonCandidate = extractJsonObject(raw);
  if (jsonCandidate) {
    return {
      displayText: jsonCandidate,
      taggedBlockCount: blocks.length,
      validTaggedBlockCount: 0,
      usedTagged: false,
    };
  }
  return {
    displayText: raw.trim(),
    taggedBlockCount: blocks.length,
    validTaggedBlockCount: 0,
    usedTagged: false,
  };
}

function extractTaggedTaskCardJson(raw: string): string | null {
  const valid = extractTaggedTaskCardJsonBlocks(raw)
    .filter((x) => x.valid)
    .map((x) => x.body);
  if (!valid.length) return null;
  // Prefer the last valid tagged block, which is usually the corrected final output.
  return valid[valid.length - 1];
}

function extractTaggedTaskCardJsonBlocks(raw: string): Array<{ body: string; valid: boolean }> {
  const re = /<TASK_CARD_JSON>\s*([\s\S]*?)\s*<\/TASK_CARD_JSON>/gi;
  const out: Array<{ body: string; valid: boolean }> = [];
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(raw)) !== null) {
    const body = m[1]?.trim();
    if (!body) continue;
    let valid = false;
    try {
      JSON.parse(body);
      valid = true;
    } catch {
      valid = false;
    }
    out.push({ body, valid });
  }
  return out;
}

function isValidTaskCard(card: FramingTaskCardResult): boolean {
  const hasContent =
    !!card.problemStatement ||
    card.rqList.length > 0 ||
    card.scopeInclude.length > 0 ||
    card.scopeExclude.length > 0 ||
    card.constraints.length > 0 ||
    card.successCriteria.length > 0;
  if (!hasContent) return false;
  const noisy = (x: string) =>
    !x ||
    isMetaReasoningText(x) ||
    /^"?[a-zA-Z]+List"?\s*:/.test(x) ||
    /<TASK_CARD_JSON>|<\/TASK_CARD_JSON>/.test(x);
  if (noisy(card.problemStatement)) return false;
  for (const arr of [card.rqList, card.scopeInclude, card.scopeExclude, card.constraints, card.successCriteria]) {
    if (arr.some(noisy)) return false;
  }
  return true;
}

function sanitizeLine(input: string): string {
  return input
    .replace(/^[-*•\d\.\)\s]+/, '')
    .replace(/^"?problemStatement"?\s*:\s*"?/i, '')
    .replace(/^"?rqList"?\s*:\s*\[?\s*$/i, '')
    .replace(/^"?scopeInclude"?\s*:\s*\[?\s*$/i, '')
    .replace(/^"?scopeExclude"?\s*:\s*\[?\s*$/i, '')
    .replace(/^"?constraints"?\s*:\s*\[?\s*$/i, '')
    .replace(/^"?successCriteria"?\s*:\s*\[?\s*$/i, '')
    .replace(/^["'`]/, '')
    .replace(/["'`,\s]*$/, '')
    .replace(/^\s*[\[\]]\s*$/, '')
    .trim();
}

function normalizeList(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = sanitizeLine(raw);
    if (!item) continue;
    // Filter out raw JSON key lines and obvious non-content artifacts
    if (/^"?[a-zA-Z]+List"?\s*:/.test(item)) continue;
    if (item === '[' || item === ']') continue;
    if (isMetaReasoningText(item)) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function isMetaReasoningText(text: string): boolean {
  return /严格JSON|不要有多余|markdown|语法错误|引号|逗号|现在输出|先回忆|对吧|思考过程|格式正确|字段类型|检查/.test(text);
}

type ExtractJsonMode = 'generic' | 'preferAnswerLast';

function extractJsonObject(raw: string, mode: ExtractJsonMode = 'generic'): string | null {
  const trimmed = unwrapMarkdownJsonBlocks(raw);
  if (!trimmed) return null;
  // Fast path
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      // continue to balanced scan
    }
  }
  // Balanced brace scan to avoid greedy regex capturing extra text.
  const candidates: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        candidates.push(trimmed.slice(start, i + 1));
        start = -1;
      }
      if (depth < 0) depth = 0;
    }
  }
  const parsedCandidates = candidates.filter((c) => {
    try {
      JSON.parse(c);
      return true;
    } catch {
      return false;
    }
  });
  if (!parsedCandidates.length) return null;
  const preferredFraming = parsedCandidates.find((c) =>
    /"problemStatement"|"rqList"|"scopeInclude"|"successCriteria"/.test(c)
  );
  if (preferredFraming) return preferredFraming;

  if (mode === 'preferAnswerLast') {
    const withAnswer = parsedCandidates.filter((c) => {
      try {
        const o = JSON.parse(c) as Record<string, unknown>;
        return typeof o.answer === 'string';
      } catch {
        return false;
      }
    });
    if (withAnswer.length) return withAnswer[withAnswer.length - 1];
    return parsedCandidates[parsedCandidates.length - 1];
  }

  return parsedCandidates[0];
}

function chunkTextForEvidence(text: string, maxChunk: number): string[] {
  const t = text.trim();
  if (!t) return [];
  const out: string[] = [];
  for (let i = 0; i < t.length; i += maxChunk) {
    out.push(t.slice(i, i + maxChunk));
  }
  return out.slice(0, 36);
}

/**
 * 无远程文献解析服务时使用：用 PDF.js 在浏览器内抽取文本层，并包装为 ParsedDocumentResult。
 * 扫描版/图片 PDF 可能无文本层，将抛出明确错误。
 */
async function parsePdfFileWithBrowserPdfJs(file: File, previewUrl: string): Promise<ParsedDocumentResult> {
  const text = await extractPdfTextInBrowser(file, 200_000);
  const chunks = chunkTextForEvidence(text, 3500);
  const evidenceRefs: EvidenceRef[] = chunks.map((snippet, idx) => ({
    id: `pdfjs-${idx + 1}`,
    label: `文本段 ${idx + 1}`,
    snippet,
  }));
  const abstract = text.slice(0, 1500).trim();
  const hasAbstract = abstract.length > 40;
  const hasEvidence = evidenceRefs.some((e) => e.snippet.trim().length > 80);
  if (!hasAbstract && !hasEvidence) {
    throw new Error(
      '浏览器 PDF.js 未提取到有效文本（常见于扫描版/图片型 PDF）。可启用 OCR、或接入远程文献解析 API。'
    );
  }
  const baseTitle = file.name.replace(/\.pdf$/i, '');
  return {
    title: baseTitle,
    previewUrl,
    meta: {
      title: baseTitle,
      authors: [],
      keywords: [],
      abstract: hasAbstract ? abstract : undefined,
    },
    evidenceRefs,
  };
}

export async function parseDocumentSource(input: {
  type: 'url' | 'file';
  value: string | File;
}): Promise<ParsedDocumentResult> {
  if (input.type === 'url') {
    const res = await checkedFetch(OAH_DOC_PARSE_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceUrl: String(input.value) }),
    }, '文献解析接口');
    const data = (await res.json()) as Record<string, unknown>;
    const normalized = normalizeParsedDocument(data, String(input.value), String(input.value));
    assertParsedResult(normalized);
    return normalized;
  }

  const file = input.value as File;
  const previewUrl = URL.createObjectURL(file);

  if (OAH_DOC_PARSE_DISABLED) {
    return parsePdfFileWithBrowserPdfJs(file, previewUrl);
  }

  try {
    const form = new FormData();
    form.append('file', file);
    const res = await checkedFetch(OAH_DOC_PARSE_API, { method: 'POST', body: form }, '文献解析接口');
    const data = (await res.json()) as Record<string, unknown>;
    const normalized = normalizeParsedDocument(data, previewUrl, file.name);
    assertParsedResult(normalized);
    return normalized;
  } catch (firstErr) {
    const remoteMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    try {
      return await parsePdfFileWithBrowserPdfJs(file, previewUrl);
    } catch (localErr) {
      const localMsg = localErr instanceof Error ? localErr.message : String(localErr);
      throw new Error(`文献解析接口失败：${remoteMsg}；本地 PDF.js 兜底失败：${localMsg}`);
    }
  }
}

function assertParsedResult(result: ParsedDocumentResult): void {
  const hasMeta =
    !!result.meta.title ||
    result.meta.authors.length > 0 ||
    result.meta.keywords.length > 0 ||
    !!result.meta.abstract;
  const hasEvidence = result.evidenceRefs.length > 0;
  if (!hasMeta && !hasEvidence) {
    throw new Error('解析成功但返回为空，请确认后端是否返回结构化字段(chunks/title/abstract)');
  }
}

function normalizeParsedDocument(
  raw: Record<string, unknown>,
  fallbackPreviewUrl: string,
  fallbackTitle: string
): ParsedDocumentResult {
  const root = (raw.data && typeof raw.data === 'object' ? raw.data : raw) as Record<string, unknown>;
  const possibleChunks =
    (Array.isArray(root.chunks) ? root.chunks : undefined) ??
    (Array.isArray(root.segments) ? root.segments : undefined) ??
    (Array.isArray(root.paragraphs) ? root.paragraphs : undefined) ??
    (Array.isArray(root.items) ? root.items : undefined) ??
    [];

  const evidenceRefs: EvidenceRef[] = possibleChunks.slice(0, 12).map((item, idx) => {
    const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    return {
      id: typeof row.id === 'string' ? row.id : `ev-${idx + 1}`,
      label:
        (typeof row.section === 'string' && row.section) ||
        (typeof row.heading === 'string' && row.heading) ||
        `片段 ${idx + 1}`,
      snippet:
        (typeof row.text === 'string' && row.text) ||
        (typeof row.content === 'string' && row.content) ||
        '',
      page:
        typeof row.page === 'number'
          ? row.page
          : (typeof row.pageIndex === 'number' ? row.pageIndex + 1 : undefined),
    };
  });

  return {
    title:
      (typeof root.title === 'string' && root.title) ||
      (typeof root.paperTitle === 'string' && root.paperTitle) ||
      fallbackTitle,
    previewUrl:
      (typeof root.previewUrl === 'string' && root.previewUrl) ||
      (typeof root.url === 'string' && root.url) ||
      fallbackPreviewUrl,
    meta: {
      title:
        (typeof root.title === 'string' && root.title) ||
        (typeof root.paperTitle === 'string' && root.paperTitle) ||
        fallbackTitle,
      authors: Array.isArray(root.authors)
        ? root.authors.filter((x): x is string => typeof x === 'string')
        : [],
      institution: typeof root.institution === 'string' ? root.institution : undefined,
      year: typeof root.year === 'number' ? root.year : undefined,
      doi: typeof root.doi === 'string' ? root.doi : undefined,
      keywords: Array.isArray(root.keywords)
        ? root.keywords.filter((x): x is string => typeof x === 'string')
        : [],
      abstract:
        (typeof root.abstract === 'string' && root.abstract) ||
        (typeof root.summary === 'string' ? root.summary : undefined),
      journal: typeof root.journal === 'string' ? root.journal : undefined,
    },
    evidenceRefs,
  };
}
