export interface Paper {
  id: string;
  title: string;
  titleEn: string;
  authors: string[];
  institution: string;
  journal: string;
  year: number;
  keywords: string[];
  keywordsEn: string[];
  abstract: string;
  clusterId: number;
  embedding: [number, number, number];
  coreJournal: boolean;
  /** 可直接用于 iframe 预览的 PDF 绝对地址（如同域对象存储签名 URL、或 arXiv `/pdf/xxx`） */
  pdfUrl?: string;
  /** 开放获取 PDF 镜像（与 pdfUrl 二选一即可） */
  openAccessPdfUrl?: string;
  /** DOI 字符串，可用于跳转或后端解析真实 PDF，本身不一定能直接 iframe */
  doi?: string;
}

export interface Cluster {
  id: number;
  name: string;
  color: string;
  count: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** 助手消息：对用户可见的思考要点（已过滤内部标签/JSON），在气泡内可折叠展示 */
  thinkingTrace?: string[];
  /** 研究规划等：长文式思考（多段正文），与最终答复独立保存，生成最终回复后仍保留 */
  thinkingNarrative?: string;
}

/** 调试台：区分「模型原始输出 / 展示用思考 / 最终答复 / 元信息」 */
export type ModelDebugKind = 'raw_llm' | 'user_thinking' | 'final_answer' | 'meta';

export interface ModelDebugEntry {
  id: string;
  ts: number;
  threadId: string;
  runId?: string;
  /** 业务阶段，如 framing、discovery、reading、intent_route */
  phase: string;
  kind: ModelDebugKind;
  label: string;
  content: string;
}

export interface ChatThread {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
  agent: AssistantAgent;
}

export type AssistantAgent = 'general' | 'reading' | 'writing' | 'literature_review' | 'personal_kb';

export type AgentMode = 'general' | 'reading_setup' | 'reading_guided' | 'reading_direct';

export type ReadingSourceType = 'upload' | 'url' | 'intent' | 'paper_graph';

export type ReadingDepth = 'quick' | 'standard' | 'deep' | 'adaptive';

export type RightPanelCard =
  | 'paper'
  | 'guide'
  | 'evidence'
  | 'kb_assets'
  /** 个人知识库助手：结构化任务结果（独立标签，与「知识资产」分离） */
  | 'kb_result'
  | 'tools'
  | 'reasoning'
  | 'graph'
  | 'mindmap'
  | 'notes'
  | 'task'
  | 'material'
  | 'outline'
  | 'draft'
  | 'candidate'
  /** Web 检索结果页预览（Scholar/Web） */
  | 'web_search'
  | 'local_graph'
  | 'related_work'
  /** 综述助手：成稿、引用、证据链、框架、编辑 */
  | 'lit_main'
  | 'lit_citations'
  | 'lit_evidence'
  | 'lit_outline'
  | 'lit_edit';
export type WritingPanelCard = 'task' | 'material' | 'outline' | 'draft' | 'tools' | 'reasoning';

export interface EvidenceRef {
  id: string;
  label: string;
  snippet: string;
  page?: number;
}

