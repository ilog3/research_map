import type { AssistantAgent, PersonalKbWorkbenchSnapshot, ReadingSession, ResearchTaskCard, RightPanelCard, RelatedWorkOutput } from '../types';

export type PlannerUiComplexity = 'minimal' | 'standard' | 'expert';
export type PlannerPanelCard = RightPanelCard | 'task' | 'material' | 'outline' | 'draft';

export interface PanelPlannerInput {
  uiComplexity: PlannerUiComplexity;
  baseCards: PlannerPanelCard[];
  hasMessages: boolean;
  activeAgent: AssistantAgent;
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
  const hasRunDetails = Boolean(input.hasMessages && (discoveryCandidateCount > 0 || hasRelatedWork || hasTaskCard));

  const order: PlannerPanelCard[] = [];
  const pushIf = (card: PlannerPanelCard, cond: boolean) => {
    if (cond && !order.includes(card)) order.push(card);
  };

  pushIf('graph', true);
  pushIf('candidate', discoveryCandidateCount > 0);
  pushIf('web_search', hasSearchPreview);
  pushIf('related_work', hasRelatedWork);
  pushIf('tools', hasRunDetails && activeAgent === 'general');
  pushIf('task', hasTaskCard && activeAgent !== 'personal_kb');
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
