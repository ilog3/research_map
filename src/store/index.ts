import { create } from 'zustand';
import type {
  Paper,
  Cluster,
  AgentMode,
  ReadingDepth,
  ReadingSession,
  RightPanelCard,
  EvidenceRef,
  ToolTraceItem,
  ParsedPaperMeta,
  ChatMessage,
  ChatThread,
  AssistantAgent,
  ModelDebugEntry,
  AgentRunState,
  ResearchTaskCard,
  DiscoveryCandidateItem,
  RelatedWorkOutput,
  ReadingSuspendedSnapshot,
  ThreadWorkspaceSnapshot,
  PersonalKbWorkbenchSnapshot,
  RetrievalPreviewMeta,
} from '../types';
import papersData from '../data/papers.json';
import clustersData from '../data/clusters.json';

interface AppState {
  papers: Paper[];
  clusters: Cluster[];

  selectedPaperId: string | null;
  hoveredPaperId: string | null;

  visibleClusterIds: Set<number>;
  yearRange: [number, number];
  searchQuery: string;
  searchResults: Set<string> | null;

  viewMode: '2d' | '3d';
  agentMode: AgentMode;
  reasoningLevel: 'minimal' | 'full';
  rightPanelCards: RightPanelCard[];
  rightPanelFocusCard: RightPanelCard | null;
  rightPanelFocusStage: 'Plan' | 'Search' | 'Code' | 'Synthesize' | 'Critic' | null;
  retrievalPreviewMeta: RetrievalPreviewMeta | null;
  retrievalPreviewByThread: Record<string, RetrievalPreviewMeta | null>;
  rightPanelByThread: Record<string, RightPanelCard[]>;
  readingSession: ReadingSession;
  chatThreads: ChatThread[];
  activeThreadId: string;
  activeAgent: AssistantAgent;
  writingTask: string;
  writingMaterial: string;
  writingOutline: string[];
  writingDraft: string;
  agentRunState: AgentRunState;
  researchTaskCard: ResearchTaskCard;
  researchTaskByThread: Record<string, ResearchTaskCard>;
  discoveryCandidatePool: DiscoveryCandidateItem[];
  discoveryEvidenceList: string[];
  discoveryTopicClusters: string[];
  discoveryByThread: Record<string, {
    candidatePool: DiscoveryCandidateItem[];
    evidenceList: string[];
    topicClusters: string[];
  }>;
  agentRunByThread: Record<string, AgentRunState>;
  relatedWork: RelatedWorkOutput;
  relatedWorkByThread: Record<string, RelatedWorkOutput>;
  pendingAutoAsk: string;
  /** 论文/阅读源笔记，键见 getPaperNoteStorageKey */
  paperNotes: Record<string, string>;
  /** 「返回通用」前暂存的阅读态，用于恢复 */
  readingSuspendedSnapshot: ReadingSuspendedSnapshot | null;
  /** 离开阅读助手时保存的右侧栏卡片顺序，切回同一会话时恢复（避免只剩 graph） */
  lastReadingRightPanelByThread: Record<string, RightPanelCard[]>;
  /** 离开自由研究（general）时保存的右侧栏卡片，切回时恢复任务卡/候选池等 */
  lastGeneralRightPanelByThread: Record<string, RightPanelCard[]>;
  /** 离开综述助手时保存的侧栏卡片顺序 */
  lastLiteratureReviewRightPanelByThread: Record<string, RightPanelCard[]>;
  /** 离开个人知识库助手时保存的右侧栏卡片顺序 */
  lastPersonalKbRightPanelByThread: Record<string, RightPanelCard[]>;
  /** 综述助手侧栏可编辑成稿（按会话通过 workspace 持久化） */
  literatureReviewDraft: string;
  setLiteratureReviewDraft: (text: string) => void;
  /** 模型调试台：按条追加，UI 按 threadId 过滤 */
  modelDebugEntries: ModelDebugEntry[];
  /** 各会话隔离的侧栏/阅读/写作态，切换会话时恢复 */
  workspaceByThread: Record<string, ThreadWorkspaceSnapshot>;
  /** 将当前全局工作区快照写入当前线程并持久化（如刷新页面前） */
  persistWorkspaceNow: () => void;

  selectPaper: (id: string | null) => void;
  hoverPaper: (id: string | null) => void;
  toggleCluster: (id: number) => void;
  toggleAllClusters: () => void;
  setYearRange: (range: [number, number]) => void;
  setSearchQuery: (query: string) => void;
  setViewMode: (mode: '2d' | '3d') => void;
  setAgentMode: (mode: AgentMode) => void;
  setRightPanelCards: (cards: RightPanelCard[]) => void;
  focusRightPanelCard: (card: RightPanelCard) => void;
  clearRightPanelFocus: () => void;
  focusRightPanelStage: (stage: 'Plan' | 'Search' | 'Code' | 'Synthesize' | 'Critic' | null) => void;
  setRetrievalPreviewMeta: (meta: RetrievalPreviewMeta | null) => void;
  startReadingByUpload: (sourceValue: string) => void;
  startReadingByIntent: (sourceValue: string) => void;
  startReadingByPaper: (paperId: string) => void;
  switchReadingStyle: (style: 'guided' | 'direct') => void;
  setReasoningLevel: (level: 'minimal' | 'full') => void;
  setReadingGoal: (goal: string) => void;
  setReadingDepth: (depth: ReadingDepth) => void;
  setReadingPaperMeta: (meta: { paperTitle?: string; sourceValue?: string }) => void;
  setParsedPaperMeta: (meta: ParsedPaperMeta) => void;
  setReadingOutput: (payload: {
    nextQuestion?: string;
    answer?: string;
    evidenceRefs?: EvidenceRef[];
    toolTrace?: ToolTraceItem[];
    reasoningTrace?: string[];
  }) => void;
  setReadingPreviewUrl: (url: string) => void;
  setReadingParsing: (parsing: boolean, error?: string) => void;
  setActiveEvidence: (id: string | null) => void;
  createChatThread: (optionalAgent?: AssistantAgent) => string;
  switchChatThread: (id: string) => void;
  renameChatThread: (id: string, title: string) => void;
  deleteChatThread: (id: string) => void;
  upsertActiveThreadMessages: (messages: ChatMessage[]) => void;
  setActiveAgent: (agent: AssistantAgent) => void;
  setWritingTask: (task: string) => void;
  setWritingMaterial: (material: string) => void;
  setWritingOutput: (payload: { outline?: string[]; draft?: string }) => void;
  setAgentRunState: (state: Partial<AgentRunState>) => void;
  setResearchTaskCard: (payload: Partial<ResearchTaskCard>) => void;
  setTaskCardLocked: (locked: boolean) => void;
  setDiscoveryOutput: (payload: {
    candidatePool?: DiscoveryCandidateItem[];
    evidenceList?: string[];
    topicClusters?: string[];
  }) => void;
  setRelatedWorkOutput: (payload: Partial<RelatedWorkOutput>) => void;
  /** 个人知识库多选后注入文献综述的候选（含 localPdfId，发送前会经解析接口读 PDF） */
  literatureReviewLocalCandidates: DiscoveryCandidateItem[] | null;
  setLiteratureReviewLocalCandidates: (items: DiscoveryCandidateItem[] | null) => void;
  setPendingAutoAsk: (text: string) => void;
  /**
   * 发起个人知识库助手任务。默认：若当前已是 personal_kb 线程则复用同一会话；按住 Shift 点击快捷按钮时传 forceNewThread 以新建会话。
   */
  startPersonalKbTask: (prompt: string, opts?: { forceNewThread?: boolean }) => void;
  /** 个人知识库助手最近一次结果，供右侧「任务结果」卡片展示 */
  personalKbWorkbench: PersonalKbWorkbenchSnapshot | null;
  setPersonalKbWorkbench: (snap: PersonalKbWorkbenchSnapshot | null) => void;
  exitReadingToGeneral: () => void;
  resumeSuspendedReading: () => void;
  setPaperNote: (key: string, text: string) => void;
  pushModelDebug: (entry: Omit<ModelDebugEntry, 'id' | 'ts'>) => void;
  clearModelDebug: () => void;
}