export interface ToolTraceItem {
  id: string;
  tool: string;
  status: 'running' | 'completed' | 'failed';
  summary: string;
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

export interface AgentRunState {
  runId: string;
  agent: AssistantAgent | 'framing';
  status: 'idle' | 'running' | 'completed' | 'failed';
  startedAt: number | null;
  endedAt: number | null;
  error?: string;
  lastHttpUrl?: string;
  lastHttpStatus?: number | null;
  thoughtTrace?: string[];
  /** 研究规划长文思考（与 thoughtTrace 短句并存，供侧栏/同步） */
  thinkingNarrative?: string;
  stageDetails?: Array<{
    id: string;
    cycle: number;
    stage: 'Plan' | 'Search' | 'Code' | 'Synthesize' | 'Critic';
    status: 'running' | 'completed';
    summary: string;
    detail: string;
  }>;
  toolTrace?: ToolTraceItem[];
  timeline?: DiscoveryTimelineItem[];
}

export interface ResearchTaskCard {
  problemStatement: string;
  rqList: string[];
  scopeInclude: string[];
  scopeExclude: string[];
  constraints: string[];
  successCriteria: string[];
  /** Framing 返回给用户的可交付正文（如访谈提纲），展示在自由研究右侧任务卡 */
  framingOutput?: string;
  updatedAt: number;
  locked?: boolean;
  source?: 'auto' | 'manual';
}

export interface DiscoveryCandidateItem {
  title: string;
  type: 'paper' | 'report' | 'blog' | 'repo' | 'other';
  source: string;
  credibility: number;
  reason: string;
  url?: string;
  /** 个人知识库 IndexedDB 中的 PDF id，用于文献综述前拉取全文并解析 */
  localPdfId?: string;
}

/** 个人知识库 PDF 经解析接口得到的、用于综述提示的内容 */
export interface PersonalLibraryParsedDocumentForReview {
  fileLabel: string;
  parseError?: string;
  title?: string;
  abstract?: string;
  keywords?: string[];
  authors?: string[];
  year?: number;
  /** 摘要 + 正文片段拼接，已截断 */
  excerptText: string;
}

export interface RelatedWorkItem {
  title: string;
  method: string;
  data: string;
  metric: string;
  limitation: string;
  source?: string;
  url?: string;
}

export interface RelatedWorkOutput {
  items: RelatedWorkItem[];
  gaps: string[];
  summary: string;
  updatedAt: number;
}

/** 个人知识库助手：侧栏「任务结果」结构化区块 */
export interface PersonalKbWorkbenchSection {
  heading: string;
  body: string;
}

/** 个人知识库助手：最近一次回复在右侧信息栏的固定展示（避免仅依赖气泡被其它会话覆盖） */
export interface PersonalKbWorkbenchSnapshot {
  threadId: string;
  userQuery: string;
  /** 已净化、面向用户展示的正文（Markdown，含 ## 小节） */
  assistantText: string;
  /** 由 assistantText 解析，供卡片化展示 */
  sections?: PersonalKbWorkbenchSection[];
  updatedAt: number;
}

export interface RetrievalPreviewMeta {
  keywords: string[];
  queries: string[];
}

export interface ParsedPaperMeta {
  title?: string;
  authors: string[];
  institution?: string;
  year?: number;
  doi?: string;
  keywords: string[];
  abstract?: string;
  journal?: string;
}

export interface ReadingSession {
  active: boolean;
  sourceType: ReadingSourceType | null;
  sourceValue: string;
  paperTitle: string;
  goal: string;
  depth: ReadingDepth;
  style: 'guided' | 'direct';
  nextQuestion: string;
  lastAnswer: string;
  evidenceRefs: EvidenceRef[];
  toolTrace: ToolTraceItem[];
  reasoningTrace: string[];
  previewUrl: string;
  parsing: boolean;
  parseError: string;
  activeEvidenceId: string | null;
  parsedMeta: ParsedPaperMeta | null;
}

/** 点击「返回通用」前保存，用于一键恢复阅读侧栏与会话态（按会话隔离） */
export interface ReadingSuspendedSnapshot {
  threadId: string;
  selectedPaperId: string | null;
  readingSession: ReadingSession;
  rightPanelCards: RightPanelCard[];
  agentMode: AgentMode;
  activeAgent: AssistantAgent;
}

/**
 * 与对话线程绑定的侧栏信息态（阅读 PDF/图谱、写作材料等）。
 * 存于 store 的 workspaceByThread，切换会话时保存/恢复，避免全局单例互相覆盖。
 */
export interface ThreadWorkspaceSnapshot {
  selectedPaperId: string | null;
  readingSession: ReadingSession;
  agentMode: AgentMode;
  writingTask: string;
  writingMaterial: string;
  writingOutline: string[];
  writingDraft: string;
  /** 综述助手侧栏可编辑成稿 */
  literatureReviewDraft: string;
  /** 与 store 顶层 readingSuspendedSnapshot 对应，按会话保存「返回通用」前的阅读态 */
  readingSuspendedSnapshot: ReadingSuspendedSnapshot | null;
}

export interface ParsedDocChunk {
  id: string;
  page: number;
  text: string;
  section?: string;
}
