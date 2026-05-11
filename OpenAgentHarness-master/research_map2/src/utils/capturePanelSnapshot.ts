import { useStore } from '../store';
import type { AssistantMessagePanelSnapshot } from '../types';

function cloneAgentRunPatch(
  a: ReturnType<typeof useStore.getState>['agentRunState']
): AssistantMessagePanelSnapshot['agentRun'] {
  return {
    agent: a.agent,
    status: a.status,
    runId: a.runId,
    startedAt: a.startedAt,
    endedAt: a.endedAt,
    error: a.error,
    lastHttpUrl: a.lastHttpUrl,
    lastHttpStatus: a.lastHttpStatus,
    thoughtTrace: a.thoughtTrace ? [...a.thoughtTrace] : undefined,
    thinkingNarrative: a.thinkingNarrative,
    toolTrace: a.toolTrace ? a.toolTrace.map((x) => ({ ...x })) : undefined,
    stageDetails: a.stageDetails ? a.stageDetails.map((x) => ({ ...x })) : undefined,
    timeline: a.timeline ? a.timeline.map((x) => ({ ...x })) : undefined,
  };
}

/** 在助手消息写入最终内容之前调用（此时 store 已反映本轮 setState） */
export function captureAssistantPanelSnapshot(): AssistantMessagePanelSnapshot {
  const s = useStore.getState();
  const rs = s.readingSession;
  return {
    capturedAt: Date.now(),
    reading: {
      goal: rs.goal,
      nextQuestion: rs.nextQuestion,
      lastAnswer: rs.lastAnswer,
      evidenceRefs: rs.evidenceRefs.map((x) => ({ ...x })),
      toolTrace: rs.toolTrace.map((x) => ({ ...x })),
      reasoningTrace: [...rs.reasoningTrace],
    },
    agentRun: cloneAgentRunPatch(s.agentRunState),
    discovery: {
      candidatePool: s.discoveryCandidatePool.map((x) => ({ ...x })),
      evidenceList: [...s.discoveryEvidenceList],
      topicClusters: [...s.discoveryTopicClusters],
    },
    retrievalMeta: s.retrievalPreviewMeta
      ? {
          keywords: [...s.retrievalPreviewMeta.keywords],
          queries: [...s.retrievalPreviewMeta.queries],
        }
      : null,
    researchTaskCard: {
      ...s.researchTaskCard,
      rqList: [...s.researchTaskCard.rqList],
      scopeInclude: [...s.researchTaskCard.scopeInclude],
      scopeExclude: [...s.researchTaskCard.scopeExclude],
      constraints: [...s.researchTaskCard.constraints],
      successCriteria: [...s.researchTaskCard.successCriteria],
    },
    relatedWork: {
      items: s.relatedWork.items.map((x) => ({ ...x })),
      gaps: [...s.relatedWork.gaps],
      summary: s.relatedWork.summary,
      updatedAt: s.relatedWork.updatedAt,
    },
    writingOutline: [...s.writingOutline],
    writingDraft: s.writingDraft,
    literatureReviewDraft: s.literatureReviewDraft,
    personalKbWorkbench: s.personalKbWorkbench
      ? {
          ...s.personalKbWorkbench,
          sections: s.personalKbWorkbench.sections?.map((sec) => ({ ...sec })),
        }
      : null,
    rightPanelCards: [...s.rightPanelCards],
  };
}