/** 知识库论文若含直链，选中节点后即可在侧栏 PDF 预览 */
function resolvePaperPreviewUrl(paper: Paper | undefined): string {
  if (!paper) return '';
  const a = paper.pdfUrl?.trim();
  if (a) return a;
  const b = paper.openAccessPdfUrl?.trim();
  if (b) return b;
  return '';
}

const allClusterIds = new Set(clustersData.map((c: Cluster) => c.id));
const CHAT_HISTORY_KEY = 'research_map2_chat_history_v1';
const TASK_CARD_KEY = 'research_map2_task_cards_v1';
const DISCOVERY_KEY = 'research_map2_discovery_by_thread_v1';
const RUN_STATE_KEY = 'research_map2_run_state_by_thread_v1';
const RIGHT_PANEL_KEY = 'research_map2_right_panel_by_thread_v1';
const RELATED_WORK_KEY = 'research_map2_related_work_by_thread_v1';
const PAPER_NOTES_KEY = 'research_map2_paper_notes_v1';
const WORKSPACE_BY_THREAD_KEY = 'research_map2_workspace_by_thread_v1';

/** 阅读侧栏完整顺序：前 4 项为主标签，后 2 项在「更多」内折叠（思考过程仅在对话与调试台展示，不单开侧栏） */
export const READING_RIGHT_PANEL_FULL: RightPanelCard[] = [
  'paper',
  'guide',
  'evidence',
  'graph',
  'mindmap',
  'notes',
];
const readingCards = READING_RIGHT_PANEL_FULL;

/** 综述助手默认侧栏：成稿、对比表、引用、证据链、框架、编辑、候选池、问题图谱、知识图谱 */
export const LITERATURE_REVIEW_PANELS: RightPanelCard[] = [
  'lit_main',
  'related_work',
  'lit_citations',
  'lit_evidence',
  'lit_outline',
  'lit_edit',
  'candidate',
  'local_graph',
  'graph',
];

/** 个人知识库模式：资产总览、任务结果、图谱 */
export const PERSONAL_KB_RIGHT_PANELS: RightPanelCard[] = ['kb_assets', 'kb_result', 'graph'];
const defaultRunState: AgentRunState = {
  runId: '',
  agent: 'general',
  status: 'idle',
  startedAt: null,
  endedAt: null,
  lastHttpUrl: '',
  lastHttpStatus: null,
  thoughtTrace: [],
  thinkingNarrative: '',
  toolTrace: [],
  timeline: [],
};
const defaultResearchTask: ResearchTaskCard = {
  problemStatement: '',
  rqList: [],
  scopeInclude: [],
  scopeExclude: [],
  constraints: [],
  successCriteria: [],
  framingOutput: '',
  updatedAt: 0,
  locked: false,
  source: 'auto',
};
const defaultReadingSession: ReadingSession = {
  active: false,
  sourceType: null,
  sourceValue: '',
  paperTitle: '',
  goal: '',
  depth: 'adaptive',
  style: 'guided',
  nextQuestion: '',
  lastAnswer: '',
  evidenceRefs: [],
  toolTrace: [],
  reasoningTrace: [],
  previewUrl: '',
  parsing: false,
  parseError: '',
  activeEvidenceId: null,
  parsedMeta: null,
};

function cloneReadingSession(rs: ReadingSession): ReadingSession {
  return {
    ...rs,
    evidenceRefs: rs.evidenceRefs.map((e) => ({ ...e })),
    toolTrace: rs.toolTrace.map((t) => ({ ...t })),
    reasoningTrace: [...rs.reasoningTrace],
    parsedMeta: rs.parsedMeta
      ? {
          ...rs.parsedMeta,
          authors: [...rs.parsedMeta.authors],
          keywords: [...rs.parsedMeta.keywords],
        }
      : null,
  };
}

function defaultThreadWorkspace(): ThreadWorkspaceSnapshot {
  return {
    selectedPaperId: null,
    readingSession: cloneReadingSession(defaultReadingSession),
    agentMode: 'general',
    writingTask: '',
    writingMaterial: '',
    writingOutline: [],
    writingDraft: '',
    literatureReviewDraft: '',
    readingSuspendedSnapshot: null,
  };
}

function cloneSuspendedSnapshot(
  snap: ReadingSuspendedSnapshot | null
): ReadingSuspendedSnapshot | null {
  if (!snap) return null;
  return {
    ...snap,
    readingSession: cloneReadingSession(snap.readingSession),
    rightPanelCards: [...snap.rightPanelCards],
  };
}

function buildWorkspaceSnapshot(state: {
  selectedPaperId: string | null;
  readingSession: ReadingSession;
  agentMode: AgentMode;
  writingTask: string;
  writingMaterial: string;
  writingOutline: string[];
  writingDraft: string;
  literatureReviewDraft: string;
  readingSuspendedSnapshot: ReadingSuspendedSnapshot | null;
}): ThreadWorkspaceSnapshot {
  return {
    selectedPaperId: state.selectedPaperId,
    readingSession: cloneReadingSession(state.readingSession),
    agentMode: state.agentMode,
    writingTask: state.writingTask,
    writingMaterial: state.writingMaterial,
    writingOutline: [...state.writingOutline],
    writingDraft: state.writingDraft,
    literatureReviewDraft: state.literatureReviewDraft,
    readingSuspendedSnapshot: cloneSuspendedSnapshot(state.readingSuspendedSnapshot),
  };
}

