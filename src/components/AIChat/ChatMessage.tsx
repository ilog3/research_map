import type { ChatMessage as ChatMessageType } from '../../types';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface AssistantMessageActions {
  onCopy: () => void;
  onForward: () => void;
  onFavorite: () => void;
  onRegenerate?: () => void;
  showRegenerate?: boolean;
  disabled?: boolean;
}

interface Props {
  message: ChatMessageType;
  assistantActions?: AssistantMessageActions;
  onOpenDetails?: () => void;
}

function CompletedThinkingBlock({ narrative, lines }: { narrative?: string; lines: string[] }) {
  const [open, setOpen] = useState(false);
  const n = narrative?.trim() ?? '';
  const hasNarrative = n.length > 0;
  const hasLines = lines.length > 0;
  if (!hasNarrative && !hasLines) return null;

  const paragraphs = hasNarrative
    ? n.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    : [];

  return (
    <div className="mb-3 rounded-lg border border-violet-200 bg-violet-50/80 overflow-hidden text-left">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-[13px] text-violet-900 hover:bg-violet-100/80 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="font-medium">已完成思考</span>
        <span className="text-violet-500 shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <>
          {hasNarrative && (
            <div className="px-3 pb-2 space-y-3 text-[13px] text-violet-800 leading-relaxed border-b border-violet-100">
              {paragraphs.map((p, i) => (
                <p key={i} className="whitespace-pre-wrap first:mt-0">
                  {p}
                </p>
              ))}
            </div>
          )}
          {hasLines && (
            <ul className="list-disc pl-8 pr-3 py-2 space-y-2 text-[12px] text-violet-700 leading-relaxed">
              {lines.map((line, i) => (
                <li key={`${i}-${line.slice(0, 24)}`}>{line}</li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-1.5 px-3 pb-3 text-[11px] text-violet-600">
            <span
              className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-900/50 text-emerald-300 text-[10px]"
              aria-hidden
            >
              ✓
            </span>
            已完成
          </div>
        </>
      )}
    </div>
  );
}

function AssistantActionBar({ actions }: { actions: AssistantMessageActions }) {
  const { onCopy, onForward, onFavorite, onRegenerate, showRegenerate, disabled } = actions;
  const btn =
    'px-2 py-0.5 rounded text-[11px] border border-violet-200 bg-white text-violet-800 hover:bg-violet-50 disabled:opacity-40 disabled:pointer-events-none';
  return (
    <div className="flex flex-wrap items-center gap-1 mt-1.5 pl-0.5">
      <button type="button" className={btn} disabled={disabled} onClick={() => void onCopy()}>
        复制
      </button>
      <button type="button" className={btn} disabled={disabled} onClick={() => void onForward()}>
        转发
      </button>
      <button type="button" className={btn} disabled={disabled} onClick={() => void onFavorite()}>
        收藏
      </button>
      {showRegenerate && onRegenerate && (
        <button type="button" className={btn} disabled={disabled} onClick={() => void onRegenerate()}>
          重新生成
        </button>
      )}
    </div>
  );
}

export default function ChatMessage({ message, assistantActions, onOpenDetails }: Props) {
  const isUser = message.role === 'user';
  const narrative = !isUser ? message.thinkingNarrative?.trim() ?? '' : '';
  const thinking = !isUser ? message.thinkingTrace?.filter(Boolean) ?? [] : [];
  const showAssistantBar =
    !isUser && assistantActions && message.content.trim().length > 0;
  const isStageOutput = !isUser && /^【(Plan|Search|Code|Synthesize|Critic)\s*子Agent输出】/.test(message.content.trim());
  const stageName = isStageOutput
    ? (message.content.match(/^【(Plan|Search|Code|Synthesize|Critic)\s*子Agent输出】/)?.[1] ?? 'Agent')
    : '';
  const stageIcon: Record<string, string> = {
    Plan: '🧭',
    Search: '🔎',
    Code: '🧩',
    Synthesize: '🧠',
    Critic: '✅',
    Agent: '•',
  };
  const stageSummary = isStageOutput
    ? message.content
        .split('\n')
        .slice(1)
        .join('\n')
        .replace(/\s+/g, ' ')
        .slice(0, 90)
    : '';

  return (
    <div className="flex justify-stretch">
      <div className="flex flex-col w-full">
        <div
          className={`px-3.5 py-2.5 text-sm leading-relaxed rounded-lg border ${
            isUser
              ? 'bg-violet-100/70 border-violet-200 text-violet-900'
              : 'bg-white text-violet-950 border-violet-200'
          }`}
        >
          {isUser ? (
            <div className="whitespace-pre-wrap">{message.content}</div>
          ) : (
            <>
              {isStageOutput && (
                <div className="mb-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-1.5">
                  <div className="flex items-center gap-2 text-[12px] text-violet-800">
                    <span aria-hidden>{stageIcon[stageName] ?? stageIcon.Agent}</span>
                    <span className="font-medium shrink-0">{stageName}</span>
                    <span className="text-violet-500">·</span>
                    <span className="truncate">{stageSummary || '子 Agent 已完成本阶段输出。'}</span>
                  </div>
                  {onOpenDetails && (
                    <button
                      type="button"
                      className="mt-1 text-[10px] px-2 py-0.5 rounded border border-violet-300 bg-white text-violet-700 hover:bg-violet-100"
                      onClick={onOpenDetails}
                    >
                      在右侧查看详细思考/工具调用/回复
                    </button>
                  )}
                </div>
              )}
              {(narrative.length > 0 || thinking.length > 0) && (
                <CompletedThinkingBlock narrative={narrative || undefined} lines={thinking} />
              )}
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ ...props }) => (
                    <a
                      {...props}
                      target="_blank"
                      rel="noreferrer"
                      className="text-violet-600 underline underline-offset-2 hover:text-violet-800"
                    />
                  ),
                  code: ({ className, children, ...props }) => {
                    const isBlock = className?.startsWith('language-');
                    if (isBlock) {
                      return (
                        <code
                          {...props}
                          className="block whitespace-pre overflow-x-auto rounded bg-violet-50 border border-violet-100 px-2 py-1 text-xs text-violet-900 my-2"
                        >
                          {children}
                        </code>
                      );
                    }
                    return (
                      <code
                        {...props}
                        className="rounded bg-violet-50 border border-violet-100 px-1 py-0.5 text-xs text-violet-900"
                      >
                        {children}
                      </code>
                    );
                  },
                  ul: ({ ...props }) => <ul {...props} className="list-disc pl-5 my-1" />,
                  ol: ({ ...props }) => <ol {...props} className="list-decimal pl-5 my-1" />,
                  p: ({ ...props }) => <p {...props} className="my-1" />,
                }}
              >
                {isStageOutput ? '' : message.content}
              </ReactMarkdown>
            </>
          )}
        </div>
        {showAssistantBar && <AssistantActionBar actions={assistantActions} />}
      </div>
    </div>
  );
}
