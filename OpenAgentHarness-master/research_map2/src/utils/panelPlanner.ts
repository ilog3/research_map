import type { AssistantAgent, PersonalKbWorkbenchSnapshot, ReadingSession, ResearchTaskCard, RightPanelCard, RelatedWorkOutput } from '../types';

export type PlannerUiComplexity = 'minimal' | 'standard' | 'expert';
export type PlannerPanelCard = RightPanelCard | 'task' | 'material' | 'outline' | 'draft';

export interface PanelPlannerInput {
  uiComplexity: PlannerUiComplexity;
  baseCards: PlannerPanelCard[];
  hasMessages: boolean;
  activeAgent: AssistantAgent;
  /** general 助手正在执行（研究规划或 Orchestrator），用于尽早展示「思考过程」标签 */
  generalAssistantRunning?: boolean;
  /** 已有 Plan→Critic 子阶段明细时也应展示工具/思考面板 */
  orchestratorStageDetailCount?: number;
  selectedPaperId: string | null;
  readingSession: ReadingSession;
  researchTaskCard: ResearchTaskCard;
  discoveryCandidateCount: number;
  discoveryTopicClusterCount: number;
  relatedWork: RelatedWorkOutput;
  literatureReviewDraft: string;
  writingTask: string;
  writingMaterial: string;
  writingOutlineCount: number;
  writingDraft: string;
  personalKbWorkbench: PersonalKbWorkbenchSnapshot | null;
  activeThreadId: string;
  hasSearchPreview: boolean;
}

export function planRightPanelCards(input: PanelPlannerInput): PlannerPanelCard[] {
  const {
    uiComplexity,
    baseCards,
    activeAgent,
    selectedPaperId,
    readingSession,
    researchTaskCard,
    discoveryCandidateCount,
    discoveryTopicClusterCount,
    relatedWork,
    literatureReviewDraft,
    writingTask,
    writingMaterial,
    writingOutlineCount,
    writingDraft,
    personalKbWorkbench,
    activeThreadId,
    hasSearchPreview,
  } = input;

  const hasReadingDocContext =
    Boolean(selectedPaperId) ||
    Boolean(readingSession.previewUrl?.trim()) ||
    Boolean(readingSession.sourceValue?.trim()) ||
    Boolean(readingSession.paperTitle?.trim());
  const hasTaskCard = Boolean(
    researchTaskCard.problemStatement?.trim() ||
      researchTaskCard.rqList.length ||
      researchTaskCard.scopeInclude.length ||
      researchTaskCard.scopeExclude.length ||
      researchTaskCard.constraints.length ||
      researchTaskCard.successCriteria.length ||
      researchTaskCard.framingOutput?.trim()
  );
  const hasRelatedWork = Boolean(
    relatedWork.items.length || relatedWork.summary.trim() || relatedWork.gaps.length
  );
  const hasLitOutput = Boolean(
    literatureReviewDraft.trim() || relatedWork.items.length || relatedWork.summary.trim() || relatedWork.gaps.length
  );
  const hasWritingOutput = Boolean(
    writingTask.trim() || writingMaterial.trim() || writingOutlineCount || writingDraft.trim()
  );
  const hasKbResult = Boolean(
    personalKbWorkbench &&
      personalKbWorkbench.threadId === activeThreadId &&
      personalKbWorkbench.assistantText.trim()
  );
  const hasRunDetails = Boolean(
    input.hasMessages &&
      (discoveryCandidateCount > 0 ||
        hasRelatedWork ||
        hasTaskCard ||
        input.generalAssistantRunning ||
        (input.orchestratorStageDetailCount ?? 0) > 0)
  );
  const hasReadingRunDetails = Boolean(
    input.hasMessages &&
      activeAgent === 'reading' &&
      ((readingSession.reasoningTrace?.length ?? 0) > 0 || (readingSession.toolTrace?.length ?? 0) > 0)
  );
  const wantsToolsInReading = activeAgent === 'reading' && (baseCards as string[]).includes('tools');

  const order: PlannerPanelCard[] = [];
  const pushIf = (card: PlannerPanelCard, cond: boolean) => {
    if (cond && !order.includes(card)) order.push(card);
  };

  pushIf('graph', true);
  pushIf('candidate', discoveryCandidateCount > 0);
  pushIf('web_search', hasSearchPreview);
  pushIf('related_work', hasRelatedWork);
  pushIf(
    'tools',
    (hasRunDetails && activeAgent === 'general') || hasReadingRunDetails || wantsToolsInReading
  );
  // 任务卡仍保存在状态里供编排与快照使用，但不再作为右栏显式卡片展示。
  pushIf('paper', hasReadingDocContext);
  pushIf('evidence', readingSession.evidenceRefs.length > 0);
  pushIf('draft', hasWritingOutput);
  pushIf('lit_main', hasLitOutput);
  pushIf('kb_assets', activeAgent === 'personal_kb');
  pushIf('kb_result', activeAgent === 'personal_kb' && hasKbResult);

  if (uiComplexity !== 'minimal') {
    pushIf('local_graph', hasTaskCard || discoveryTopicClusterCount > 0 || discoveryCandidateCount > 0);
    pushIf('lit_citations', relatedWork.items.length > 0);
    pushIf('lit_evidence', hasRelatedWork);
  }
  if (uiComplexity === 'expert') {
    pushIf('guide', hasReadingDocContext);
    pushIf('mindmap', Boolean(selectedPaperId || readingSession.paperTitle?.trim()));
    pushIf('notes', Boolean(selectedPaperId));
    pushIf('material', Boolean(writingMaterial.trim()));
    pushIf('outline', writingOutlineCount > 0);
    pushIf('lit_outline', Boolean(hasLitOutput || researchTaskCard.rqList.length));
    pushIf('lit_edit', Boolean(literatureReviewDraft.trim()));
  }

  if (order.length === 0) return ['graph'];
  return order.filter((c) => (baseCards as string[]).includes(c) || c === 'graph' || c === 'web_search');
}