function loadWorkspaceByThread(): Record<string, ThreadWorkspaceSnapshot> {
  try {
    const raw = localStorage.getItem(WORKSPACE_BY_THREAD_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<ThreadWorkspaceSnapshot>>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, ThreadWorkspaceSnapshot> = {};
    for (const [id, w] of Object.entries(parsed)) {
      if (!w || typeof w !== 'object' || !w.readingSession) continue;
      out[id] = {
        selectedPaperId: typeof w.selectedPaperId === 'string' ? w.selectedPaperId : null,
        readingSession: cloneReadingSession(w.readingSession as ReadingSession),
        agentMode: (w.agentMode as AgentMode) ?? 'general',
        writingTask: typeof w.writingTask === 'string' ? w.writingTask : '',
        writingMaterial: typeof w.writingMaterial === 'string' ? w.writingMaterial : '',
        writingOutline: Array.isArray(w.writingOutline) ? [...w.writingOutline] : [],
        writingDraft: typeof w.writingDraft === 'string' ? w.writingDraft : '',
        literatureReviewDraft: typeof w.literatureReviewDraft === 'string' ? w.literatureReviewDraft : '',
        readingSuspendedSnapshot: w.readingSuspendedSnapshot
          ? cloneSuspendedSnapshot(w.readingSuspendedSnapshot as ReadingSuspendedSnapshot)
          : null,
      };
    }
    return out;
  } catch {
    return {};
  }
}

function persistWorkspaceByThread(data: Record<string, ThreadWorkspaceSnapshot>): void {
  try {
    localStorage.setItem(WORKSPACE_BY_THREAD_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function mergeWorkspaceMapForThreads(
  map: Record<string, ThreadWorkspaceSnapshot>,
  threadIds: string[]
): Record<string, ThreadWorkspaceSnapshot> {
  const next = { ...map };
  for (const id of threadIds) {
    if (!next[id]) next[id] = defaultThreadWorkspace();
  }
  return next;
}

const defaultRelatedWork: RelatedWorkOutput = {
  items: [],
  gaps: [],
  summary: '',
  updatedAt: 0,
};
const createDefaultThread = (): ChatThread => ({
  id: `thread-${Date.now()}`,
  title: '新对话',
  updatedAt: Date.now(),
  messages: [],
  agent: 'general',
});

function loadChatHistory(): { chatThreads: ChatThread[]; activeThreadId: string } {
  const fallback = (() => {
    const first = createDefaultThread();
    return { chatThreads: [first], activeThreadId: first.id };
  })();
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as { chatThreads?: Array<Partial<ChatThread>>; activeThreadId?: string };
    const threads = Array.isArray(parsed.chatThreads)
      ? parsed.chatThreads.map((t) => ({
          id: typeof t.id === 'string' ? t.id : `thread-${Date.now()}`,
          title: typeof t.title === 'string' ? t.title : '新对话',
          updatedAt: typeof t.updatedAt === 'number' ? t.updatedAt : Date.now(),
          messages: Array.isArray(t.messages) ? t.messages.filter((m): m is ChatMessage => !!m && typeof m.id === 'string' && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant')) : [],
          agent: ((): AssistantAgent =>
            t.agent === 'writing'
              ? 'writing'
              : t.agent === 'reading'
                ? 'reading'
                : t.agent === 'literature_review'
                  ? 'literature_review'
                  : t.agent === 'personal_kb'
                    ? 'personal_kb'
                    : 'general')(),
        }))
      : [];
    if (!threads.length) return fallback;
    const active =
      typeof parsed.activeThreadId === 'string' && threads.some((t) => t.id === parsed.activeThreadId)
        ? parsed.activeThreadId
        : threads[0].id;
    return { chatThreads: threads, activeThreadId: active };
  } catch {
    return fallback;
  }
}

function persistChatHistory(chatThreads: ChatThread[], activeThreadId: string): void {
  try {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify({ chatThreads, activeThreadId }));
  } catch {
    // ignore localStorage write failures
  }
}

function loadTaskCards(): Record<string, ResearchTaskCard> {
  try {
    const raw = localStorage.getItem(TASK_CARD_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<ResearchTaskCard>>;
    if (!parsed || typeof parsed !== 'object') return {};
    const result: Record<string, ResearchTaskCard> = {};
    for (const [threadId, card] of Object.entries(parsed)) {
      result[threadId] = {
        ...defaultResearchTask,
        ...card,
        rqList: Array.isArray(card?.rqList) ? card.rqList.filter((x): x is string => typeof x === 'string') : [],
        scopeInclude: Array.isArray(card?.scopeInclude) ? card.scopeInclude.filter((x): x is string => typeof x === 'string') : [],
        scopeExclude: Array.isArray(card?.scopeExclude) ? card.scopeExclude.filter((x): x is string => typeof x === 'string') : [],
        constraints: Array.isArray(card?.constraints) ? card.constraints.filter((x): x is string => typeof x === 'string') : [],
        successCriteria: Array.isArray(card?.successCriteria) ? card.successCriteria.filter((x): x is string => typeof x === 'string') : [],
        framingOutput: typeof card?.framingOutput === 'string' ? card.framingOutput : '',
      };
    }
    return result;
  } catch {
    return {};
  }
}

function persistTaskCards(taskCards: Record<string, ResearchTaskCard>): void {
  try {
    localStorage.setItem(TASK_CARD_KEY, JSON.stringify(taskCards));
  } catch {
    // ignore localStorage write failures
  }
}

function loadDiscoveryByThread(): Record<string, { candidatePool: DiscoveryCandidateItem[]; evidenceList: string[]; topicClusters: string[] }> {
  try {
    const raw = localStorage.getItem(DISCOVERY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, {
      candidatePool?: DiscoveryCandidateItem[];
      evidenceList?: string[];
      topicClusters?: string[];
    }>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, { candidatePool: DiscoveryCandidateItem[]; evidenceList: string[]; topicClusters: string[] }> = {};
    for (const [k, v] of Object.entries(parsed)) {
      out[k] = {
        candidatePool: Array.isArray(v?.candidatePool) ? v.candidatePool.filter((x): x is DiscoveryCandidateItem => !!x && typeof x.title === 'string') : [],
        evidenceList: Array.isArray(v?.evidenceList) ? v.evidenceList.filter((x): x is string => typeof x === 'string') : [],
        topicClusters: Array.isArray(v?.topicClusters) ? v.topicClusters.filter((x): x is string => typeof x === 'string') : [],
      };
    }
    return out;
  } catch {
    return {};
  }
}

function persistDiscoveryByThread(data: Record<string, { candidatePool: DiscoveryCandidateItem[]; evidenceList: string[]; topicClusters: string[] }>): void {
  try {
    localStorage.setItem(DISCOVERY_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function loadRunStateByThread(): Record<string, AgentRunState> {
  try {
    const raw = localStorage.getItem(RUN_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<AgentRunState>>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, AgentRunState> = {};
    for (const [k, v] of Object.entries(parsed)) {
      out[k] = {
        ...defaultRunState,
        ...v,
        thoughtTrace: Array.isArray(v?.thoughtTrace) ? v.thoughtTrace.filter((x): x is string => typeof x === 'string') : [],
        toolTrace: Array.isArray(v?.toolTrace) ? v.toolTrace.filter((x): x is ToolTraceItem => !!x && typeof x.id === 'string') : [],
        timeline: Array.isArray(v?.timeline) ? v.timeline.filter((x): x is NonNullable<AgentRunState['timeline']>[number] => !!x && typeof x.stage === 'string') : [],
      };
    }
    return out;
  } catch {
    return {};
  }
}

function persistRunStateByThread(data: Record<string, AgentRunState>): void {
  try {
    localStorage.setItem(RUN_STATE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function loadRightPanelByThread(): Record<string, RightPanelCard[]> {
  try {
    const raw = localStorage.getItem(RIGHT_PANEL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, RightPanelCard[]> = {};
    for (const [k, v] of Object.entries(parsed)) {
      out[k] = Array.isArray(v)
        ? v.filter((x): x is RightPanelCard => typeof x === 'string') as RightPanelCard[]
        : ['graph'];
    }
    return out;
  } catch {
    return {};
  }
}

function persistRightPanelByThread(data: Record<string, RightPanelCard[]>): void {
  try {
    localStorage.setItem(RIGHT_PANEL_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function loadRelatedWorkByThread(): Record<string, RelatedWorkOutput> {
  try {
    const raw = localStorage.getItem(RELATED_WORK_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<RelatedWorkOutput>>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, RelatedWorkOutput> = {};
    for (const [k, v] of Object.entries(parsed)) {
      out[k] = {
        ...defaultRelatedWork,
        ...v,
        items: Array.isArray(v?.items)
          ? v.items.filter((x): x is RelatedWorkOutput['items'][number] => !!x && typeof x.title === 'string')
          : [],
        gaps: Array.isArray(v?.gaps) ? v.gaps.filter((x): x is string => typeof x === 'string') : [],
        summary: typeof v?.summary === 'string' ? v.summary : '',
        updatedAt: typeof v?.updatedAt === 'number' ? v.updatedAt : 0,
      };
    }
    return out;
  } catch {
    return {};
  }
}

function persistRelatedWorkByThread(data: Record<string, RelatedWorkOutput>): void {
  try {
    localStorage.setItem(RELATED_WORK_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function loadPaperNotes(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PAPER_NOTES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function persistPaperNotes(data: Record<string, string>): void {
  try {
    localStorage.setItem(PAPER_NOTES_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

const initialHistory = loadChatHistory();
const initialWorkspaceByThreadRaw = loadWorkspaceByThread();
const initialWorkspaceByThread = mergeWorkspaceMapForThreads(initialWorkspaceByThreadRaw, [
  ...initialHistory.chatThreads.map((t) => t.id),
]);
const initialThreadWorkspace =
  initialWorkspaceByThread[initialHistory.activeThreadId] ?? defaultThreadWorkspace();
const initialTaskCards = loadTaskCards();
const initialDiscoveryByThread = loadDiscoveryByThread();
const initialRunByThread = loadRunStateByThread();
const initialRightPanelByThread = loadRightPanelByThread();
const initialRelatedWorkByThread = loadRelatedWorkByThread();
const initialTaskCard = initialTaskCards[initialHistory.activeThreadId] ?? defaultResearchTask;
const initialDiscovery = initialDiscoveryByThread[initialHistory.activeThreadId] ?? { candidatePool: [], evidenceList: [], topicClusters: [] };
const initialRunState = initialRunByThread[initialHistory.activeThreadId] ?? defaultRunState;
const initialActiveThread = initialHistory.chatThreads.find((t) => t.id === initialHistory.activeThreadId);
const initialRightPanel =
  initialActiveThread?.agent === 'reading'
    ? [...readingCards]
    : initialActiveThread?.agent === 'literature_review'
      ? [...LITERATURE_REVIEW_PANELS]
      : initialActiveThread?.agent === 'personal_kb'
        ? initialRightPanelByThread[initialHistory.activeThreadId] ?? [...PERSONAL_KB_RIGHT_PANELS]
        : initialRightPanelByThread[initialHistory.activeThreadId] ?? ['graph'];
const initialRelatedWork = initialRelatedWorkByThread[initialHistory.activeThreadId] ?? defaultRelatedWork;
const initialPaperNotes = loadPaperNotes();

export const useStore = create<AppState>((set, get) => ({
  ...initialHistory,
  papers: papersData as Paper[],
  clusters: clustersData as Cluster[],

  selectedPaperId: initialThreadWorkspace.selectedPaperId,
  hoveredPaperId: null,

  visibleClusterIds: new Set(allClusterIds),
  yearRange: [1977, 2025],
  searchQuery: '',
  searchResults: null,

  viewMode: '3d',
  agentMode: initialThreadWorkspace.agentMode,
  reasoningLevel: 'full',
  rightPanelCards: initialRightPanel,
  rightPanelFocusCard: null,
  rightPanelFocusStage: null,
  retrievalPreviewMeta: null,
  retrievalPreviewByThread: {},
  rightPanelByThread: initialRightPanelByThread,
  readingSession: cloneReadingSession(initialThreadWorkspace.readingSession),
  activeAgent: initialActiveThread?.agent ?? 'general',
  writingTask: initialThreadWorkspace.writingTask,
  writingMaterial: initialThreadWorkspace.writingMaterial,
  writingOutline: [...initialThreadWorkspace.writingOutline],
  writingDraft: initialThreadWorkspace.writingDraft,
  literatureReviewDraft: initialThreadWorkspace.literatureReviewDraft,
  agentRunState: initialRunState,
  researchTaskCard: initialTaskCard,
  researchTaskByThread: initialTaskCards,
  discoveryCandidatePool: initialDiscovery.candidatePool,
  discoveryEvidenceList: initialDiscovery.evidenceList,
  discoveryTopicClusters: initialDiscovery.topicClusters,
  discoveryByThread: initialDiscoveryByThread,
  agentRunByThread: initialRunByThread,
  relatedWork: initialRelatedWork,
  relatedWorkByThread: initialRelatedWorkByThread,
  pendingAutoAsk: '',
  literatureReviewLocalCandidates: null,
  paperNotes: initialPaperNotes,
  readingSuspendedSnapshot: cloneSuspendedSnapshot(initialThreadWorkspace.readingSuspendedSnapshot),
  lastReadingRightPanelByThread: {},
  lastGeneralRightPanelByThread: {},
  lastLiteratureReviewRightPanelByThread: {},
  lastPersonalKbRightPanelByThread: {},
  personalKbWorkbench: null,
  modelDebugEntries: [],
  workspaceByThread: {
    ...initialWorkspaceByThread,
    [initialHistory.activeThreadId]: initialThreadWorkspace,
  },

  persistWorkspaceNow: () =>
    set((state) => {
      const id = state.activeThreadId;
      const snap = buildWorkspaceSnapshot(state);
      const workspaceByThread = { ...state.workspaceByThread, [id]: snap };
      persistWorkspaceByThread(workspaceByThread);
      return { workspaceByThread };
    }),

  setLiteratureReviewDraft: (text) => set({ literatureReviewDraft: text }),

  selectPaper: (id) =>
    set((state) => {
      if (!id) {
        if (state.readingSession.sourceType === 'paper_graph') {
          return {
            selectedPaperId: null,
            agentMode: 'general',
            rightPanelCards: ['graph'],
            readingSession: defaultReadingSession,
          };
        }
        return { selectedPaperId: null };
      }
      const paper = state.papers.find((p) => p.id === id);
      const previewUrl = resolvePaperPreviewUrl(paper);
      return {
        selectedPaperId: id,
        agentMode: 'reading_setup',
        rightPanelCards: readingCards,
        readingSuspendedSnapshot: null,
        readingSession: {
          ...state.readingSession,
          active: true,
          sourceType: 'paper_graph',
          sourceValue: id,
          paperTitle: paper?.title ?? state.readingSession.paperTitle,
          previewUrl: previewUrl || state.readingSession.previewUrl,
        },
      };
    }),
  hoverPaper: (id) => set({ hoveredPaperId: id }),

  toggleCluster: (id) =>
    set((state) => {
      const next = new Set(state.visibleClusterIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { visibleClusterIds: next };
    }),

  toggleAllClusters: () =>
    set((state) => {
      if (state.visibleClusterIds.size === allClusterIds.size) {
        return { visibleClusterIds: new Set<number>() };
      }
      return { visibleClusterIds: new Set(allClusterIds) };
    }),

  setYearRange: (range) => set({ yearRange: range }),

  setSearchQuery: (query) =>
    set((state) => {
      if (!query.trim()) return { searchQuery: query, searchResults: null };
      const lower = query.toLowerCase();
      const results = new Set<string>();
      for (const p of state.papers) {
        if (
          p.title.toLowerCase().includes(lower) ||
          p.authors.some((a) => a.toLowerCase().includes(lower)) ||
          p.keywords.some((k) => k.toLowerCase().includes(lower))
        ) {
          results.add(p.id);
        }
      }
      return { searchQuery: query, searchResults: results };
    }),

  setViewMode: (mode) => set({ viewMode: mode }),
  setAgentMode: (mode) => set({ agentMode: mode }),
  setRightPanelCards: (cards) =>
    set((state) => {
      const id = state.activeThreadId;
      const rightPanelByThread = {
        ...state.rightPanelByThread,
        [id]: cards,
      };
      persistRightPanelByThread(rightPanelByThread);
      const lastGeneralRightPanelByThread =
        state.activeAgent === 'general'
          ? { ...state.lastGeneralRightPanelByThread, [id]: [...cards] }
          : state.lastGeneralRightPanelByThread;
      const lastLiteratureReviewRightPanelByThread =
        state.activeAgent === 'literature_review'
          ? { ...state.lastLiteratureReviewRightPanelByThread, [id]: [...cards] }
          : state.lastLiteratureReviewRightPanelByThread;
      const lastPersonalKbRightPanelByThread =
        state.activeAgent === 'personal_kb'
          ? { ...state.lastPersonalKbRightPanelByThread, [id]: [...cards] }
          : state.lastPersonalKbRightPanelByThread;
      return {
        rightPanelCards: cards,
        rightPanelFocusCard: null,
        rightPanelFocusStage: null,
        rightPanelByThread,
        lastGeneralRightPanelByThread,
        lastLiteratureReviewRightPanelByThread,
        lastPersonalKbRightPanelByThread,
      };
    }),
  focusRightPanelCard: (card) => set({ rightPanelFocusCard: card }),
  clearRightPanelFocus: () => set({ rightPanelFocusCard: null }),
  focusRightPanelStage: (stage) => set({ rightPanelFocusStage: stage }),
  setRetrievalPreviewMeta: (meta) =>
    set((state) => ({
      retrievalPreviewMeta: meta,
      retrievalPreviewByThread: {
        ...state.retrievalPreviewByThread,
        [state.activeThreadId]: meta,
      },
    })),
  startReadingByUpload: (sourceValue) =>
    set(() => ({
      agentMode: 'reading_setup',
      rightPanelCards: readingCards,
      readingSuspendedSnapshot: null,
      readingSession: {
        ...defaultReadingSession,
        active: true,
        sourceType: 'upload',
        sourceValue,
        previewUrl: sourceValue,
      },
    })),
  startReadingByIntent: (sourceValue) =>
    set((state) => ({
      agentMode: 'reading_setup',
      rightPanelCards: readingCards,
      readingSuspendedSnapshot: null,
      readingSession: {
        ...defaultReadingSession,
        active: true,
        sourceType: 'intent',
        sourceValue,
        goal: state.readingSession.goal,
        previewUrl: state.readingSession.previewUrl,
      },
    })),
  startReadingByPaper: (paperId) =>
    set((state) => {
      const paper = state.papers.find((p) => p.id === paperId);
      const previewUrl = resolvePaperPreviewUrl(paper);
      return {
        selectedPaperId: paperId,
        agentMode: 'reading_setup',
        rightPanelCards: readingCards,
        readingSuspendedSnapshot: null,
        readingSession: {
          ...defaultReadingSession,
          active: true,
          sourceType: 'paper_graph',
          sourceValue: paperId,
          paperTitle: paper?.title ?? '',
          previewUrl,
        },
      };
    }),
  switchReadingStyle: (style) =>
    set((state) => ({
      agentMode: style === 'guided' ? 'reading_guided' : 'reading_direct',
      readingSession: { ...state.readingSession, style },
    })),
  setReasoningLevel: (level) => set({ reasoningLevel: level }),
  setReadingGoal: (goal) =>
    set((state) => ({
      readingSession: { ...state.readingSession, goal },
    })),
  setReadingDepth: (depth) =>
    set((state) => ({
      readingSession: { ...state.readingSession, depth },
    })),
  setReadingPaperMeta: (meta) =>
    set((state) => ({
      readingSession: {
        ...state.readingSession,
        paperTitle: meta.paperTitle ?? state.readingSession.paperTitle,
        sourceValue: meta.sourceValue ?? state.readingSession.sourceValue,
      },
    })),
  setParsedPaperMeta: (meta) =>
    set((state) => ({
      readingSession: {
        ...state.readingSession,
        parsedMeta: meta,
        paperTitle: meta.title ?? state.readingSession.paperTitle,
      },
    })),
  setReadingOutput: (payload) =>
    set((state) => ({
      readingSession: {
        ...state.readingSession,
        nextQuestion: payload.nextQuestion ?? state.readingSession.nextQuestion,
        lastAnswer: payload.answer ?? state.readingSession.lastAnswer,
        evidenceRefs: payload.evidenceRefs ?? state.readingSession.evidenceRefs,
        toolTrace: payload.toolTrace ?? state.readingSession.toolTrace,
        reasoningTrace: payload.reasoningTrace ?? state.readingSession.reasoningTrace,
      },
    })),
  setReadingPreviewUrl: (url) =>
    set((state) => ({
      readingSession: { ...state.readingSession, previewUrl: url },
    })),
  setReadingParsing: (parsing, error = '') =>
    set((state) => ({
      readingSession: { ...state.readingSession, parsing, parseError: error },
    })),
  setActiveEvidence: (id) =>
    set((state) => ({
      readingSession: { ...state.readingSession, activeEvidenceId: id },
    })),
  createChatThread: (optionalAgent) => {
    const id = `thread-${Date.now()}`;
    set((state) => ({
      ...(function () {
        const agentForNew = optionalAgent ?? state.activeAgent;
        const snapshotPrev = buildWorkspaceSnapshot(state);
        const workspaceByThreadBase = {
          ...state.workspaceByThread,
          [state.activeThreadId]: snapshotPrev,
        };
        const freshWorkspace = defaultThreadWorkspace();
        if (agentForNew === 'reading') {
          freshWorkspace.agentMode = 'reading_setup';
        } else if (agentForNew === 'writing') {
          freshWorkspace.agentMode = 'general';
        } else if (agentForNew === 'literature_review') {
          freshWorkspace.agentMode = 'general';
        }
        const workspaceByThread = {
          ...workspaceByThreadBase,
          [id]: freshWorkspace,
        };
        persistWorkspaceByThread(workspaceByThread);

        const chatThreads = [
        { id, title: '新对话', updatedAt: Date.now(), messages: [], agent: agentForNew },
        ...state.chatThreads,
        ];
        const researchTaskByThread = {
          ...state.researchTaskByThread,
          [id]: defaultResearchTask,
        };
        const discoveryByThread = {
          ...state.discoveryByThread,
          [id]: { candidatePool: [], evidenceList: [], topicClusters: [] },
        };
        const agentRunByThread = {
          ...state.agentRunByThread,
          [id]: defaultRunState,
        };
        const defaultPanelsForNew: RightPanelCard[] =
          agentForNew === 'personal_kb'
            ? [...PERSONAL_KB_RIGHT_PANELS]
            : state.rightPanelCards ?? ['graph'];
        const rightPanelByThread = {
          ...state.rightPanelByThread,
          [id]: defaultPanelsForNew,
        };
        const relatedWorkByThread = {
          ...state.relatedWorkByThread,
          [id]: defaultRelatedWork,
        };
        persistChatHistory(chatThreads, id);
        persistTaskCards(researchTaskByThread);
        persistDiscoveryByThread(discoveryByThread);
        persistRunStateByThread(agentRunByThread);
        persistRightPanelByThread(rightPanelByThread);
        persistRelatedWorkByThread(relatedWorkByThread);
        return {
          chatThreads,
          activeThreadId: id,
          rightPanelFocusCard: null,
          retrievalPreviewMeta: null,
          retrievalPreviewByThread: {
            ...state.retrievalPreviewByThread,
            [id]: null,
          },
          activeAgent: agentForNew,
          researchTaskCard: defaultResearchTask,
          researchTaskByThread,
          discoveryByThread,
          discoveryCandidatePool: [],
          discoveryEvidenceList: [],
          discoveryTopicClusters: [],
          agentRunByThread,
          agentRunState: defaultRunState,
          rightPanelByThread,
          relatedWorkByThread,
          relatedWork: defaultRelatedWork,
          selectedPaperId: freshWorkspace.selectedPaperId,
          readingSession: cloneReadingSession(freshWorkspace.readingSession),
          agentMode: freshWorkspace.agentMode,
          writingTask: freshWorkspace.writingTask,
          writingMaterial: freshWorkspace.writingMaterial,
          writingOutline: [...freshWorkspace.writingOutline],
          writingDraft: freshWorkspace.writingDraft,
          readingSuspendedSnapshot: null,
          workspaceByThread,
          literatureReviewLocalCandidates: null,
          literatureReviewDraft: freshWorkspace.literatureReviewDraft,
          rightPanelCards: defaultPanelsForNew,
        };
      })(),
    }));
    return id;
  },
  startPersonalKbTask: (prompt, opts) => {
    const forceNew = opts?.forceNewThread === true;
    const st = get();
    const curThread = st.chatThreads.find((t) => t.id === st.activeThreadId);
    const canReuse =
      !forceNew && st.activeAgent === 'personal_kb' && curThread?.agent === 'personal_kb';
    if (!canReuse) {
      get().createChatThread('personal_kb');
    } else {
      get().setRightPanelCards([...PERSONAL_KB_RIGHT_PANELS]);
    }
    get().setPendingAutoAsk(prompt);
  },
  setPersonalKbWorkbench: (snap) => set({ personalKbWorkbench: snap }),
  switchChatThread: (id) =>
    set((state) => {
      const target = state.chatThreads.find((t) => t.id === id);
      if (!target) return {};
      const prevId = state.activeThreadId;
      if (prevId === id) return {};

      const snapshotPrev = buildWorkspaceSnapshot(state);
      let workspaceByThread: Record<string, ThreadWorkspaceSnapshot> = {
        ...state.workspaceByThread,
        [prevId]: snapshotPrev,
      };
      workspaceByThread[id] = workspaceByThread[id] ?? defaultThreadWorkspace();
      const wsTarget = workspaceByThread[id];
      persistWorkspaceByThread(workspaceByThread);

      persistChatHistory(state.chatThreads, id);
      const discovery = state.discoveryByThread[id] ?? { candidatePool: [], evidenceList: [], topicClusters: [] };
      const runState = state.agentRunByThread[id] ?? defaultRunState;
      const rightPanelCards =
        target.agent === 'reading'
          ? [...readingCards]
          : target.agent === 'literature_review'
            ? state.lastLiteratureReviewRightPanelByThread[id]?.length
              ? [...state.lastLiteratureReviewRightPanelByThread[id]]
              : state.rightPanelByThread[id]?.length
                ? [...state.rightPanelByThread[id]]
                : [...LITERATURE_REVIEW_PANELS]
            : target.agent === 'general'
              ? state.lastGeneralRightPanelByThread[id]?.length
                ? [...state.lastGeneralRightPanelByThread[id]]
                : state.rightPanelByThread[id] ?? ['graph']
              : target.agent === 'personal_kb'
                ? state.lastPersonalKbRightPanelByThread[id]?.length
                  ? [...state.lastPersonalKbRightPanelByThread[id]]
                  : state.rightPanelByThread[id]?.length
                    ? [...state.rightPanelByThread[id]]
                    : ([...PERSONAL_KB_RIGHT_PANELS] as RightPanelCard[])
                : state.rightPanelByThread[id] ??
                    (target.agent === 'writing'
                      ? (['task', 'material', 'outline', 'draft', 'tools'] as RightPanelCard[])
                      : ['graph']);

      let agentMode = wsTarget.agentMode;
      if (target.agent === 'reading' && !agentMode.startsWith('reading')) {
        agentMode = 'reading_setup';
      } else if (target.agent !== 'reading' && agentMode.startsWith('reading')) {
        agentMode = 'general';
      }

      const suspended =
        wsTarget.readingSuspendedSnapshot?.threadId === id
          ? cloneSuspendedSnapshot(wsTarget.readingSuspendedSnapshot)
          : null;

      return {
        activeThreadId: id,
        rightPanelFocusCard: null,
        retrievalPreviewMeta: state.retrievalPreviewByThread[id] ?? null,
        activeAgent: target.agent,
        rightPanelCards,
        researchTaskCard: state.researchTaskByThread[id] ?? defaultResearchTask,
        discoveryCandidatePool: discovery.candidatePool,
        discoveryEvidenceList: discovery.evidenceList,
        discoveryTopicClusters: discovery.topicClusters,
        agentRunState: runState,
        relatedWork: state.relatedWorkByThread[id] ?? defaultRelatedWork,
        selectedPaperId: wsTarget.selectedPaperId,
        readingSession: cloneReadingSession(wsTarget.readingSession),
        agentMode,
        writingTask: wsTarget.writingTask,
        writingMaterial: wsTarget.writingMaterial,
        writingOutline: [...wsTarget.writingOutline],
        writingDraft: wsTarget.writingDraft,
        readingSuspendedSnapshot: suspended,
        workspaceByThread,
        literatureReviewLocalCandidates: null,
        literatureReviewDraft: wsTarget.literatureReviewDraft,
      };
    }),
  renameChatThread: (id, title) =>
    set((state) => {
      const chatThreads = state.chatThreads.map((t) =>
        t.id === id ? { ...t, title: title.trim() || '未命名会话' } : t
      );
      persistChatHistory(chatThreads, state.activeThreadId);
      return { chatThreads };
    }),
  deleteChatThread: (id) =>
    set((state) => {
      if (state.chatThreads.length <= 1) {
        const first = state.chatThreads[0];
        const chatThreads = [{ ...first, title: '新对话', messages: [], updatedAt: Date.now() }];
        const researchTaskByThread = {
          [first.id]: state.researchTaskByThread[first.id] ?? defaultResearchTask,
        };
        const discoveryByThread = {
          [first.id]: state.discoveryByThread[first.id] ?? { candidatePool: [], evidenceList: [], topicClusters: [] },
        };
        const agentRunByThread = {
          [first.id]: state.agentRunByThread[first.id] ?? defaultRunState,
        };
        const rightPanelByThread = {
          [first.id]: state.rightPanelByThread[first.id] ?? ['graph'],
        };
        const relatedWorkByThread = {
          [first.id]: state.relatedWorkByThread[first.id] ?? defaultRelatedWork,
        };
        const freshWs = defaultThreadWorkspace();
        const workspaceByThread = { [first.id]: freshWs };
        const lastLiteratureReviewRightPanelByThreadReset = { ...state.lastLiteratureReviewRightPanelByThread };
        delete lastLiteratureReviewRightPanelByThreadReset[first.id];
        persistWorkspaceByThread(workspaceByThread);
        persistChatHistory(chatThreads, first.id);
        persistTaskCards(researchTaskByThread);
        persistDiscoveryByThread(discoveryByThread);
        persistRunStateByThread(agentRunByThread);
        persistRightPanelByThread(rightPanelByThread);
        persistRelatedWorkByThread(relatedWorkByThread);
        return {
          chatThreads,
          activeThreadId: first.id,
          rightPanelFocusCard: null,
          retrievalPreviewMeta: null,
          retrievalPreviewByThread: { [first.id]: null },
          researchTaskByThread,
          researchTaskCard: researchTaskByThread[first.id],
          discoveryByThread,
          discoveryCandidatePool: discoveryByThread[first.id].candidatePool,
          discoveryEvidenceList: discoveryByThread[first.id].evidenceList,
          discoveryTopicClusters: discoveryByThread[first.id].topicClusters,
          agentRunByThread,
          agentRunState: agentRunByThread[first.id],
          rightPanelByThread,
          rightPanelCards: rightPanelByThread[first.id],
          relatedWorkByThread,
          relatedWork: relatedWorkByThread[first.id],
          selectedPaperId: freshWs.selectedPaperId,
          readingSession: cloneReadingSession(freshWs.readingSession),
          agentMode: freshWs.agentMode,
          writingTask: freshWs.writingTask,
          writingMaterial: freshWs.writingMaterial,
          writingOutline: [...freshWs.writingOutline],
          writingDraft: freshWs.writingDraft,
          readingSuspendedSnapshot: null,
          workspaceByThread,
          literatureReviewLocalCandidates: null,
          literatureReviewDraft: freshWs.literatureReviewDraft,
          lastLiteratureReviewRightPanelByThread: lastLiteratureReviewRightPanelByThreadReset,
        };
      }
      const chatThreads = state.chatThreads.filter((t) => t.id !== id);
      const activeThreadId =
        state.activeThreadId === id ? (chatThreads[0]?.id ?? state.activeThreadId) : state.activeThreadId;
      const researchTaskByThread = { ...state.researchTaskByThread };
      const discoveryByThread = { ...state.discoveryByThread };
      const agentRunByThread = { ...state.agentRunByThread };
      const rightPanelByThread = { ...state.rightPanelByThread };
      const relatedWorkByThread = { ...state.relatedWorkByThread };
      delete researchTaskByThread[id];
      delete discoveryByThread[id];
      delete agentRunByThread[id];
      delete rightPanelByThread[id];
      delete relatedWorkByThread[id];
      const lastGeneralRightPanelByThread = { ...state.lastGeneralRightPanelByThread };
      delete lastGeneralRightPanelByThread[id];
      const lastReadingRightPanelByThread = { ...state.lastReadingRightPanelByThread };
      delete lastReadingRightPanelByThread[id];
      const lastLiteratureReviewRightPanelByThread = { ...state.lastLiteratureReviewRightPanelByThread };
      delete lastLiteratureReviewRightPanelByThread[id];
      const lastPersonalKbRightPanelByThread = { ...state.lastPersonalKbRightPanelByThread };
      delete lastPersonalKbRightPanelByThread[id];
      const workspaceByThread = { ...state.workspaceByThread };
      delete workspaceByThread[id];
      const retrievalPreviewByThread = { ...state.retrievalPreviewByThread };
      delete retrievalPreviewByThread[id];
      persistWorkspaceByThread(workspaceByThread);
      persistChatHistory(chatThreads, activeThreadId);
      persistTaskCards(researchTaskByThread);
      persistDiscoveryByThread(discoveryByThread);
      persistRunStateByThread(agentRunByThread);
      persistRightPanelByThread(rightPanelByThread);
      persistRelatedWorkByThread(relatedWorkByThread);
      const discovery = discoveryByThread[activeThreadId] ?? { candidatePool: [], evidenceList: [], topicClusters: [] };
      const runState = agentRunByThread[activeThreadId] ?? defaultRunState;
      const rightPanelCards = rightPanelByThread[activeThreadId] ?? ['graph'];
      const relatedWork = relatedWorkByThread[activeThreadId] ?? defaultRelatedWork;
      const ws = workspaceByThread[activeThreadId] ?? defaultThreadWorkspace();
      const activeThread = chatThreads.find((t) => t.id === activeThreadId);
      let agentMode = ws.agentMode;
      if (activeThread?.agent === 'reading' && !agentMode.startsWith('reading')) {
        agentMode = 'reading_setup';
      } else if (activeThread && activeThread.agent !== 'reading' && agentMode.startsWith('reading')) {
        agentMode = 'general';
      }
      const suspended =
        ws.readingSuspendedSnapshot?.threadId === activeThreadId
          ? cloneSuspendedSnapshot(ws.readingSuspendedSnapshot)
          : null;
      return {
        chatThreads,
        activeThreadId,
        rightPanelFocusCard: null,
        retrievalPreviewMeta: retrievalPreviewByThread[activeThreadId] ?? null,
        retrievalPreviewByThread,
        activeAgent: activeThread?.agent ?? 'general',
        researchTaskByThread,
        researchTaskCard: researchTaskByThread[activeThreadId] ?? defaultResearchTask,
        discoveryByThread,
        discoveryCandidatePool: discovery.candidatePool,
        discoveryEvidenceList: discovery.evidenceList,
        discoveryTopicClusters: discovery.topicClusters,
        agentRunByThread,
        agentRunState: runState,
        rightPanelByThread,
        rightPanelCards,
        relatedWorkByThread,
        relatedWork,
        lastGeneralRightPanelByThread,
        lastReadingRightPanelByThread,
        lastPersonalKbRightPanelByThread,
        selectedPaperId: ws.selectedPaperId,
        readingSession: cloneReadingSession(ws.readingSession),
        agentMode,
        writingTask: ws.writingTask,
        writingMaterial: ws.writingMaterial,
        writingOutline: [...ws.writingOutline],
        writingDraft: ws.writingDraft,
        readingSuspendedSnapshot: suspended,
        workspaceByThread,
        literatureReviewLocalCandidates: null,
        literatureReviewDraft: ws.literatureReviewDraft,
        lastLiteratureReviewRightPanelByThread,
      };
    }),
  upsertActiveThreadMessages: (messages) =>
    set((state) => {
      const chatThreads = state.chatThreads
        .map((t) => {
          if (t.id !== state.activeThreadId) return t;
          const firstUser = messages.find((m) => m.role === 'user')?.content.trim();
          return {
            ...t,
            messages,
            updatedAt: Date.now(),
            title: firstUser ? firstUser.slice(0, 20) : t.title,
          };
        })
        .sort((a, b) => b.updatedAt - a.updatedAt);
      persistChatHistory(chatThreads, state.activeThreadId);
      return { chatThreads };
    }),
  /** 在当前会话内切换助手，不新建会话、不跳到其它线程 */
  setActiveAgent: (agent) =>
    set((state) => {
      const id = state.activeThreadId;
      let lastReadingPanels = { ...state.lastReadingRightPanelByThread };
      if (state.activeAgent === 'reading' && agent !== 'reading') {
        const cur = state.rightPanelCards;
        if (cur.includes('paper') || cur.includes('guide')) {
          lastReadingPanels[id] = [...cur];
        }
      }

      let lastGeneralPanels = { ...state.lastGeneralRightPanelByThread };
      if (state.activeAgent === 'general' && agent !== 'general') {
        lastGeneralPanels[id] = [...state.rightPanelCards];
      }

      let lastLitPanels = { ...state.lastLiteratureReviewRightPanelByThread };
      if (state.activeAgent === 'literature_review' && agent !== 'literature_review') {
        lastLitPanels[id] = [...state.rightPanelCards];
      }

      let lastPersonalKbPanels = { ...state.lastPersonalKbRightPanelByThread };
      if (state.activeAgent === 'personal_kb' && agent !== 'personal_kb') {
        lastPersonalKbPanels[id] = [...state.rightPanelCards];
      }

      const rightPanelCards: RightPanelCard[] =
        agent === 'writing'
          ? (['task', 'material', 'outline', 'draft', 'tools'] as RightPanelCard[])
          : agent === 'reading'
            ? lastReadingPanels[id]?.length
              ? [...lastReadingPanels[id]]
              : [...readingCards]
            : agent === 'literature_review'
              ? lastLitPanels[id]?.length
                ? [...lastLitPanels[id]]
                : [...LITERATURE_REVIEW_PANELS]
              : agent === 'personal_kb'
                ? lastPersonalKbPanels[id]?.length
                  ? [...lastPersonalKbPanels[id]]
                  : [...PERSONAL_KB_RIGHT_PANELS]
                : lastGeneralPanels[id]?.length
                  ? [...lastGeneralPanels[id]]
                  : ['graph'];

      let agentMode: AgentMode = state.agentMode;
      if (agent === 'reading') {
        if (!state.agentMode.startsWith('reading')) {
          const hasReadingCtx =
            state.readingSession.active ||
            state.selectedPaperId != null ||
            (state.readingSession.sourceValue?.trim() ?? '') !== '';
          agentMode = hasReadingCtx
            ? state.readingSession.style === 'direct'
              ? 'reading_direct'
              : 'reading_guided'
            : 'reading_setup';
        }
      } else if (state.agentMode.startsWith('reading')) {
        agentMode = 'general';
      }

      const chatThreads = state.chatThreads
        .map((t) => (t.id === id ? { ...t, agent, updatedAt: Date.now() } : t))
        .sort((a, b) => b.updatedAt - a.updatedAt);

      const rightPanelByThread = {
        ...state.rightPanelByThread,
        [id]: rightPanelCards,
      };
      persistChatHistory(chatThreads, id);
      persistRightPanelByThread(rightPanelByThread);

      return {
        activeAgent: agent,
        agentMode,
        chatThreads,
        rightPanelCards,
        rightPanelByThread,
        lastReadingRightPanelByThread: lastReadingPanels,
        lastGeneralRightPanelByThread: lastGeneralPanels,
        lastLiteratureReviewRightPanelByThread: lastLitPanels,
        lastPersonalKbRightPanelByThread: lastPersonalKbPanels,
      };
    }),
  setWritingTask: (task) => set({ writingTask: task }),
  setWritingMaterial: (material) => set({ writingMaterial: material }),
  setWritingOutput: (payload) =>
    set((state) => ({
      writingOutline: payload.outline ?? state.writingOutline,
      writingDraft: payload.draft ?? state.writingDraft,
    })),
  setAgentRunState: (payload) =>
    set((state) => {
      const prev = state.agentRunState;
      const runIdChanged =
        payload.runId !== undefined && payload.runId !== prev.runId;
      const next: AgentRunState = {
        ...prev,
        ...payload,
        ...(runIdChanged && payload.thinkingNarrative === undefined
          ? { thinkingNarrative: '' }
          : {}),
      };
      const agentRunByThread = {
        ...state.agentRunByThread,
        [state.activeThreadId]: next,
      };
      persistRunStateByThread(agentRunByThread);
      return {
        agentRunState: next,
        agentRunByThread,
      };
    }),
  setResearchTaskCard: (payload) =>
    set((state) => {
      const nextCard: ResearchTaskCard = {
        ...state.researchTaskCard,
        ...payload,
        updatedAt: Date.now(),
      };
      const researchTaskByThread = {
        ...state.researchTaskByThread,
        [state.activeThreadId]: nextCard,
      };
      persistTaskCards(researchTaskByThread);
      return {
        researchTaskCard: nextCard,
        researchTaskByThread,
      };
    }),
  setTaskCardLocked: (locked) =>
    set((state) => {
      const nextCard: ResearchTaskCard = {
        ...state.researchTaskCard,
        locked,
        updatedAt: Date.now(),
      };
      const researchTaskByThread = {
        ...state.researchTaskByThread,
        [state.activeThreadId]: nextCard,
      };
      persistTaskCards(researchTaskByThread);
      return {
        researchTaskCard: nextCard,
        researchTaskByThread,
      };
    }),
  setDiscoveryOutput: (payload) =>
    set((state) => {
      const next = {
        candidatePool: payload.candidatePool ?? state.discoveryCandidatePool,
        evidenceList: payload.evidenceList ?? state.discoveryEvidenceList,
        topicClusters: payload.topicClusters ?? state.discoveryTopicClusters,
      };
      const discoveryByThread = {
        ...state.discoveryByThread,
        [state.activeThreadId]: next,
      };
      persistDiscoveryByThread(discoveryByThread);
      return {
        discoveryCandidatePool: next.candidatePool,
        discoveryEvidenceList: next.evidenceList,
        discoveryTopicClusters: next.topicClusters,
        discoveryByThread,
      };
    }),
  setRelatedWorkOutput: (payload) =>
    set((state) => {
      const next: RelatedWorkOutput = {
        items: payload.items ?? state.relatedWork.items,
        gaps: payload.gaps ?? state.relatedWork.gaps,
        summary: payload.summary ?? state.relatedWork.summary,
        updatedAt: Date.now(),
      };
      const relatedWorkByThread = {
        ...state.relatedWorkByThread,
        [state.activeThreadId]: next,
      };
      persistRelatedWorkByThread(relatedWorkByThread);
      return {
        relatedWork: next,
        relatedWorkByThread,
      };
    }),
  setLiteratureReviewLocalCandidates: (items) => set({ literatureReviewLocalCandidates: items }),
  setPendingAutoAsk: (text) => set({ pendingAutoAsk: text }),
  exitReadingToGeneral: () =>
    set((state) => {
      const id = state.activeThreadId;
      const inReading =
        state.agentMode.startsWith('reading') ||
        state.readingSession.active ||
        (state.readingSession.sourceType !== null && state.readingSession.sourceValue.trim() !== '');

      /** 与 setActiveAgent('general') 一致：恢复进入阅读前保存的自由研究侧栏，避免硬编码只剩 graph */
      const restoredGeneral: RightPanelCard[] =
        state.lastGeneralRightPanelByThread[id]?.length
          ? [...state.lastGeneralRightPanelByThread[id]]
          : ['graph'];

      let lastReadingPanels = { ...state.lastReadingRightPanelByThread };
      if (inReading) {
        const cur = state.rightPanelCards;
        if (cur.includes('paper') || cur.includes('guide')) {
          lastReadingPanels[id] = [...cur];
        }
      }

      const rightPanelByThreadBase = {
        ...state.rightPanelByThread,
        [id]: restoredGeneral,
      };
      persistRightPanelByThread(rightPanelByThreadBase);

      const chatThreads = state.chatThreads
        .map((t) => (t.id === id ? { ...t, agent: 'general' as AssistantAgent, updatedAt: Date.now() } : t))
        .sort((a, b) => b.updatedAt - a.updatedAt);
      persistChatHistory(chatThreads, id);

      if (!inReading) {
        return {
          selectedPaperId: null,
          agentMode: 'general' as AgentMode,
          rightPanelCards: restoredGeneral,
          readingSession: defaultReadingSession,
          activeAgent: 'general' as AssistantAgent,
          rightPanelByThread: rightPanelByThreadBase,
          chatThreads,
          lastReadingRightPanelByThread: lastReadingPanels,
        };
      }
      const snapshot: ReadingSuspendedSnapshot = {
        threadId: state.activeThreadId,
        selectedPaperId: state.selectedPaperId,
        readingSession: cloneReadingSession(state.readingSession),
        rightPanelCards: [...state.rightPanelCards],
        agentMode: state.agentMode,
        activeAgent: state.activeAgent,
      };
      return {
        selectedPaperId: null,
        agentMode: 'general',
        rightPanelCards: restoredGeneral,
        readingSession: defaultReadingSession,
        activeAgent: 'general',
        readingSuspendedSnapshot: snapshot,
        rightPanelByThread: rightPanelByThreadBase,
        chatThreads,
        lastReadingRightPanelByThread: lastReadingPanels,
      };
    }),
  resumeSuspendedReading: () =>
    set((state) => {
      const snap = state.readingSuspendedSnapshot;
      if (!snap || snap.threadId !== state.activeThreadId) return {};
      const rightPanelCards = [...snap.rightPanelCards];
      const rightPanelByThread = {
        ...state.rightPanelByThread,
        [state.activeThreadId]: rightPanelCards,
      };
      persistRightPanelByThread(rightPanelByThread);
      return {
        selectedPaperId: snap.selectedPaperId,
        readingSession: cloneReadingSession(snap.readingSession),
        rightPanelCards,
        agentMode: snap.agentMode,
        activeAgent: snap.activeAgent,
        readingSuspendedSnapshot: null,
        rightPanelByThread,
      };
    }),
  setPaperNote: (key, text) =>
    set((state) => {
      if (!key.trim()) return {};
      const paperNotes = { ...state.paperNotes, [key]: text };
      persistPaperNotes(paperNotes);
      return { paperNotes };
    }),

  pushModelDebug: (entry) =>
    set((state) => {
      const row: ModelDebugEntry = {
        ...entry,
        id: `dbg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        ts: Date.now(),
      };
      return { modelDebugEntries: [...state.modelDebugEntries, row].slice(-500) };
    }),

  clearModelDebug: () =>
    set((state) => ({
      modelDebugEntries: state.modelDebugEntries.filter((e) => e.threadId !== state.activeThreadId),
    })),
}));
